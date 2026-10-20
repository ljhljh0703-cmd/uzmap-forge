// war3map.wpm(패싱맵) 파서 — 걷기/건설/비행 비트 그리드. 순수(node API 0, 브라우저 공통).
// 지형 렌더 + 건설 가능 판정 데이터. WC3 관례: 셀=32 월드유닛(타일 128의 1/4), 중심 원점, row 0=남(하단).
// 플래그 비트: 0x02=no-walk, 0x04=no-fly, 0x08=no-build.

import {WPM_CELL_SIZE,FLAG_NO_WALK,FLAG_NO_FLY,FLAG_NO_BUILD,type PathingMap} from "../ir/pathing.ts";
export {WPM_CELL_SIZE,FLAG_NO_WALK,FLAG_NO_FLY,FLAG_NO_BUILD,type PathingMap} from "../ir/pathing.ts";

export function parseWpm(bytes: Uint8Array): PathingMap {
  if (bytes.byteLength < 16) throw new Error(`wpm: truncated header (${bytes.byteLength}/16 bytes)`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== "MP3W") throw new Error(`wpm: bad magic ${magic}`);
  const width = dv.getInt32(8, true);
  const height = dv.getInt32(12, true);
  const cellCount = width * height;
  if (width <= 0 || height <= 0 || !Number.isSafeInteger(cellCount))
    throw new Error(`wpm: invalid dimensions ${width}x${height}`);
  if (cellCount > bytes.byteLength - 16)
    throw new Error(`wpm: truncated cells (${bytes.byteLength - 16}/${cellCount} bytes)`);
  const cells = bytes.subarray(16, 16 + cellCount);
  const cellSize = WPM_CELL_SIZE;
  const originX = -(width * cellSize) / 2 + cellSize / 2;
  const originY = -(height * cellSize) / 2 + cellSize / 2;
  return { width, height, cells, cellSize, originX, originY };
}

/** 월드 좌표 → 셀 (col,row). 범위 밖이면 null. */
export function worldToCell(pm: PathingMap, x: number, y: number): { col: number; row: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const col = Math.round((x - pm.originX) / pm.cellSize);
  const row = Math.round((y - pm.originY) / pm.cellSize);
  if (col < 0 || col >= pm.width || row < 0 || row >= pm.height) return null;
  return { col, row };
}

/** 셀 (col,row) → 월드 좌표(셀 중심). */
export function cellToWorld(pm: PathingMap, col: number, row: number): { x: number; y: number } {
  return { x: pm.originX + col * pm.cellSize, y: pm.originY + row * pm.cellSize };
}

/** 월드 좌표의 플래그 바이트(범위 밖 = no-walk|no-build로 취급). */
export function flagAt(pm: PathingMap, x: number, y: number): number {
  const c = worldToCell(pm, x, y);
  if (!c) return FLAG_NO_WALK | FLAG_NO_BUILD;
  return pm.cells[c.row * pm.width + c.col]!;
}

export function isBuildable(pm: PathingMap, x: number, y: number): boolean {
  const f = flagAt(pm, x, y);
  return (f & FLAG_NO_BUILD) === 0 && (f & FLAG_NO_WALK) === 0;
}

export function isWalkable(pm: PathingMap, x: number, y: number): boolean {
  return (flagAt(pm, x, y) & FLAG_NO_WALK) === 0;
}
