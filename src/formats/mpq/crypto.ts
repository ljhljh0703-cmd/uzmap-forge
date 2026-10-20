/**
 * Blizzard MPQ 암호화 프리미티브 — clean-room 재구현.
 *
 * 알고리즘은 MoPaQ 포맷의 공개된 사실이며(원 저작권 대상 아님, AGENTS.md MIT-derived 정책),
 * StormLib(ladislav-zezula/StormLib, MIT) `src/SBaseCommon.cpp`의
 * `InitializeMpqCryptography` / `HashString` / `EncryptMpqBlock` / `DecryptMpqBlock`
 * 비트 연산을 웹 검색으로 대조·검증했다 (코드는 옮기지 않고 독립 구현, zero-copy).
 * 참고: https://github.com/ladislav-zezula/StormLib/blob/master/src/SBaseCommon.cpp
 *
 * 부수효과 없음(암호 테이블은 모듈 로드 시 1회 결정론적으로 파생) — ARCHITECTURE.md
 * `src/formats/` 계약(순수 함수, DOM/sim import 0) 준수.
 */

/** hashString의 해시 타입. 0=해시테이블 인덱스, 1/2=파일명 검증용 A/B, 3=파일 키. */
export const HashType = {
  TABLE_OFFSET: 0,
  NAME_A: 1,
  NAME_B: 2,
  FILE_KEY: 3,
} as const;

/** DecryptMpqBlock/EncryptMpqBlock의 두 번째 시드 믹스에 쓰이는 서브테이블 오프셋. */
const KEY2_MIX_OFFSET = 0x400;

function buildCryptTable(): Uint32Array {
  const table = new Uint32Array(0x500);
  let seed = 0x00100001;

  for (let index1 = 0; index1 < 0x100; index1++) {
    let index2 = index1;
    for (let i = 0; i < 5; i++, index2 += 0x100) {
      seed = (seed * 125 + 3) % 0x2aaaab;
      const temp1 = (seed & 0xffff) << 0x10;

      seed = (seed * 125 + 3) % 0x2aaaab;
      const temp2 = seed & 0xffff;

      table[index2] = (temp1 | temp2) >>> 0;
    }
  }

  return table;
}

/** 0x500 엔트리 암호 테이블. 시드 0x00100001 결정론 파생 — Math.random 미사용. */
const CRYPT_TABLE = buildCryptTable();

/**
 * MPQ 문자열 해시. 입력은 대문자화되어 처리된다(슬래시→백슬래시 치환은 하지 않음 —
 * StormLib의 `HashStringSlash`가 실제 아카이브 오픈 시 기본으로 쓰이는 변형이며,
 * WC3 내부 파일명은 백슬래시 표기라 이 프로젝트 범위에서는 무해하다).
 */
export function hashString(input: string, hashType: number): number {
  let seed1 = 0x7fed7fed;
  let seed2 = 0xeeeeeeee;
  const typeBase = (hashType << 8) >>> 0;
  const upper = input.toUpperCase();

  for (let i = 0; i < upper.length; i++) {
    const ch = upper.charCodeAt(i) & 0xff;
    seed1 = (CRYPT_TABLE[typeBase + ch]! ^ (seed1 + seed2)) >>> 0;
    seed2 = (ch + seed1 + seed2 + (seed2 << 5) + 3) >>> 0;
  }

  return seed1 >>> 0;
}

/** dwKey1 = ((~dwKey1 << 0x15) + 0x11111111) | (dwKey1 >> 0x0B) — StormLib와 동일 키 전개. */
function advanceKey(key: number): number {
  const notKeyShifted = (~key << 0x15) >>> 0;
  const part1 = (notKeyShifted + 0x11111111) >>> 0;
  const part2 = key >>> 0x0b;
  return (part1 | part2) >>> 0;
}

/**
 * MPQ 블록(해시테이블/블록테이블/섹터/섹터오프셋테이블) 복호화. 제자리(in-place) 수정.
 * DataView로 바이트 단위 접근하므로 byteOffset이 4의 배수가 아닌 서브배열에도 안전하다.
 * 길이가 4의 배수가 아니면 마지막 1~3바이트는 손대지 않는다(StormLib `dwLength >>= 2`와 동일 동작).
 */
export function decryptBlock(bytes: Uint8Array, key: number): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dwordCount = bytes.length >>> 2;
  let seed2 = 0xeeeeeeee;
  let k = key >>> 0;

  for (let i = 0; i < dwordCount; i++) {
    seed2 = (seed2 + CRYPT_TABLE[KEY2_MIX_OFFSET + (k & 0xff)]!) >>> 0;
    const cipher = dv.getUint32(i * 4, true);
    const plain = (cipher ^ ((k + seed2) >>> 0)) >>> 0;
    dv.setUint32(i * 4, plain, true);

    k = advanceKey(k);
    seed2 = (plain + seed2 + (seed2 << 5) + 3) >>> 0;
  }
}

/** decryptBlock의 역연산. 합성 fixture 라운드트립 증명 및 테스트 전용 writer에서 사용. */
export function encryptBlock(bytes: Uint8Array, key: number): void {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dwordCount = bytes.length >>> 2;
  let seed2 = 0xeeeeeeee;
  let k = key >>> 0;

  for (let i = 0; i < dwordCount; i++) {
    seed2 = (seed2 + CRYPT_TABLE[KEY2_MIX_OFFSET + (k & 0xff)]!) >>> 0;
    const plain = dv.getUint32(i * 4, true);
    const cipher = (plain ^ ((k + seed2) >>> 0)) >>> 0;
    dv.setUint32(i * 4, cipher, true);

    k = advanceKey(k);
    seed2 = (plain + seed2 + (seed2 << 5) + 3) >>> 0;
  }
}
