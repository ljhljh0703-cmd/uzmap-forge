/**
 * R-206a+R-207 — natives 설치 aggregator.
 * `installNatives(vm, sim)`가 코어 클러스터(§3 R-206a) 전부를 등록하고 R-207 이벤트 브리지(chat·
 * 타이머만료·EnterRect·사망)를 sim의 tick phase("timers"/"triggerBridge")에 꽂는다. 반환값은
 * 스모크/테스트가 커버리지·트리거 통계를 읽는 창구 — registry는 sim/movement.ts의 RectRegistry 계약도
 * 구조적으로 구현하므로 호출측이 `installMovement(sim, registry)`에 그대로 넘길 수 있다.
 */
import type { JassVm } from "../vm.ts";
import type { Sim } from "../../sim/sim.ts";
import { registerPlayerNatives, type PlayerHandleCache } from "./players.ts";
import { registerHandleNatives } from "./handles.ts";
import { registerGroupNatives } from "./groups.ts";
import { registerUnitNatives } from "./units.ts";
import { registerOrderNatives } from "./orders.ts";
import { registerTriggerNatives } from "./triggers.ts";
import { registerArithNatives } from "./arith.ts";
import { registerMiscStubs } from "./misc_stubs.ts";
import { registerTimerNatives } from "./timers.ts";
import { registerEventBridge } from "./bridge.ts";
import { registerDialogNatives } from "./dialog.ts";
import { registerVictoryNatives } from "./victory.ts";
import { TriggerRegistry, evalBoolExpr } from "./registry.ts";

export { TriggerRegistry } from "./registry.ts";
export type { ChatSubscription } from "./registry.ts";

export interface InstallResult {
  registry: TriggerRegistry;
  playerHandleCache: PlayerHandleCache;
}

/** 코어 natives(Tier1 ~90종) + Tier3/4 lite 스텁 + R-207 이벤트 브리지를 한 번에 설치한다.
 *  같은 vm에 두 번 부르지 않는다(레지스트리가 중복 누적됨 — installNatives는 인스턴스당 1회 호출 계약).
 *  registerTimerNatives는 registerMiscStubs 이후에 호출해 misc_stubs.ts가 등록한 타이머 no-op
 *  스텁(CreateTimer/TimerStart/PauseTimer/ResumeTimer/DestroyTimer)을 실 구현으로 덮어쓴다. */
export function installNatives(vm: JassVm, sim: Sim): InstallResult {
  const registry = new TriggerRegistry();
  const playerHandleCache: PlayerHandleCache = new Map();

  // R-3: vm.ts는 natives/보다 하위 레이어라 evalBoolExpr를 직접 import할 수 없다 — 훅 주입으로
  // boolexpr 핸들(GetBooleanAnd/Or/Not/Condition/Filter가 만드는 kind:"generic" 트리)이 boolean
  // 문맥에서 truthy 강제 대신 실제 평가(and/or/not/code 재귀, groups.ts가 이미 쓰는 그 함수)를 받게 한다.
  vm.setBoolExprEvaluator(evalBoolExpr);

  registerPlayerNatives(vm, playerHandleCache, sim);
  registerHandleNatives(vm);
  registerGroupNatives(vm);
  registerUnitNatives(vm);
  registerOrderNatives(vm);
  registerTriggerNatives(vm, registry);
  registerArithNatives(vm);
  registerMiscStubs(vm);
  registerDialogNatives(vm, registry);
  registerVictoryNatives(vm, sim);
  registerTimerNatives(vm, sim, registry);
  registerEventBridge(vm, sim, registry, playerHandleCache);

  return { registry, playerHandleCache };
}
