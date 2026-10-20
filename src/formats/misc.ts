/**
 * war3mapMisc.txt(INI) 파서 → GameConstants(전투 배율표 §6.2 + 게임플레이 상수).
 * 값은 per-mille 정수화(0.70→700). DamageBonus 8열은 armorTypeColumnOrder로 방어타입에 매핑.
 * clean-room: 맵의 로컬 Misc.txt를 런타임 파싱(Blizzard 기본표 미동봉 — 부재 시 소비측이 중립 1000 폴백).
 * 순수 함수(부수효과 0, sim/DOM import 없음 — src/formats 계약).
 */
import type { GameConstants } from "../sim/balance/config.ts";

/** DamageBonus{공격타입} 행 → 공격타입 키. 원작 7종(방어타입 카운터 로테이션의 공격 축). */
const ATTACK_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["DamageBonusNormal", "normal"],
  ["DamageBonusPierce", "pierce"],
  ["DamageBonusSiege", "siege"],
  ["DamageBonusMagic", "magic"],
  ["DamageBonusChaos", "chaos"],
  ["DamageBonusHero", "hero"],
  ["DamageBonusSpells", "spells"],
];

/** `Key=value` 라인만 수집(섹션 헤더 `[Misc]` 무시). 개행 \r|\n|\r\n 모두. */
function parseIni(text: string): Map<string, string> {
  const kv = new Map<string, string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    const m = /^([A-Za-z]\w*)=(.*)$/.exec(line.trim());
    if (m) kv.set(m[1]!, m[2]!.trim());
  }
  return kv;
}

export function parseMiscConstants(bytes: Uint8Array, armorTypeColumnOrder: ReadonlyArray<string>,defaults?:Partial<GameConstants>): GameConstants {
  const kv = parseIni(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
  const num = (k: string, d: number): number => {
    const v = kv.get(k);
    const n = v !== undefined ? Number.parseFloat(v) : NaN;
    return Number.isFinite(n) ? n : d;
  };
  const pm = (x: number): number => Math.round(x * 1000);

  const damageBonusPm: Record<string, Record<string, number>> = {};
  for (const [key, atk] of ATTACK_ROWS) {
    const row = kv.get(key);
    if (row === undefined) continue;
    const vals = row.split(",").map((s) => pm(Number.parseFloat(s)));
    const perArmor: Record<string, number> = {};
    armorTypeColumnOrder.forEach((armor, i) => {
      const v = vals[i];
      if (v !== undefined && Number.isFinite(v)) perArmor[armor] = v;
    });
    damageBonusPm[atk] = perArmor;
  }

  return {
    ...defaults,
    ...(kv.has("RelativeUpgradeCost")?{relativeUpgradeCost:num("RelativeUpgradeCost",0)!==0}:{}),
    ...(kv.has("FrostAttackSpeedDecrease")?{frostAttackSpeedDecreasePm:pm(num("FrostAttackSpeedDecrease",0))}:{}),
    // WC3 기본 DefenseArmor 0.06(=60pm). Misc.txt는 이 맵에서 미오버라이드(커뮤니티 문서 상수, §6.1).
    armorFactorPm: 60,
    ...(kv.has("FrostMoveSpeedDecrease")?{frostMoveSpeedDecreasePm:pm(num("FrostMoveSpeedDecrease",0))}:{}),
    strHitPointBonus: Math.round(num("StrHitPointBonus", 0)),
    agiDefenseBonusPm: pm(num("AgiDefenseBonus", 0)),
    intManaBonusPm: pm(num("IntManaBonus", 0)),
    maxUnitSpeedU: Math.round(num("MaxUnitSpeed", 522)),
    minUnitSpeedU: Math.round(num("MinUnitSpeed", 220)),
    damageBonusPm: damageBonusPm as GameConstants["damageBonusPm"],
  };
}
