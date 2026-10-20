/**
 * R-206a/R-207 — 트리거 레지스트리 + boolexpr 평가 + 발화 헬퍼.
 * 계약 근거: docs/IMPLEMENTATION_MAP.md §3 R-206a("트리거 모델")·R-207("이벤트 브리지").
 * docs/MOVEMENT_LOOP_DESIGN.md §5.2(발화 계약 — EnterRect)·§2.3(웨이브 구동 — 타이머).
 *
 * 트리거 핸들(kind:"trigger")의 data 모양: { actions: JassValue[], conditions: JassValue[], enabled: boolean }.
 * boolexpr은 핸들(kind:"generic")로 표현: { op: "code"|"and"|"or"|"not", code?, a?, b? }
 * (Condition/Filter/GetBooleanAnd/GetBooleanOr가 만든다 — natives/triggers.ts).
 *
 * 발화 순서 = 등록순(INV-D4): actions 배열은 TriggerAddAction 호출 순서 그대로, 각각 별도 스레드로
 * spawnThread한다(MAP §3 R-206a "TriggerAddAction류(콜백을 새 스레드로 스폰)").
 *
 * R-207 확장(타이머·EnterRect·사망) — 이 레지스트리가 3종 구독부까지 소유한다:
 *  - rects: sim/movement.ts의 RectRegistry 계약을 구조적으로 구현(installMovement(sim, registry)에 이
 *    인스턴스를 그대로 넘긴다, §5.1). rectId는 "등록 호출마다" 새로 발급 — 같은 물리 rect에 여러 트리거가
 *    걸려도(WC3 게이트 3중 트리거 관례, §2.2) RectEntered 1건 = 매칭 등록 1개만 찾아 과다발화를 막는다.
 *  - timerSubs: 타이머 handle id → 구독 트리거id[](등록순) — TriggerRegisterTimerExpireEvent가 채우고
 *    natives/timers.ts의 만료 훅이 조회한다.
 *  - deathSubs: 사망 구독 트리거id[](등록순) — TriggerRegisterAnyUnitEventBJ/PlayerUnitEventSimple이
 *    채운다(v1: 유닛/플레이어 필터 없이 "모든 사망" 근사, §5.2 "EVENT_UNIT_DEATH류" — natives/triggers.ts
 *    헤더 참조).
 */
import type { HandleObj, JassValue, JassVm, NativeCallContext } from "../vm.ts";
import type { RectRegistry, RegisteredRect } from "../../sim/movement.ts";

export interface ChatSubscription {
  readonly triggerId: number;
  readonly playerId: number;
  readonly text: string;
  readonly exact: boolean;
}

export interface DialogSubscription {
  readonly triggerId: number;
  readonly dialogId: number;
}

export interface PlayerStateSubscription {
  readonly triggerId: number;
  readonly playerId: number;
  readonly stateKey: number;
  readonly op: number;
  readonly value: number;
}

export interface TimedTriggerSubscription {
  readonly triggerId: number;
  readonly intervalTicks: number;
  readonly periodic: boolean;
  remainingTicks: number;
}

/** R-207: chat(최소 스코프였던 구 버전) + 타이머·EnterRect·사망 구독까지 소유. RectRegistry를 구조적으로
 *  구현해 movement.ts의 installMovement(sim, registry)에 이 인스턴스를 직접 넘길 수 있다. */
export interface UnitRangeSubscription {
 readonly triggerId:number;readonly unitId:number;readonly radiusU:number;readonly filter:JassValue|undefined;
 inside:Set<number>;
}

export class TriggerRegistry implements RectRegistry {
  readonly chatSubs: ChatSubscription[] = [];
  readonly unitRangeSubs: UnitRangeSubscription[] = [];
  /** R-207: sim/movement.ts RectRegistry 계약(§5.1) — installMovement가 읽기 전용 소비. */
  readonly rects: RegisteredRect[] = [];
  /** R-207: 타이머 만료 구독(timerId → triggerId[], 등록순). */
  readonly timerSubs = new Map<number, number[]>();
  /** R-207: 사망 구독(triggerId[], 등록순, v1: 필터 없음). */
  readonly deathSubs: number[] = [];
  /** R-307b: created dialogs and dialog-level subscriptions, both insertion ordered. */
  readonly dialogIds: number[] = [];
  readonly dialogSubs: DialogSubscription[] = [];
  readonly playerStateSubs: PlayerStateSubscription[] = [];
  readonly timedTriggerSubs: TimedTriggerSubscription[] = [];
  registeredTriggerCount = 0;
  /** 종류별 TriggerRegister* 호출 카운트(등록은 됐으나 미발화인 이벤트 종류 — 리포트용). */
  readonly registeredEventKinds = new Map<string, number>();
  private nextRectId = 1;

  registerChat(sub: ChatSubscription): void {
    this.chatSubs.push(sub);
  }

