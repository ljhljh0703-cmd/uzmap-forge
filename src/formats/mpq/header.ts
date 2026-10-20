/**
 * MPQ v1 헤더 탐색. .w3x = 512바이트 HM3W 래퍼 + 0x200부터 MPQ 데이터
 * (직접 `MPQ\x1a` 또는 user-data shunt `MPQ\x1b`).
 *
 * 실측 주의: GemTower_Max_7C.w3x(fixtures/maps/, 커밋 안 됨)를 열어보면
 * 0x200 shunt.headerOffset이 가리키는 위치는 진짜 헤더가 아니라 magic+headerSize만
 * 그럴듯한 "미끼"였고(맵 프로텍터가 흔히 쓰는 수법), 진짜 헤더는 0x200-정렬 위치를
 * 순차 스캔해야 찾을 수 있었다(본 파일 기준 0xC00 등, 실측값은 맵마다 다름).
 * 이는 StormLib `SFileOpenArchive.cpp`의 실제 동작과 일치한다 — 주석 원문:
 * "Warcraft III does not check for user data, which is abused by many map protectors."
 * (https://github.com/ladislav-zezula/StormLib/blob/master/src/SFileOpenArchive.cpp)
 * Storm.dll은 헤더 크기가 정확히 0x20(=32, v1 고정값)인지도 검사한다 — 미끼 판별에 사용.
 *
 * 따라서 이 리더는 "shunt를 우선 신뢰"가 아니라 "0x200 스텝 스캔이 1차, shunt는
 * 후보를 하나 더 얹어주는 힌트"로 구현한다 — 프로텍션 우회(deny-first #2) 기능이 아니라
 * 표준 MPQ 오프너 동작 그 자체이며, 못 찾으면 그냥 에러를 던진다(크래킹 없음).
 *
 * 헤더 검증 정책 (2026-07-07 R-102b, 실측 정정):
 *   초판은 "headerSize==0x20 && formatVersion==0" 필드 일치로 미끼를 걸렀으나, 실측 결과
 *   진짜 헤더도 이 두 *장식 필드*가 오염돼 있었다(프로텍터가 덮음). 게임이 실제로 읽는
 *   hashTablePos/개수/sectorShift는 멀쩡했다. 그래서 검증 기준을 필드 일치가 아니라
 *   "선언된 위치의 해시테이블이 표준 키로 복호화되어 필수 war3map.* 항목을 담고 있는가"로
 *   바꾼다(clean 맵은 필드 일치 fast-path로 그대로 통과 — 회귀 없음).
 *   ── 프로텍션 경계(deny-first 준수): 여기서 하는 일은 WC3·표준 MPQ 라이브러리가 이미 하는
 *   "견고한 아카이브 오픈"까지다. 의도적으로 제거된 listfile 복원으로 숨긴 파일 열거, 미지의
 *   파일 암호화 키 브루트포스, 트리거 난독화 해제 같은 *적극적 deprotect*는 스코프 밖이며
 *   구현하지 않는다. 표준 리더로 못 여는 맵은 "보호맵 — 지원 불가"로 보고하고 멈춘다.
 */
import { MpqFormatError } from "./errors.ts";
import { hashString, decryptBlock, HashType } from "./crypto.ts";

const SCAN_STEP = 0x200;
const MPQ_HEADER_SIZE_V1 = 0x20;

/** 견고 검증용 — .w3x면 사실상 항상 존재하는 필수 내부 파일들(하나만 매치돼도 진짜 헤더). */
const W3X_PROBE_FILES = [
  "war3map.w3i",
  "war3map.w3e",
  "war3map.j",
  "war3map.w3a",
  "war3map.wts",
  "war3mapUnits.doo",
  "(listfile)",
];
const HASH_ENTRY_SIZE = 16;

