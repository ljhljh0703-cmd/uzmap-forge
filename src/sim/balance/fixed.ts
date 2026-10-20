/**
 * R-202b B1 — per-mille(‰) 정수 고정소수 연산.
 * 계약: docs/BALANCE_ENGINE_DESIGN.md §3.1(정수 출력·내림 지점 고정) §3.2(2^40 가드).
 * 부동소수는 이 레이어를 통과하지 못한다 — 모든 값은 안전 정수, 내림은 명시 지점에서만(INV 규율).
 * 의존성 0. src/sim/ 순수(INV-D3).
 */

/** per-mille 기준(1000 = ×1.0). */
export const PM = 1000;

/** 곡선/스탯 값 상한 — ×growthPm(≤4000) 후에도 2^53 안전 정수 유지(2^40×4000 ≈ 2^52). */
export const MAX_STAT = 2 ** 40;

/** floor(v × pm / 1000). 대미지·배율·프리셋 적용의 유일한 곱셈 경로. */
export function mulPm(v: number, pm: number): number {
  return Math.floor((v * pm) / PM);
}

/** 정수 클램프. min/max 생략 = 해당 방향 무제한. */
export function clampInt(v: number, min?: number, max?: number): number {
  let out = v;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

/** 안전 정수 판정 (validate 전용 헬퍼). */
export function isSafeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v);
}
