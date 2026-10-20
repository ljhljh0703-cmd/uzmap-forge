/**
 * MapIR — 엔진 중립 중간표현 (진실 소스).
 * 계약: docs/ARCHITECTURE.md §MapIR. R-108에서 스키마 확정·스냅샷 고정.
 * JSON 직렬화 가능해야 함 (git-friendly 프로젝트 포맷).
 */

/** WC3 4CC 오브젝트 id (예: "hfoo"). */
export type FourCC = string;

export interface MapInfo {
  name: string; // wts TRIGSTR 해석 완료값
  author: string;
  suggestedPlayers: string;
  playableWidth: number;
  playableHeight: number;
  formatVersion: number; // w3i
}

export interface TerrainIR {
  tileset: string;
  width: number;
  height: number;
  /** row-major; 값 의미는 R-104에서 문서화 (groundTexture, height, water, ramp…) */
  tiles: TerrainTile[];
}

export interface TerrainTile {
  ground: number;
  height: number;
  waterHeight: number | null;
  flags: number;
}

export interface PlacedUnit {
  typeId: FourCC;
  owner: number; // player index
  x: number;
  y: number;
  facing: number;
  /** hp/mana/레벨/아이템 등 — R-105에서 확장 */
  mods?: Record<string, unknown>;
}

/**
 * 오브젝트 에디터 수정 데이터 (w3u/w3t/w3a/w3b/w3d/w3q 공통 diff 표현).
 * R-106에서 basic(w3u/w3t/w3b/w3h)·extended(w3a/w3d/w3q) 2모드 파서가 채운다.
 */
export interface ObjectMod {
  baseId: FourCC;
  newId: FourCC | null; // null = 원본 수정, 값 = 커스텀 유닛
  kind: "unit" | "item" | "ability" | "buff" | "destructable" | "upgrade" | "doodad";
  mods: Array<{
    field: FourCC; // raw 4CC 필드명 그대로 보존 — 의미 해석은 R-202 몫
    value: string | number | boolean;
    level?: number; // extended 포맷: 레벨/변형 인덱스
    column?: number; // extended 포맷: 데이터 열(dataPointer) — R-106
  }>;
}

export interface RegionIR {
  name: string;
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export interface ScriptIR {
  /** war3map.j 원문 */
  source: string;
  /** native 이름 → 호출 횟수 (analyze 리포트 원천) */
  nativesUsed: Record<string, number>;
}

export interface MapIR {
  irVersion: 1;
  info: MapInfo;
  terrain: TerrainIR;
  placedUnits: PlacedUnit[];
  objectMods: ObjectMod[];
  regions: RegionIR[];
  script: ScriptIR;
  meta: {
    sourceFile: string;
    fileInventory: string[]; // 아카이브 내 파일 목록
    parsedAt: string;
  };
}
