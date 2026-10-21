/**
 * R-201 테스트 전용 합성 MapIR — 실맵 인용 없음(clean-room 준수).
 * R-108(MapIR 최종 확정) 전이므로 기존 src/ir/types.ts 최소 스키마만 채운다.
 */
import type { MapIR } from "../../src/ir/types.ts";

export function makeSyntheticIr(): MapIR {
  return {
    irVersion: 1,
    info: {
      name: "합성 테스트 맵",
      author: "R-201 test",
      suggestedPlayers: "1",
      playableWidth: 32,
      playableHeight: 32,
      formatVersion: 25,
    },
    terrain: {
      tileset: "A",
      width: 1,
      height: 1,
      tiles: [{ ground: 0, height: 0, waterHeight: null, flags: 0 }],
    },
    placedUnits: [],
    objectMods: [],
    regions: [],
    script: { source: "", nativesUsed: {} },
    meta: { sourceFile: "synthetic", fileInventory: [], parsedAt: "1970-01-01T00:00:00.000Z" },
  };
}
