/**
 * R-207 확장 — 타이머 클러스터: CreateTimer/TimerStart/StartTimerBJ/PauseTimer/ResumeTimer/DestroyTimer/
 * TimerGetElapsed/TimerGetRemaining/GetExpiredTimer + sim "timers" tick phase 만료 발화 훅.
 * 계약: docs/MOVEMENT_LOOP_DESIGN.md §2.3(웨이브 구동: StartTimerBJ($e)→TriggerRegisterTimerExpireEvent→
 * 스폰 스레드) §5.2(발화 계약). TriggerRegisterTimerExpireEvent 자체(구독 등록)는 natives/triggers.ts —
 * 이 파일은 등록된 구독(registry.timerSubs)을 만료 시 조회·발화만 한다.
 *
 * 타이머 상태는 handle.data에 직접 보관(다른 natives 모듈 관례 — dialog/multiboard와 동일):
 * remainingTicks·timeoutTicks·periodic·callback(TimerStart 4번째 인자, StartTimerBJ는 항상 null)·running.
 * HandleTable은 kind별 enumerate를 제공하지 않으므로(vm.ts는 수정 스코프 밖) 이 모듈이 CreateTimer
 * 시점에 발급된 id를 별도 배열(timerIds)로 추적한다 — "timers" tick 훅은 그 목록만 순회(생성순=INV-D4).
 *
 * misc_stubs.ts가 이미 CreateTimer/DestroyTimer/TimerStart/PauseTimer/ResumeTimer를 no-op으로 등록해
 * 두었다(수정 금지 파일) — installNatives에서 이 모듈을 misc_stubs 이후에 호출해 동일 이름을
 * 재등록(overwrite)함으로써 실 구현으로 교체한다(vm의 native Map은 마지막 등록이 이긴다).
 */
import type { JassVm, NativeCallContext, JassValue, HandleObj } from "../vm.ts";
import { vint, vreal, vhandle } from "../vm.ts";
import type { Sim } from "../../sim/sim.ts";
import { secondsToTicks } from "../../sim/ticks.ts";
import { DT } from "../../sim/rng.ts";
import { fireTrigger, type TriggerRegistry } from "./registry.ts";

interface TimerData {
  remainingTicks: number;
  timeoutTicks: number;
  periodic: boolean;
  callback: JassValue | null;
  running: boolean;
}

function freshTimerData(): TimerData {
  return { remainingTicks: 0, timeoutTicks: 0, periodic: false, callback: null, running: false };
}

function timerDataOf(t: HandleObj): TimerData {
  return t.data as unknown as TimerData;
}

function timerOf(ctx: NativeCallContext, v: JassValue | undefined): HandleObj | undefined {
  if (v?.t === "handle" && v.v !== null) {
    const h = ctx.handles.get(v.v);
    if (h && h.kind === "timer") return h;
  }
  return undefined;
}

function num(v: JassValue | undefined): number {
  if (!v) return 0;
  if (v.t === "real" || v.t === "int") return v.v as number;
  return 0;
}

/**
 * R-207 확장: 타이머 natives 등록 + "timers" tick phase에 만료 발화 훅을 꽂는다.
 * installNatives(index.ts)가 misc_stubs 등록 이후·registerEventBridge 이전에 (vm, sim, registry) 주입으로
 * 1회 호출한다(같은 vm/sim에 두 번 부르면 timerIds 목록이 중복 누적된다 — installNatives 자체의 기존
 * "인스턴스당 1회" 계약을 그대로 상속).
 */