  /** R-207: TriggerRegisterEnterRectSimple 전용 — rectId는 이 메서드가 등록 호출마다 새로 발급한다. */
  registerRect(triggerId: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
    this.rects.push({ rectId: this.nextRectId++, triggerId, ...bounds });
  }

  /** R-207: TriggerRegisterTimerExpireEvent 전용. */
  registerTimerExpire(timerId: number, triggerId: number): void {
    const list = this.timerSubs.get(timerId);
    if (list) list.push(triggerId);
    else this.timerSubs.set(timerId, [triggerId]);
  }

  /** R-207: TriggerRegisterAnyUnitEventBJ/PlayerUnitEventSimple(사망 근사) 전용. */
  registerDeath(triggerId: number): void {
    this.deathSubs.push(triggerId);
  }

  registerDialog(triggerId: number, dialogId: number): void {
    this.dialogSubs.push({ triggerId, dialogId });
  }

  registerPlayerState(sub: PlayerStateSubscription): void {
    this.playerStateSubs.push(sub);
  }

  registerTimedTrigger(triggerId: number, intervalTicks: number, periodic: boolean): void {
    const ticks = Math.max(1, Math.trunc(intervalTicks));
    this.timedTriggerSubs.push({ triggerId, intervalTicks: ticks, periodic, remainingTicks: ticks });
  }

  noteRegisteredEvent(kind: string): void {
    this.registeredEventKinds.set(kind, (this.registeredEventKinds.get(kind) ?? 0) + 1);
  }
}

function toBool(v: JassValue): boolean {
  if (v.t === "bool") return v.v;
  if (v.t === "unknown" || v.t === "null") return false;
  return true;
}

/** boolexpr(코드값 또는 kind:"generic" 핸들 트리)을 동기 평가한다. null/미지 boolexpr = 통과(true) —
 *  JASS에서 조건 없는 트리거(TriggerAddCondition 미호출)와 동일 취급. */
export function evalBoolExpr(ctx: NativeCallContext, v: JassValue | undefined): boolean {
  if (!v) return true;
  // R-3(DISPATCH_SONNET_R3_WIRING W-1 실측 발견) — 이 맵의 GetBooleanAnd/Or 관용구는
  // `GetBooleanAnd(pC(),PC())`처럼 인자가 boolexpr 코드/핸들이 아니라 **이미 평가된 boolean**이다
  // (pC()/PC()가 `returns boolean` 함수라 evalCall이 native 호출 전에 즉시 평가해버림 — 실측:
  // war3map.j Trig_Round_Finish_reset_Func013001 등 1070 콜사이트 공통 패턴). 이 leaf 케이스가
  // 빠져 있어 "and"/"or" 재귀가 v.t==="bool"인 자식을 만나면 else 무엇도 매치 못 하고 최종
  // `return true`로 흘러버려 실제 false 값을 침묵시키고 있었다(젬 전량 최상급 잔여 원인). 재귀
  // 진입점에서 이 리프를 직접 처리한다 — 새 평가기가 아니라 기존 재귀의 누락된 leaf 1개.
  if (v.t === "bool") return v.v;
  if (v.t === "code") {
    if (v.v === null) return true;
    return toBool(ctx.callVm(v, []));
  }
  if (v.t === "handle" && v.v !== null) {
    const h = ctx.handles.get(v.v);
    if (h && h.kind === "generic" && typeof h.data.op === "string") {
      switch (h.data.op) {
        case "code":
          return evalBoolExpr(ctx, h.data.code as JassValue);
        case "and":
          return evalBoolExpr(ctx, h.data.a as JassValue) && evalBoolExpr(ctx, h.data.b as JassValue);
        case "or":
          return evalBoolExpr(ctx, h.data.a as JassValue) || evalBoolExpr(ctx, h.data.b as JassValue);
        case "not":
          return !evalBoolExpr(ctx, h.data.a as JassValue);
        default:
          return true;
      }
    }
  }
  return true;
}

/** 트리거 발화: conditions 평가(전부 true여야 발화) → actions를 등록순으로 각각 spawnThread.
 *  meta는 새로 스폰되는 각 액션 스레드에 그대로 전달(GetTriggerPlayer 등이 TSA 재개 후에도 봄). */
export function fireTrigger(vm: JassVm, trig: HandleObj, meta: Record<string, JassValue>): boolean {
  if (trig.data.enabled === false) return false;
  vm.setSyncMeta(meta);
  const ctx = vm.syncContext();
  const conditions = (trig.data.conditions as JassValue[] | undefined) ?? [];
  let pass = true;
  for (const c of conditions) {
    if (!evalBoolExpr(ctx, c)) {
      pass = false;
      break;
    }
  }
  vm.setSyncMeta({});
  if (!pass) return false;
  const actions = (trig.data.actions as JassValue[] | undefined) ?? [];
  for (const action of actions) {
    if (action.t === "code" && action.v !== null) {
      vm.spawnThread(action, [], meta);
    }
  }
  return true;
}
