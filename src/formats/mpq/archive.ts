/**
 * MPQ 아카이브 리더 — 해시/블록 테이블, 섹터 압축 해제, 파일 조회.
 * src/formats/ 계약: 순수 함수만, 부수효과 0, sim/DOM import 없음.
 *
 * 필드 레이아웃·상수는 R-102 기술 orientation + StormLib 소스 대조(SBaseCommon.cpp,
 * SFileReadFile.cpp — 웹 검색으로 확인, 코드는 옮기지 않고 독립 구현)로 검증했다.
 * 특히 "섹터별 복호화 키 = fileKey + 섹터인덱스"는 orientation 문서에 명시되지 않았던
 * 부분이라 StormLib `ReadMpqSectors`의 `DecryptMpqBlock(pbInSector, ..., hf->dwFileKey + dwIndex)`
 * 호출로 재확인 후 반영했다.
 */
import { inflateZlib } from "./inflate.ts";
import { hashString, decryptBlock, HashType } from "./crypto.ts";
import { locateHeader, type MpqHeader } from "./header.ts";
import { MpqFileNotFoundError, UnsupportedCompressionError } from "./errors.ts";

export const BlockFlag = {
  EXISTS: 0x80000000,
  IMPLODE: 0x00000100,
  COMPRESS: 0x00000200,
  ENCRYPTED: 0x00010000,
  FIX_KEY: 0x00020000,
  SINGLE_UNIT: 0x01000000,
} as const;

const COMPRESSION_ZLIB = 0x02;

/**
 * 헤더 상대 오프셋 → 절대 위치. MPQ 오프셋은 32비트 모듈러라 프로텍터가 음수(랩어라운드)
 * 오프셋으로 테이블/파일을 헤더보다 앞쪽에 두는 경우가 있다(실측: blockPos=0xfffff620 →
 * (headerStart-0x9e0)). `>>> 0`로 32비트 랩을 재현한다 (StormLib와 동일).
 */
function absPos(headerStart: number, relOffset: number): number {
  return (headerStart + relOffset) >>> 0;
}

interface HashEntry {
  name1: number;
  name2: number;
  blockIndex: number;
}

interface BlockEntry {
  filePos: number;
  compressedSize: number;
  fileSize: number;
  flags: number;
}

export type InflateFn = (data: Uint8Array) => Uint8Array;

export interface OpenArchiveOptions {
  /** zlib 해제 주입 seam — 기본은 순수 JS inflate(./inflate.ts, 브라우저·Node 공통). 필요 시 교체 가능. */
  inflate?: InflateFn;
}

export interface MpqArchive {
  /** "(listfile)" 멤버가 있으면 줄바꿈으로 분리한 파일명 배열, 없으면 null. */
  listfile(): string[] | null;
  has(name: string): boolean;
  /** 파일 바이트를 반환한다. 없으면 MpqFileNotFoundError, 미지원 압축이면 UnsupportedCompressionError. */
  read(name: string): Uint8Array;
}

function basename(name: string): string {
  const idx = Math.max(name.lastIndexOf("\\"), name.lastIndexOf("/"));
  return idx >= 0 ? name.slice(idx + 1) : name;
}

function defaultInflate(data: Uint8Array): Uint8Array {
  // 순수 JS DEFLATE(./inflate.ts) — node:zlib 제거로 브라우저·Node 공통 구동(에디터 라이브). 2026-07-14.
  // 정확성 = MPQ 테스트 + 스모크(실맵 해제)가 게이트.
  return inflateZlib(data);
}

function readHashTable(bytes: Uint8Array, header: MpqHeader): HashEntry[] {
  const start = absPos(header.headerStart, header.hashTableOffset);
  const length = header.hashTableEntries * 16;
  const raw = bytes.slice(start, start + length); // 복호화가 제자리 수정하므로 복사
  decryptBlock(raw, hashString("(hash table)", HashType.FILE_KEY));

  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const entries: HashEntry[] = [];
  for (let i = 0; i < header.hashTableEntries; i++) {
    const base = i * 16;
    entries.push({
      name1: dv.getUint32(base + 0, true),
      name2: dv.getUint32(base + 4, true),
      blockIndex: dv.getUint32(base + 12, true),
    });
  }
  return entries;
}

function readBlockTable(bytes: Uint8Array, header: MpqHeader): BlockEntry[] {
  const start = absPos(header.headerStart, header.blockTableOffset);
  const length = header.blockTableEntries * 16;
  const raw = bytes.slice(start, start + length);
  decryptBlock(raw, hashString("(block table)", HashType.FILE_KEY));

  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const entries: BlockEntry[] = [];
  for (let i = 0; i < header.blockTableEntries; i++) {
    const base = i * 16;
    entries.push({
      filePos: dv.getUint32(base + 0, true),
      compressedSize: dv.getUint32(base + 4, true),
      fileSize: dv.getUint32(base + 8, true),
      flags: dv.getUint32(base + 12, true) >>> 0,
    });
  }
  return entries;
}

/** hashString(name,0)에서 시작해 선형 탐사, name1/name2 일치 또는 empty(0xFFFFFFFF) 슬롯이면 종료. */
function findBlockIndex(hashTable: HashEntry[], name: string): number | null {
  const tableSize = hashTable.length;
  if (tableSize === 0) return null;
  const start = hashString(name, HashType.TABLE_OFFSET) & (tableSize - 1);
  const nameA = hashString(name, HashType.NAME_A);
  const nameB = hashString(name, HashType.NAME_B);

  for (let probe = 0; probe < tableSize; probe++) {
    const entry = hashTable[(start + probe) % tableSize]!;
    if (entry.name1 === 0xffffffff && entry.name2 === 0xffffffff) return null; // 미사용 슬롯 — 체인 종료
    if (entry.name1 === nameA && entry.name2 === nameB) return entry.blockIndex;
  }
  return null;
}