export function registerTimerNatives(vm: JassVm, sim: Sim, registry: TriggerRegistry): void {
  const timerIds: number[] = []; // CreateTimer 호출순(=INV-D4 삽입순) — 만료 훅이 이 순서로 순회.

  vm.registerNative("CreateTimer", (ctx) => {
    const h = ctx.handles.create("timer", freshTimerData() as unknown as Record<string, unknown>);
    timerIds.push(h.id);
    return vhandle(h.id);
  });

  vm.registerNative("DestroyTimer", (ctx, args) => {
    const t = timerOf(ctx, args[0]);
    if (t) ctx.handles.delete(t.id);
    return vint(0);
  });

  const startTimer = (t: HandleObj, timeoutSec: number, periodic: boolean, callback: JassValue | null) => {
    const d = timerDataOf(t);
    const timeoutTicks = Math.max(0, secondsToTicks(timeoutSec));
    d.timeoutTicks = timeoutTicks;
    d.periodic = periodic;
    d.callback = callback;
    d.remainingTicks = timeoutTicks;
    d.running = true;
  };

  // TimerStart(timer, timeout, periodic, handlerFunc) — 원본 native 인자 순서.
  vm.registerNative("TimerStart", (ctx, args) => {
    const t = timerOf(ctx, args[0]);
    if (t) startTimer(t, num(args[1]), args[2]?.t === "bool" ? args[2].v : false, args[3] ?? null);
    return vint(0);
  });

  // StartTimerBJ(timer, periodic, timeout) — BJ 인자 순서 반전, 콜백 없음(TriggerRegisterTimerExpireEvent
  // 병행 관례 — 실측 §2.3 "StartTimerBJ($e,false,18|40)").
  vm.registerNative("StartTimerBJ", (ctx, args) => {
    const t = timerOf(ctx, args[0]);
    if (t) startTimer(t, num(args[2]), args[1]?.t === "bool" ? args[1].v : false, null);
    return vint(0);
  });

  const setTimerPaused=(ctx:NativeCallContext,value:JassValue|undefined,paused:boolean)=>{
    const t=timerOf(ctx,value);if(t)timerDataOf(t).running=!paused;return vint(0);
  };
  vm.registerNative("PauseTimer",(ctx,args)=>setTimerPaused(ctx,args[0],true));
  vm.registerNative("ResumeTimer",(ctx,args)=>setTimerPaused(ctx,args[0],false));
  vm.registerNative("PauseTimerBJ",(ctx,args)=>setTimerPaused(ctx,args[1],args[0]?.t==='bool'&&args[0].v));

  vm.registerNative("TimerGetElapsed", (ctx, args) => {
    const t = timerOf(ctx, args[0]);
    if (!t) return vreal(0);
    const d = timerDataOf(t);
    return vreal((d.timeoutTicks - d.remainingTicks) * DT);
  });
  vm.registerNative("TimerGetRemaining", (ctx, args) => {
    const t = timerOf(ctx, args[0]);
    if (!t) return vreal(0);
    return vreal(timerDataOf(t).remainingTicks * DT);
  });

  // 발화 컨텍스트(R-207) — 만료 발화 중(콜백/구독 트리거) threadMeta.expiredTimer로 제공.
  vm.registerNative("GetExpiredTimer", (ctx) => ctx.threadMeta.expiredTimer ?? vhandle(null));

  sim.registerTickPhase("timers", () => {
    for (const id of timerIds) {
      const t = vm.handles.get(id);
      if (!t) continue; // DestroyTimer로 이미 삭제됨
      const d = timerDataOf(t);
      if (!d.running) continue;
      d.remainingTicks -= 1;
      if (d.remainingTicks > 0) continue;

      // 만료(§2.3/§5.2): meta{expiredTimer} 구성 — GetExpiredTimer가 콜백·구독 트리거 양쪽에서 봄.
      // 콜백(callback code)과 구독 트리거(registry.timerSubs)는 상호 배타가 아니라 병존 가능(원본 WC3
      // 시맨틱 — TimerStart 콜백 + TriggerRegisterTimerExpireEvent 동시 사용 가능).
      const meta = { expiredTimer: vhandle(t.id) };
      if (d.callback && d.callback.t === "code" && d.callback.v !== null) {
        vm.spawnThread(d.callback, [], meta);
      }
      const subs = registry.timerSubs.get(t.id);
      if (subs) {
        for (const triggerId of subs) {
          const trig = vm.handles.get(triggerId);
          if (trig) fireTrigger(vm, trig, meta);
        }
      }

      if (d.periodic) {
        d.remainingTicks = d.timeoutTicks; // 재장전
      } else {
        d.running = false; // 정지(단발)
      }
    }
  });
}
