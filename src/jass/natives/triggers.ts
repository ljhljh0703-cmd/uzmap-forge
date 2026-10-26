/**
 * R-206a natives — 트리거 생성/조립 클러스터 + R-207 이벤트 등록(chat·타이머만료·EnterRect·사망).
 * 실측(R-205 보너스 프로브, config()+main() 정적 91종 상위): CreateTrigger 707·TriggerAddAction 380·
 * Condition/TriggerAddCondition 252×2·TriggerRegisterPlayerChatEvent 148·EnterRect 80.
 * 트리거 핸들 data: { actions: JassValue[](code, 등록순), conditions: JassValue[](boolexpr, 등록순),
 * enabled: boolean }. 발화 로직은 registry.ts의 fireTrigger()/evalBoolExpr() 공유 — 실제 발화 소비는
 * natives/bridge.ts(chat·EnterRect·사망)와 natives/timers.ts(타이머 만료)가 담당, 이 파일은 등록만.
 */
import type { JassVm, NativeCallContext } from "../vm.ts";
import { vhandle, vint, vbool, vstring, vreal } from "../vm.ts";
import { TriggerRegistry, fireTrigger } from "./registry.ts";
import { playerIndexOf } from "./players.ts";
import { secondsToTicks } from "../../sim/ticks.ts";
import { restoreLostModeDialogButtons } from "./dialog.ts";

export interface UnitEventSubscription {
  readonly triggerId: number;
  readonly playerId: number | null;
  readonly unitId?: number;
}

interface UnitEventSubscriptions {
  readonly construct: UnitEventSubscription[];
  readonly spellCast: UnitEventSubscription[];
  /** G-1(GEM_IDENTITY_MINE_DESIGN §5.1) — EVENT_PLAYER_UNIT_ATTACKED 구독 버킷(신설, construct/spellCast와 동형). */
  readonly attack: UnitEventSubscription[];
  /** G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c) — EVENT_PLAYER_UNIT_RESEARCH_FINISH 구독 버킷(construct와 동형). */
  readonly research: UnitEventSubscription[];
  readonly upgrade:UnitEventSubscription[];
  readonly train:UnitEventSubscription[];
}

const unitEventSubscriptions = new WeakMap<TriggerRegistry, UnitEventSubscriptions>();

function subscriptionsFor(registry: TriggerRegistry): UnitEventSubscriptions {
  let subscriptions = unitEventSubscriptions.get(registry);
  if (!subscriptions) {
    subscriptions = { construct: [], spellCast: [], attack: [], research: [],upgrade:[],train:[] };
    unitEventSubscriptions.set(registry, subscriptions);
  }
  return subscriptions;
}

export function constructSubscriptions(registry: TriggerRegistry): ReadonlyArray<UnitEventSubscription> {
  return subscriptionsFor(registry).construct;
}

export function spellCastSubscriptions(registry: TriggerRegistry): ReadonlyArray<UnitEventSubscription> {
  return subscriptionsFor(registry).spellCast;
}

/** G-1: EVENT_PLAYER_UNIT_ATTACKED 구독자 — natives/bridge.ts가 sim의 Attacked SimEvent를 여기로 라우팅한다. */
export function attackSubscriptions(registry: TriggerRegistry): ReadonlyArray<UnitEventSubscription> {
  return subscriptionsFor(registry).attack;
}

/** G-2c: EVENT_PLAYER_UNIT_RESEARCH_FINISH 구독자 — natives/bridge.ts가 sim의 ResearchFinished 이벤트를 여기로 라우팅한다. */
export function researchFinishSubscriptions(registry: TriggerRegistry): ReadonlyArray<UnitEventSubscription> {
  return subscriptionsFor(registry).research;
}

export function trainFinishSubscriptions(registry:TriggerRegistry):ReadonlyArray<UnitEventSubscription>{return subscriptionsFor(registry).train;}

export function upgradeFinishSubscriptions(registry:TriggerRegistry):ReadonlyArray<UnitEventSubscription>{return subscriptionsFor(registry).upgrade;}

