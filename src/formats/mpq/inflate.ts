// 순수 JS DEFLATE(RFC1951) inflate + zlib 래퍼 스트립 — node:zlib 제거(브라우저·Node 공통 동기 해제).
// 근거: tinf(Jörgen Ibsen, zlib 라이선스) 알고리즘의 충실 이식. MPQ 섹터 해제 seam(archive.ts)이 소비.
// 정확성 검증 = 기존 MPQ 테스트 + 스모크(실맵 war3map.j 해제)가 게이트.

interface HuffTree {
  // table[i] = 길이 i의 코드 개수, trans[] = 심볼 역매핑(정준 Huffman)
  readonly table: Uint16Array; // 길이별(1..15) 코드 수 + [0]=미사용
  readonly trans: Uint16Array;
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_BITS = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLC_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function newTree(): HuffTree {
  return { table: new Uint16Array(16), trans: new Uint16Array(288) };
}

/** 길이 배열(각 심볼의 코드 길이) → 정준 Huffman 트리(table/trans) 구축. tinf_build_tree. */
function buildTree(tree: HuffTree, lengths: Uint8Array | number[], off: number, num: number): void {
  const table = tree.table;
  const trans = tree.trans;
  const offs = new Uint16Array(16);
  for (let i = 0; i < 16; i++) table[i] = 0;
  for (let i = 0; i < num; i++) {
    const bits = lengths[off + i]!;
    table[bits] = table[bits]! + 1;
  }
  table[0] = 0;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    offs[i] = sum;
    sum += table[i]!;
  }
  for (let i = 0; i < num; i++) {
    const len = lengths[off + i]!;
    if (len) trans[offs[len]!++] = i;
  }
}

// 고정 Huffman 트리(캐시)
let fixedLTree: HuffTree | null = null;
let fixedDTree: HuffTree | null = null;
function buildFixedTrees(): { l: HuffTree; d: HuffTree } {
  if (fixedLTree && fixedDTree) return { l: fixedLTree, d: fixedDTree };
  const l = newTree();
  l.table[7] = 24; l.table[8] = 152; l.table[9] = 112;
  for (let i = 0; i < 24; i++) l.trans[i] = 256 + i;
  for (let i = 0; i < 144; i++) l.trans[24 + i] = i;
  for (let i = 0; i < 8; i++) l.trans[24 + 144 + i] = 280 + i;
  for (let i = 0; i < 112; i++) l.trans[24 + 144 + 8 + i] = 144 + i;
  const d = newTree();
  d.table[5] = 32;
  for (let i = 0; i < 32; i++) d.trans[i] = i;
  fixedLTree = l; fixedDTree = d;
  return { l, d };
}

class BitReader {
  tag = 0;
  bitcount = 0;
  idx = 0;
  readonly src: Uint8Array;
  constructor(src: Uint8Array) {
    this.src = src;
  }
  getBit(): number {
    if (this.bitcount-- === 0) {
      this.tag = this.src[this.idx++]!;
      this.bitcount = 7;
    }
    const bit = this.tag & 1;
    this.tag >>>= 1;
    return bit;
  }
  getBits(num: number, base: number): number {
    let val = 0;
    for (let i = 0; i < num; i++) val |= this.getBit() << i;
    return val + base;
  }
  decodeSymbol(tree: HuffTree): number {
    let sum = 0, cur = 0, len = 0;
    do {
      cur = 2 * cur + this.getBit();
      len++;
      sum += tree.table[len]!;
      cur -= tree.table[len]!;
    } while (cur >= 0);
    return tree.trans[sum + cur]!;
  }
}

/** 동적 Huffman 블록: 코드 길이 트리로 리터럴/거리 트리 길이 배열 복원. */
function decodeTrees(r: BitReader, lt: HuffTree, dt: HuffTree): void {
  const hlit = r.getBits(5, 257);
  const hdist = r.getBits(5, 1);
  const hclen = r.getBits(4, 4);
  const lengths = new Uint8Array(288 + 32);
  const clcLengths = new Uint8Array(19);
  for (let i = 0; i < hclen; i++) clcLengths[CLC_ORDER[i]!] = r.getBits(3, 0);
  const codeTree = newTree();
  buildTree(codeTree, clcLengths, 0, 19);
  let num = 0;
  while (num < hlit + hdist) {
    const sym = r.decodeSymbol(codeTree);
    if (sym === 16) {
      const prev = lengths[num - 1]!;
      let n = r.getBits(2, 3);
      for (; n; n--) lengths[num++] = prev;
    } else if (sym === 17) {
      let n = r.getBits(3, 3);
      for (; n; n--) lengths[num++] = 0;
    } else if (sym === 18) {
      let n = r.getBits(7, 11);
      for (; n; n--) lengths[num++] = 0;
    } else {
      lengths[num++] = sym;
    }
  }
  buildTree(lt, lengths, 0, hlit);
  buildTree(dt, lengths, hlit, hdist);
}

/** 압축 블록(고정/동적) 해제 — dest에 append. */
function inflateBlock(r: BitReader, dest: number[], lt: HuffTree, dt: HuffTree): void {
  for (;;) {
    let sym = r.decodeSymbol(lt);
    if (sym === 256) return; // 블록 끝
    if (sym < 256) {
      dest.push(sym);
    } else {
      sym -= 257;
      const length = r.getBits(LENGTH_BITS[sym]!, LENGTH_BASE[sym]!);
      const distSym = r.decodeSymbol(dt);
      const dist = r.getBits(DIST_BITS[distSym]!, DIST_BASE[distSym]!);
      const offset = dest.length - dist;
      for (let i = 0; i < length; i++) dest.push(dest[offset + i]!);
    }
  }
}

/** 비압축(stored) 블록. */
function inflateStored(r: BitReader, dest: number[]): void {
  // 바이트 경계로 정렬
  while (r.bitcount > 0) r.getBit();
  let idx = r.idx;
  const len = r.src[idx]! | (r.src[idx + 1]! << 8);
  idx += 4; // len(2) + nlen(2)
  for (let i = 0; i < len; i++) dest.push(r.src[idx + i]!);
  r.idx = idx + len;
  r.bitcount = 0;
}

/** raw DEFLATE(RFC1951) 해제 → Uint8Array. */
export function inflateRaw(source: Uint8Array): Uint8Array {
  const r = new BitReader(source);
  const dest: number[] = [];
  let bfinal = 0;
  do {
    bfinal = r.getBit();
    const btype = r.getBits(2, 0);
    if (btype === 0) inflateStored(r, dest);
    else if (btype === 1) {
      const { l, d } = buildFixedTrees();
      inflateBlock(r, dest, l, d);
    } else if (btype === 2) {
      const lt = newTree();
      const dt = newTree();
      decodeTrees(r, lt, dt);
      inflateBlock(r, dest, lt, dt);
    } else {
      throw new Error(`inflate: invalid block type ${btype}`);
    }
  } while (!bfinal);
  return Uint8Array.from(dest);
}

/** zlib 스트림(2바이트 헤더 + raw deflate + 4바이트 adler32) 해제. MPQ 섹터(mask 0x02)가 이 형식. */
export function inflateZlib(data: Uint8Array): Uint8Array {
  // zlib 헤더 검증(CMF/FLG): 하위니블 8 = deflate. 헤더 2바이트 스킵 후 raw inflate.
  if (data.length >= 2 && (data[0]! & 0x0f) === 0x08) {
    return inflateRaw(data.subarray(2));
  }
  // 헤더 없으면 raw로 시도(방어적).
  return inflateRaw(data);
}