export interface MpqHeader {
  /** 아카이브(헤더) 시작 오프셋 — 이후 모든 테이블/파일 오프셋의 기준점. */
  headerStart: number;
  headerSize: number;
  archiveSize: number;
  formatVersion: number;
  sectorSizeShift: number;
  /** 512 << sectorSizeShift */
  sectorSize: number;
  /** headerStart 기준 상대 오프셋. */
  hashTableOffset: number;
  /** headerStart 기준 상대 오프셋. */
  blockTableOffset: number;
  hashTableEntries: number;
  blockTableEntries: number;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function magicAt(bytes: Uint8Array, offset: number): string | null {
  if (offset + 4 > bytes.length) return null;
  if (bytes[offset] !== 0x4d || bytes[offset + 1] !== 0x50 || bytes[offset + 2] !== 0x51) return null;
  if (bytes[offset + 3] === 0x1a) return "header";
  if (bytes[offset + 3] === 0x1b) return "userdata";
  return null;
}

/**
 * offset 위치를 v1 헤더 후보로 파싱·검증한다. 구조적으로 말이 안 되면(미끼 포함) null.
 * 검증 기준은 archiveSize 필드를 신뢰하지 않고 실제 버퍼 잔여 길이로 테이블 범위를 확인한다
 * (archiveSize 자체도 프로텍터가 조작하는 필드이므로).
 */
/**
 * 선언된 위치의 해시테이블을 표준 키로 복호화해 필수 war3map.* 항목이 하나라도 잡히면 true.
 * 오염 필드를 가진 진짜 헤더(프로텍트 맵)와 magic만 맞는 미끼를 구분하는 견고 판별자다.
 * (해시 엔트리: name1 u32, name2 u32, locale u16, platform u16, blockIndex u32 = 16바이트)
 */
function hashTableResolvesW3xFile(
  bytes: Uint8Array,
  headerStart: number,
  hashTableOffset: number,
  hashTableEntries: number,
): boolean {
  // MPQ 오프셋은 32비트 모듈러 — 프로텍터가 음수(랩어라운드) 오프셋으로 테이블을 파일 앞쪽에
  // 두는 경우가 흔하다(실측: blockPos=0xfffff620 → 헤더-0x9e0). 랩 후 실제 버퍼 범위로 검증.
  const abs = (headerStart + hashTableOffset) >>> 0;
  if (abs + hashTableEntries * HASH_ENTRY_SIZE > bytes.length) return false;

  // 복호화는 제자리 변형이므로 복사본에서 수행(원본 아카이브 바이트 보존).
  const table = bytes.slice(abs, abs + hashTableEntries * HASH_ENTRY_SIZE);
  decryptBlock(table, hashString("(hash table)", HashType.FILE_KEY));
  const dv = new DataView(table.buffer, table.byteOffset, table.byteLength);

  for (const name of W3X_PROBE_FILES) {
    const a = hashString(name, HashType.NAME_A) >>> 0;
    const b = hashString(name, HashType.NAME_B) >>> 0;
    for (let e = 0; e < hashTableEntries; e++) {
      if (dv.getUint32(e * HASH_ENTRY_SIZE, true) === a && dv.getUint32(e * HASH_ENTRY_SIZE + 4, true) === b) {
        return true;
      }
    }
  }
  return false;
}

/**
 * offset 위치를 v1 헤더 후보로 파싱·검증한다. 구조적으로 말이 안 되면(미끼 포함) null.
 * archiveSize 필드는 신뢰하지 않고 실제 버퍼 잔여 길이로 테이블 범위를 확인한다
 * (archiveSize 자체도 프로텍터가 조작하는 필드이므로).
 *
 * 인정 기준 2단계:
 *   A(clean fast-path): headerSize==0x20 && formatVersion==0 && 구조 유효 → 즉시 인정.
 *     (해시테이블 내용을 안 봐도 됨 — 합성/정상 맵은 war3map.* 없이도 유효.)
 *   B(오염 헤더): 장식 필드가 쓰레기라도, 구조가 유효하고 해시테이블이 진짜 war3map.*로
 *     복호화되면 인정 → 실측 프로텍트 맵 대응. (미끼는 테이블 복호화에서 탈락.)
 */
function tryParseHeaderAt(bytes: Uint8Array, offset: number): MpqHeader | null {
  if (offset < 0 || offset + MPQ_HEADER_SIZE_V1 > bytes.length) return null;
  if (magicAt(bytes, offset) !== "header") return null;

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerSize = dv.getUint32(offset + 4, true);
  const archiveSize = dv.getUint32(offset + 8, true);
  const formatVersion = dv.getUint16(offset + 12, true);
  const sectorSizeShift = dv.getUint16(offset + 14, true);
  const hashTableOffset = dv.getUint32(offset + 16, true);
  const blockTableOffset = dv.getUint32(offset + 20, true);
  const hashTableEntries = dv.getUint32(offset + 24, true);
  const blockTableEntries = dv.getUint32(offset + 28, true);

  // ── 구조 검증(오염돼도 게임이 읽는 필드만 신뢰). sectorShift는 게임이 읽으므로 유효값 가정.
  if (sectorSizeShift > 16) return null; // 512<<16=32MB 섹터는 비현실적
  if (!isPowerOfTwo(hashTableEntries)) return null; // 마스크 조회 전제
  if (hashTableEntries > 0x40000) return null; // 4M 엔트리 이상은 비현실적 — 미끼/오염 필터
  // 테이블 위치는 32비트 모듈러(랩어라운드) — 프로텍터가 음수 오프셋으로 테이블을 앞쪽에 두는
  // 실측 사례(blockPos=0xfffff620) 대응. 랩 후 실제 버퍼 범위로 검증(StormLib와 동일 동작).
  const hashAbs = (offset + hashTableOffset) >>> 0;
  const blockAbs = (offset + blockTableOffset) >>> 0;
  if (hashAbs + hashTableEntries * HASH_ENTRY_SIZE > bytes.length) return null;
  if (blockAbs + blockTableEntries * HASH_ENTRY_SIZE > bytes.length) return null;

  const cleanFields = headerSize === MPQ_HEADER_SIZE_V1 && formatVersion === 0;
  const accepted = cleanFields || hashTableResolvesW3xFile(bytes, offset, hashTableOffset, hashTableEntries);
  if (!accepted) return null;

  return {
    headerStart: offset,
    headerSize,
    archiveSize,
    formatVersion,
    sectorSizeShift,
    sectorSize: 512 << sectorSizeShift,
    hashTableOffset,
    blockTableOffset,
    hashTableEntries,
    blockTableEntries,
  };
}

/**
 * 아카이브 전체 바이트에서 유효한 MPQ v1 헤더를 찾는다.
 * `bytes`는 .w3x 파일 전체(HM3W 512B 포함)를 넘겨도 되고, MPQ만 넘겨도 된다 —
 * 스캔이 어느 쪽이든 0x200 경계에서 찾아낸다.
 */
export function locateHeader(bytes: Uint8Array): MpqHeader {
  for (let offset = 0; offset + 4 <= bytes.length; offset += SCAN_STEP) {
    const kind = magicAt(bytes, offset);

    if (kind === "header") {
      const header = tryParseHeaderAt(bytes, offset);
      if (header) return header;
      // 미끼였음 — 스캔 계속
      continue;
    }

    if (kind === "userdata" && offset + 12 <= bytes.length) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const headerOffset = dv.getUint32(offset + 8, true);
      const candidate = offset + headerOffset;
      if (candidate !== offset) {
        const header = tryParseHeaderAt(bytes, candidate);
        if (header) return header;
      }
      // shunt의 headerOffset이 손상됐어도(프로텍터) 바깥 스캔 루프가 계속 진행된다.
    }
  }

  throw new MpqFormatError(
    "MPQ header not found (no valid MPQ\\x1a at any 0x200-aligned offset, direct or via user-data shunt)",
  );
}