/**
 * 섹터(또는 single-unit) 하나를 해제한다. 저장 길이 === 기대 길이면 비압축으로 그대로 반환.
 * COMPRESS면 첫 바이트가 압축 마스크(0x02=zlib만 지원), IMPLODE면 마스크 없이 무조건 미지원.
 */
function decompressSector(raw: Uint8Array, expectedSize: number, flags: number, inflate: InflateFn): Uint8Array {
  if (raw.length >= expectedSize) return raw.subarray(0, expectedSize);

  if ((flags & BlockFlag.COMPRESS) !== 0) {
    const mask = raw[0]!;
    const payload = raw.subarray(1);
    if (mask === COMPRESSION_ZLIB) {
      const decoded = inflate(payload);
      // 방어적 트림: 해제 결과가 기대 길이를 넘으면 자른다(예상보다 짧은 건 그대로 표면화되게 둔다).
      return decoded.length > expectedSize ? decoded.subarray(0, expectedSize) : decoded;
    }
    throw new UnsupportedCompressionError(
      `unsupported sector compression mask 0x${mask.toString(16).padStart(2, "0")} (only zlib 0x02 implemented — R-102 scope)`,
    );
  }

  if ((flags & BlockFlag.IMPLODE) !== 0) {
    throw new UnsupportedCompressionError("PKWARE DCL implode compression not implemented (out of scope, deny-first #5)");
  }

  throw new UnsupportedCompressionError("sector smaller than expected but no recognized compression flag set");
}

function readSingleUnit(
  bytes: Uint8Array,
  header: MpqHeader,
  block: BlockEntry,
  name: string,
  inflate: InflateFn,
): Uint8Array {
  const start = absPos(header.headerStart, block.filePos);
  const raw = bytes.slice(start, start + block.compressedSize);

  if ((block.flags & BlockFlag.ENCRYPTED) !== 0) {
    const key0 = hashString(basename(name), HashType.FILE_KEY);
    const key = (block.flags & BlockFlag.FIX_KEY) !== 0 ? ((key0 + block.filePos) ^ block.fileSize) >>> 0 : key0;
    decryptBlock(raw, key);
  }

  return decompressSector(raw, block.fileSize, block.flags, inflate);
}

function readSectorFile(
  bytes: Uint8Array,
  header: MpqHeader,
  block: BlockEntry,
  name: string,
  inflate: InflateFn,
): Uint8Array {
  const sectorSize = header.sectorSize;
  const sectorCount = Math.max(1, Math.ceil(block.fileSize / sectorSize));
  const start = absPos(header.headerStart, block.filePos);

  const offsetTableLen = (sectorCount + 1) * 4;
  const offsetTableRaw = bytes.slice(start, start + offsetTableLen);

  const encrypted = (block.flags & BlockFlag.ENCRYPTED) !== 0;
  const key0 = encrypted ? hashString(basename(name), HashType.FILE_KEY) : 0;
  const key = encrypted && (block.flags & BlockFlag.FIX_KEY) !== 0 ? ((key0 + block.filePos) ^ block.fileSize) >>> 0 : key0;

  if (encrypted) decryptBlock(offsetTableRaw, (key - 1) >>> 0);

  const offDv = new DataView(offsetTableRaw.buffer, offsetTableRaw.byteOffset, offsetTableRaw.byteLength);
  const offsets: number[] = [];
  for (let i = 0; i <= sectorCount; i++) offsets.push(offDv.getUint32(i * 4, true));

  const out = new Uint8Array(block.fileSize);
  let written = 0;

  for (let i = 0; i < sectorCount; i++) {
    const sectorStart = start + offsets[i]!;
    const sectorRawLen = offsets[i + 1]! - offsets[i]!;
    const sectorRaw = bytes.slice(sectorStart, sectorStart + sectorRawLen);

    if (encrypted) decryptBlock(sectorRaw, (key + i) >>> 0);

    const expected = Math.min(sectorSize, block.fileSize - i * sectorSize);
    const decoded = decompressSector(sectorRaw, expected, block.flags, inflate);
    out.set(decoded.subarray(0, expected), written);
    written += expected;
  }

  return out;
}

export function openArchive(bytes: Uint8Array, options: OpenArchiveOptions = {}): MpqArchive {
  const inflate = options.inflate ?? defaultInflate;
  const header = locateHeader(bytes);
  const hashTable = readHashTable(bytes, header);
  const blockTable = readBlockTable(bytes, header);

  function findBlock(name: string): BlockEntry | null {
    const blockIndex = findBlockIndex(hashTable, name);
    if (blockIndex === null || blockIndex >= blockTable.length) return null;
    const block = blockTable[blockIndex]!;
    if ((block.flags & BlockFlag.EXISTS) === 0) return null;
    return block;
  }

  function has(name: string): boolean {
    return findBlock(name) !== null;
  }

  function read(name: string): Uint8Array {
    const block = findBlock(name);
    if (!block) throw new MpqFileNotFoundError(name);
    if ((block.flags & BlockFlag.SINGLE_UNIT) !== 0) {
      return readSingleUnit(bytes, header, block, name, inflate);
    }
    return readSectorFile(bytes, header, block, name, inflate);
  }

  function listfile(): string[] | null {
    if (!has("(listfile)")) return null;
    const raw = read("(listfile)");
    const text = new TextDecoder().decode(raw);
    return text
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  return { listfile, has, read };
}
