/**
 * R-204/R-208 경제 코어 — 현상금 굴림 + 골드 원장 + 구매력 telemetry.
 * 계약: docs/COMBAT_PROGRESSION_DESIGN.md §3.3(bounty roll 식) §4.1(adjustGold 단일 원장)
 *       §4.3(PP·expectedBounty = base+spreadAbs/2, telemetry 전용) §7(rng 지점②·stateHash 비대상).
 * rng 소비 지점②(현상금 roll)는 여기 하나뿐 — 사망 파이프(R-204)가 틱 말 deathQueue 순서로 호출한다(INV-D1: rng는 호출측 단일 인스턴스를 그대로 전달).
 * expectedBounty·purchasingPowerPm은 telemetry·authoring 언어 — rng 비접촉, 정수, 런타임 분기·stateHash에 쓰지 않는다.
 * 의존성: fixed.ts(mulPm) + rng.ts(Rng 타입만 — 값 미사용이라 import type, INV-D3 순수 유지).
 */
import { mulPm } from "./fixed.ts";
import type { Rng } from "../rng.ts";

/**
 * 현상금 굴림(§3.3 rng 지점②). spreadAbs = mulPm(base, spreadPm); roll = base + rng.int(0, spreadAbs).
 * rng.int(0,n)은 0..n 포함 정수 균등 — spreadPm=0 ⇒ spreadAbs=0 ⇒ roll은 항상 base(rng는 그래도 1회 소비돼 소비 지점 규율을 유지한다).
 */
export function rollBounty(rng: Rng, base: number, spreadPm: number): number {
  const spreadAbs = mulPm(base, spreadPm);
  return base + rng.int(0, spreadAbs);
}

/**
 * 현상금 기댓값(§4.3, §2-12 SUMPRODUCT 채택) — 산술 중앙값 base+floor(spreadAbs/2).
 * rng 무접촉 순수 함수 — telemetry(PP 등)·authoring 검증 전용. 게임 상태·stateHash 비대상(§7), 런타임 분기 금지.
 */
export function expectedBounty(base: number, spreadPm: number): number {
  const spreadAbs = mulPm(base, spreadPm);
  return base + Math.floor(spreadAbs / 2);
}

/** adjustGold의 3원 출처 — 스크립트 네이티브(AdjustPlayerState 등)도 이 라벨로 라우팅된다(§4.1). */
export type GoldSource = "bounty" | "script" | "cost";

/** 출처별 유입/유출 누계(정수) — GoldLedger.bySource()가 공짜로 노출하는 telemetry 단위. */
export interface GoldSourceTotals {
  in: number;
  out: number;
}

export type GoldBalanceListener = (player: number, value: number) => void;

/**
 * 골드 원장(§4.1) — 플레이어 골드 변경은 전부 이 클래스의 adjustGold 한 경로로만 수행한다(직접 변수 조작 금지).
 * 결정론: player→정수 잔고 Map 누적 + 고정 3키 출처 집계, 순회 없는 O(1) 갱신(INV 규율과 동일 정신).
 * 음수 골드 클램프 정책: 기본 미클램프(허용) — 스크립트가 비용(cost) 등으로 음수 delta를 지급할 수 있다(§4.1 유출 경로).
 * 잔고 하한/상한이 필요하면 호출측(R-204/R-208 소비자)이 adjustGold 호출 전에 정책을 적용한다(본 원장은 정책을 강제하지 않는다).
 */
export class GoldLedger {
  private readonly balances = new Map<number, number>();
  private readonly onBalanceChanged: GoldBalanceListener | undefined;
  private readonly totals: Record<GoldSource, GoldSourceTotals> = {
    bounty: { in: 0, out: 0 },
    script: { in: 0, out: 0 },
    cost: { in: 0, out: 0 },
  };

  constructor(onBalanceChanged?: GoldBalanceListener) {
    this.onBalanceChanged = onBalanceChanged;
  }

  /** delta ≥ 0 ⇒ source.in += delta / delta < 0 ⇒ source.out += -delta. 잔고 누적은 미클램프. */
  adjustGold(player: number, delta: number, source: GoldSource): void {
    const p = Math.trunc(player);
    const d = Math.trunc(delta);
    if (d === 0) return;
    const next = (this.balances.get(p) ?? 0) + d;
    this.balances.set(p, next);
    if (d >= 0) this.totals[source].in += d;
    else this.totals[source].out += -d;
    this.onBalanceChanged?.(p, next);
  }

  /** 절대값 set도 원장 전이 하나로 환산한다. native SetPlayerState(GOLD)의 유일한 진입점. */
  setGold(player: number, value: number, source: GoldSource): void {
    const p = Math.trunc(player);
    const next = Math.trunc(value);
    this.adjustGold(p, next - this.gold(p), source);
  }

  /** 플레이어 현재 잔고(정수) — 미접촉 플레이어는 0. */
  gold(player: number): number {
    return this.balances.get(player) ?? 0;
  }

  /** 출처별 유입/유출 스냅샷(방어적 복사 — 내부 상태를 직접 노출하지 않음). */
  bySource(): Record<GoldSource, GoldSourceTotals> {
    return {
      bounty: { ...this.totals.bounty },
      script: { ...this.totals.script },
      cost: { ...this.totals.cost },
    };
  }

  /** stateHash용 삽입순 정수 스냅샷. */
  snapshots(): Array<[number, number]> {
    return [...this.balances];
  }
}

/**
 * 구매력 지표 PP(w)(§4.3) — cumGold×1000/nextGateCost, per-mille 정수(floor). telemetry 전용, 게임 상태 아님.
 * 0-division 가드: nextGateCost ≤ 0(게이트 미정의/무료)이면 비율이 무의미 — 0을 반환해 NaN/Infinity 전파를 막는다.
 */
export function purchasingPowerPm(cumGold: number, nextGateCost: number): number {
  if (nextGateCost <= 0) return 0;
  return Math.floor((cumGold * 1000) / nextGateCost);
}

/** Source object bounty is base plus independent authored dice, using the existing RNG. */
export function rollSourceBounty(rng:Rng,reward:import('../def-store.ts').SourceBounty):number{
 let amount=reward.base;for(let i=0;i<reward.dice;i++)amount+=rng.int(1,reward.sides);return amount;
}
