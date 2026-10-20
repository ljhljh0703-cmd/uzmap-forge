/**
 * R-202b B3 — 전투 수학: R-204 dealDamage의 입력 계약(설계 §6).
 * 정수 대미지 파이프(연산·내림 순서 = 스펙, §6.1):
 *   roll(굴림은 R-204가 sim rng로) → 배율(per-mille) → 방어 감산(정확 유리수) → 0 하한.
 * 방어 감산식 출처: WC3 armor 메커니즘의 커뮤니티 문서화(감산율 (a×f)/(1+a×f), 기본 f=0.06) —
 * 통과율 = 1000/(1000+f_pm×a) 로 부동소수 없이 정확(설계 §6.1, Hive Workshop 계열 문서 — UPSTREAM_LEDGER 등재 대상).
 * 배율표는 데이터 주도(§6.2): 맵 war3mapMisc.txt(IR gameConstants) 주입, 폴백 = 중립 1000(자체 창작, clean-room).
 * Original temporary armor abilities can cross zero (A-B5 nonnegative-only premise is false).
 * Negative defense uses 2−(1−DefenseArmor)^−a, with the same caller-supplied coefficient.
 */
import { mulPm } from "./fixed.ts";
import type { ArmorTypeId, AttackTypeId, GameConstants } from "./config.ts";

/**
 * Misc.txt DamageBonus 행(부동소수 배율 행렬) → per-mille 정수표.
 * 파싱 반올림 규칙(§9-③): round(x×1000) 정확히 1회. 열 의미는 columnOrder가 결정(가정 A-B1을 데이터로).
 */
export function damageTableFromRows(
  rows: Record<string, ReadonlyArray<number>>,
  columnOrder: ReadonlyArray<ArmorTypeId>,
): Record<AttackTypeId, Record<ArmorTypeId, number>> {
  const out: Record<AttackTypeId, Record<ArmorTypeId, number>> = {};
  for (const [atkType, row] of Object.entries(rows)) {
    if (row.length !== columnOrder.length) {
      throw new Error(`DamageBonus 행 '${atkType}': 열 ${row.length} ≠ columnOrder ${columnOrder.length} (조용한 어긋남 금지)`);
    }
    const m: Record<ArmorTypeId, number> = {};
    for (let i = 0; i < columnOrder.length; i++) m[columnOrder[i]!] = Math.round(row[i]! * 1000);
    out[atkType] = m;
  }
  return out;
}

/** 공격타입×방어타입 배율(per-mille). 표 부재/미지 조합 = 중립 1000. */
export function typeBonusPm(gc: GameConstants, attackType: AttackTypeId, armorType: ArmorTypeId): number {
  return gc.damageBonusPm?.[attackType]?.[armorType] ?? 1000;
}

/**
 * 배율 → 방어 감산 정수 파이프(§6.1 2~4단계). roll은 이미 굴려진 정수(1단계는 R-204 소관).
 *   typed = floor(roll × bonusPm / 1000)
 *   armor >= 0: floor(typed × 1000 / (1000 + armorFactorPm × armor))
 *   armor < 0: floor(typed × (2 − (1 − armorFactorPm/1000)^−armor))
 *   결과  = max(0, dealt)
 */
export function damageAfterDefense(
  roll: number,
  attackType: AttackTypeId,
  armorType: ArmorTypeId,
  armorValue: number,
  gc: GameConstants,
): number {
  const typed = mulPm(roll, typeBonusPm(gc, attackType, armorType));
  return damageAfterArmor(typed,armorValue,gc);
}

/** One armor-value stage shared by ordinary and neutral-type trigger damage.
 * Source behavior cross-check: Warsmash CUnit.damage f9e0aeed, defense<0 branch.
 * Independent formula implementation; no reference implementation code copied. */
export function damageAfterArmor(typed:number,armorValue:number,gc:GameConstants):number{
 const dealt=armorValue<0
   ? Math.floor(typed*(2-Math.pow(1-gc.armorFactorPm/1000,-armorValue)))
   : Math.floor(typed*1000/(1000+gc.armorFactorPm*armorValue));
 return dealt>0?dealt:0;
}