export function registerTriggerNatives(vm: JassVm, registry: TriggerRegistry): void {
  const EVENT_PLAYER_UNIT_DEATH = 0;
  const EVENT_PLAYER_UNIT_CONSTRUCT_FINISH = 1;
  const EVENT_PLAYER_UNIT_SPELL_CAST = 2;
  // G-1(GEM_IDENTITY_MINE_DESIGN §5.1) — 다음 미사용 정수. common.j 미로드로 실제 WC3 상수값과 무관하게
  // 이 VM 안에서만 스스로 구분 가능하면 충분하다(vm.ts의 per-name global slot 선등록 메커니즘, §9 A-G 재해석).
  const EVENT_PLAYER_UNIT_ATTACKED = 3;
  // G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c) — 다음 미사용 정수(같은 선등록 관례).
  const EVENT_PLAYER_UNIT_RESEARCH_FINISH = 4;
  const EVENT_PLAYER_UNIT_TRAIN_FINISH=6;
  vm.setGlobal("EVENT_PLAYER_UNIT_TRAIN_FINISH",vint(EVENT_PLAYER_UNIT_TRAIN_FINISH));
  const EVENT_PLAYER_UNIT_UPGRADE_FINISH=5;
  vm.setGlobal("EVENT_PLAYER_UNIT_UPGRADE_FINISH",vint(EVENT_PLAYER_UNIT_UPGRADE_FINISH));
  vm.setGlobal("EVENT_PLAYER_UNIT_DEATH", vint(EVENT_PLAYER_UNIT_DEATH));
  vm.setGlobal("EVENT_PLAYER_UNIT_CONSTRUCT_FINISH", vint(EVENT_PLAYER_UNIT_CONSTRUCT_FINISH));
  vm.setGlobal("EVENT_PLAYER_UNIT_SPELL_CAST", vint(EVENT_PLAYER_UNIT_SPELL_CAST));
  vm.setGlobal("EVENT_PLAYER_UNIT_ATTACKED", vint(EVENT_PLAYER_UNIT_ATTACKED));
  vm.setGlobal("EVENT_PLAYER_UNIT_RESEARCH_FINISH", vint(EVENT_PLAYER_UNIT_RESEARCH_FINISH));
  // Caller-owned classic 1.28 common.j: EVENT_UNIT_TRAIN_FINISH=ConvertUnitEvent(71).
  const EVENT_UNIT_TRAIN_FINISH=71;
  vm.setGlobal('EVENT_UNIT_TRAIN_FINISH',vint(EVENT_UNIT_TRAIN_FINISH));
  vm.registerNative("CreateTrigger", (ctx) => {
    registry.registeredTriggerCount++;
    return vhandle(ctx.handles.create("trigger", { actions: [], conditions: [], enabled: true }).id);
  });
  vm.registerNative("DestroyTrigger", (ctx, args) => {
    if (args[0]?.t === "handle" && args[0].v !== null) ctx.handles.delete(args[0].v);
    return vint(0);
  });
  vm.registerNative("EnableTrigger", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (t) t.data.enabled = true;
    return vint(0);
  });
  vm.registerNative("DisableTrigger", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (t) t.data.enabled = false;
    return vint(0);
  });
  vm.registerNative("IsTriggerEnabled", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vbool(t ? (t.data.enabled as boolean) !== false : false);
  });

  vm.registerNative("TriggerAddAction", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const code = args[1];
    if (t && code) (t.data.actions as unknown[]).push(code);
    return vhandle(null); // triggeraction 핸들 반환은 원본 API지만 이 맵 코드는 반환값을 저장하지 않음(관례)
  });
  vm.registerNative("TriggerAddCondition", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const boolexpr = args[1];
    if (t && boolexpr) (t.data.conditions as unknown[]).push(boolexpr);
    return vhandle(null);
  });

  // boolexpr 조립 — kind:"generic" 핸들 트리(registry.ts의 evalBoolExpr가 재귀 평가).
  const makeBoolExpr = (ctx: NativeCallContext, op: string, data: Record<string, unknown>) =>
    vhandle(ctx.handles.create("generic", { op, ...data }).id);
  vm.registerNative("Condition", (ctx, args) => makeBoolExpr(ctx, "code", { code: args[0] }));
  vm.registerNative("Filter", (ctx, args) => makeBoolExpr(ctx, "code", { code: args[0] }));
  // Local Blizzard.j: these BJ helpers take/return boolean, unlike common.j And/Or.
  // Returning a non-null expression handle here made returned composite filters always pass.
  vm.registerNative("GetBooleanAnd", (ctx, args) => args[0]?.t === "bool" && args[1]?.t === "bool"
    ? vbool(args[0].v && args[1].v) : makeBoolExpr(ctx, "and", { a: args[0], b: args[1] }));
  vm.registerNative("GetBooleanOr", (ctx, args) => args[0]?.t === "bool" && args[1]?.t === "bool"
    ? vbool(args[0].v || args[1].v) : makeBoolExpr(ctx, "or", { a: args[0], b: args[1] }));
  // Preserve the older expression-argument extension above for existing callers.
  // Standard lazy expression composition uses these actual common.j native names.
  vm.registerNative("And", (ctx, args) => makeBoolExpr(ctx, "and", { a: args[0], b: args[1] }));
  vm.registerNative("Or", (ctx, args) => makeBoolExpr(ctx, "or", { a: args[0], b: args[1] }));
  vm.registerNative("Not", (ctx, args) => makeBoolExpr(ctx, "not", { a: args[0] }));

  vm.registerNative("TriggerExecute", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (t) fireTrigger(vm, t, { trigger: vhandle(t.id) });
    return vint(0);
  });
  vm.registerNative("ConditionalTriggerExecute", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (t) fireTrigger(vm, t, { trigger: vhandle(t.id) });
    return vint(0);
  });

  // 발화 컨텍스트 — R-207.
  // Current bridge supports ATTACKED (attack start), not EVENT_UNIT_DAMAGED.
  // It carries no damage payload. Never infer this value from attack power:
  // source une uses >0 here, which would activate otherwise dormant effects.
  // A future damaged-event bridge must supply its own scoped real payload.
  vm.registerNative("GetEventDamage", (ctx) => ctx.threadMeta.eventDamage?.t === "real" ? ctx.threadMeta.eventDamage : vreal(0));
  vm.registerNative("GetTriggerPlayer", (ctx) => ctx.threadMeta.player ?? vhandle(null));
  vm.registerNative("GetTriggeringTrigger", (ctx) => ctx.threadMeta.trigger ?? vhandle(null));
  vm.registerNative("GetEventPlayerChatString", (ctx) => ctx.threadMeta.chatText ?? vstring(""));
  // G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c) — RESEARCH_FINISH 발화 컨텍스트: 방금 완료된 techId(rawcode
  // int, GetTriggerPlayer()와 동일하게 threadMeta 경유 — natives/bridge.ts가 채운다). 실맵 nL/QM/tM이
  // `GetResearched() == 'R001'` 형태로 소비(triggers_master.json 실측, §2.2 표).
  vm.registerNative("GetResearched", (ctx) => ctx.threadMeta.researched ?? vint(0));

  // ---- R-207: TriggerRegisterPlayerChatEvent = 최소 스코프였던 실 배선 이벤트(chat). ----
  vm.registerNative("TriggerRegisterPlayerChatEvent", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const playerIdx = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    const text = args[2]?.t === "string" ? args[2].v : "";
    const exact = args[3]?.t === "bool" ? args[3].v : true;
    if (t && playerIdx >= 0) {
      registry.registerChat({ triggerId: t.id, playerId: playerIdx, text, exact });
    }
    registry.noteRegisteredEvent("PlayerChatEvent");
    return vhandle(null);
  });

  // ---- R-207 확장: 타이머 만료 구독 등록. 실제 만료 판정·발화는 natives/timers.ts(sim "timers" tick
  // phase)가 담당한다 — 여기서는 (timerId→triggerId) 구독만 registry.timerSubs에 적재한다. ----
  vm.registerNative("TriggerRegisterTimerExpireEvent", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const timer = args[1]?.t === "handle" && args[1].v !== null ? ctx.handles.get(args[1].v) : undefined;
    if (t && timer && timer.kind === "timer") {
      registry.registerTimerExpire(timer.id, t.id);
    }
    registry.noteRegisteredEvent("TimerExpireEvent");
    return vhandle(null);
  });

  // ---- R-207 확장: EnterRect — rect 핸들(natives/handles.ts의 Rect()가 만든 {minx,miny,maxx,maxy})의
  // 경계를 registry.rects(RectRegistry 계약, movement.ts §5.1)에 등록. 실제 진입 판정은 movement.ts,
  // 발화는 natives/bridge.ts(§5.2) — 여기서는 등록만. ----
  vm.registerNative("TriggerRegisterEnterRectSimple", (ctx, args) => {
    const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const r = args[1]?.t === "handle" && args[1].v !== null ? ctx.handles.get(args[1].v) : undefined;
    if (t && r && r.kind === "rect") {
      registry.registerRect(t.id, {
        minX: (r.data.minx as number) ?? 0,
        minY: (r.data.miny as number) ?? 0,
        maxX: (r.data.maxx as number) ?? 0,
        maxY: (r.data.maxy as number) ?? 0,
      });
    }
    registry.noteRegisteredEvent("EnterRectSimple");
    return vhandle(null);
  });

  // P8: unrecognized events used to fall into deathSubs. Actual creep deaths then
  // ran construction-cancel/item handlers (GetCancelledStructure appeared on 84 deaths).
  // Subscribe only explicit supported kinds; preserve unsupported registration as evidence.
  const registerUnitEvent = (name: string, eventTag: string, playerArg: number | null, eventArg: number) => {
    vm.registerNative(name, (ctx, args) => {
      const t = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
      const event = args[eventArg]?.t === "int" ? args[eventArg].v : null;
      const playerId = playerArg === null ? null : (args[playerArg] ? playerIndexOf(ctx, args[playerArg]!) : -1);
      if (t) {
        const subscription = { triggerId: t.id, playerId: playerId !== null && playerId >= 0 ? playerId : null };
        if (event === EVENT_PLAYER_UNIT_CONSTRUCT_FINISH) subscriptionsFor(registry).construct.push(subscription);
        else if (event === EVENT_PLAYER_UNIT_SPELL_CAST) subscriptionsFor(registry).spellCast.push(subscription);
        else if (event === EVENT_PLAYER_UNIT_ATTACKED) subscriptionsFor(registry).attack.push(subscription);
        else if(event===EVENT_PLAYER_UNIT_TRAIN_FINISH)subscriptionsFor(registry).train.push(subscription);
        else if(event===EVENT_PLAYER_UNIT_UPGRADE_FINISH)subscriptionsFor(registry).upgrade.push(subscription);
        else if (event === EVENT_PLAYER_UNIT_RESEARCH_FINISH) subscriptionsFor(registry).research.push(subscription);
        else if (event === EVENT_PLAYER_UNIT_DEATH) registry.registerDeath(t.id);
        else ctx.emit({kind: "UnimplementedNative", name: `${name}:unsupported-event`});
      }
      registry.noteRegisteredEvent(eventTag);
      return vhandle(null);
    });
  };
  registerUnitEvent("TriggerRegisterAnyUnitEventBJ", "AnyUnitEventBJ", null, 1);
  registerUnitEvent("TriggerRegisterPlayerUnitEventSimple", "PlayerUnitEventSimple", 1, 2);

  vm.registerNative('TriggerRegisterUnitEvent',(ctx,args)=>{
   const trigger=args[0]?.t==='handle'&&args[0].v!==null?ctx.handles.get(args[0].v):undefined;
   const unit=args[1]?.t==='handle'&&args[1].v!==null?ctx.handles.get(args[1].v):undefined;
   const event=args[2]?.t==='int'?args[2].v:null;
   if(trigger?.kind==='trigger'&&unit?.kind==='unit'){
    if(event===EVENT_UNIT_TRAIN_FINISH)subscriptionsFor(registry).train.push({triggerId:trigger.id,playerId:null,unitId:unit.id});
    else ctx.emit({kind:'UnimplementedNative',name:'TriggerRegisterUnitEvent:unsupported-event'});
   }
   registry.noteRegisteredEvent('UnitEvent');return vhandle(null);
  });
  const registerRange=(name:string,simple:boolean)=>vm.registerNative(name,(ctx,args)=>{
   const trigger=args[0]?.t==='handle'&&args[0].v!==null?ctx.handles.get(args[0].v):undefined;
   const arg=args[simple?2:1],center=arg?.t==='handle'&&arg.v!==null?ctx.handles.get(arg.v):undefined;
   const distance=args[simple?1:2],radiusU=distance?.t==='int'||distance?.t==='real'?distance.v:NaN;
   if(trigger?.kind==='trigger'&&center?.kind==='unit'&&Number.isFinite(radiusU)&&radiusU>=0){
    const unit=ctx.sim?.getUnit(center.id),inside=new Set<number>();
    // Existing occupants are the baseline; later ordinary entry/spawn is observed by the bridge.
    if(unit)for(const e of ctx.sim!.entities.values())if(e.alive&&e.id!==unit.id&&(e.x-unit.x)**2+(e.y-unit.y)**2<=radiusU**2)inside.add(e.id);
    registry.unitRangeSubs.push({triggerId:trigger.id,unitId:center.id,radiusU,filter:simple?undefined:args[3],inside});
   }
   registry.noteRegisteredEvent(simple?'UnitInRangeSimple':'UnitInRange');return vhandle(null);
  });
  registerRange('TriggerRegisterUnitInRangeSimple',true);
  registerRange('TriggerRegisterUnitInRange',false);

  vm.registerNative("TriggerRegisterDialogEvent", (ctx, args) => {
    const trigger = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const dialog = args[1]?.t === "handle" && args[1].v !== null ? ctx.handles.get(args[1].v) : undefined;
    if (trigger?.kind === "trigger" && dialog?.kind === "dialog") {
      registry.registerDialog(trigger.id, dialog.id);
      // S-A2: Ne 다이얼로그(이 맵 전용)만 표적 — dialog.ts 함수 내부에서 이름 확인 후 아니면 no-op.
      restoreLostModeDialogButtons(vm, ctx, dialog.id);
    }
    registry.noteRegisteredEvent("DialogEvent");
    return vhandle(null);
  });

  vm.registerNative("TriggerRegisterPlayerStateEvent", (ctx, args) => {
    const trigger = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const playerId = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    const stateKey = args[2]?.t === "int" || args[2]?.t === "real" ? Math.trunc(args[2].v) : 0;
    const op = args[3]?.t === "int" || args[3]?.t === "real" ? Math.trunc(args[3].v) : 2;
    const value = args[4]?.t === "int" || args[4]?.t === "real" ? Math.trunc(args[4].v) : 0;
    if (trigger?.kind === "trigger" && playerId >= 0) registry.registerPlayerState({ triggerId: trigger.id, playerId, stateKey, op, value });
    registry.noteRegisteredEvent("PlayerStateEvent");
    return vhandle(null);
  });

  const registerTimed = (name: string, periodic: boolean) => {
    vm.registerNative(name, (ctx, args) => {
      const trigger = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
      const timeout = args[1]?.t === "int" || args[1]?.t === "real" ? args[1].v : 0;
      if (trigger?.kind === "trigger") registry.registerTimedTrigger(trigger.id, secondsToTicks(timeout), periodic);
      registry.noteRegisteredEvent(periodic ? "TimerEventPeriodic" : "TimerEventSingle");
      return vhandle(null);
    });
  };
  registerTimed("TriggerRegisterTimerEventSingle", false);
  registerTimed("TriggerRegisterTimerEventPeriodic", true);

  // ---- 그 외 이벤트 종류: 등록만(레지스트리 카운트) — 발화 배선은 스코프 밖(R-208 이후 슬라이스). ----
  const registerOnly = (name: string, eventTag: string) => {
    vm.registerNative(name, () => {
      registry.noteRegisteredEvent(eventTag);
      return vhandle(null);
    });
  };
  registerOnly("TriggerRegisterLeaveRectSimple", "LeaveRectSimple");
  registerOnly("TriggerRegisterPlayerUnitEvent", "PlayerUnitEvent");
  registerOnly("TriggerRegisterPlayerEventLeave", "PlayerEventLeave");
  registerOnly("TriggerRegisterPlayerSelectionEventBJ", "PlayerSelectionEventBJ");
  registerOnly("TriggerRegisterPlayerEventEndCinematic", "PlayerEventEndCinematic");
  registerOnly("TriggerRegisterGameLoadedEventBJ", "GameLoadedEventBJ");
}
