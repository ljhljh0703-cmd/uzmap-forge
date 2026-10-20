/**
 * R-203 M-2 natives — 오더 클러스터: IssuePointOrderByIdLoc/ById·IssueTargetOrderById·
 * IssueImmediateOrderById·SetUnitMoveSpeed·GetUnitDefaultMoveSpeed.
 * 계약: docs/MOVEMENT_LOOP_DESIGN.md §3.1(오더 어휘 표) §3.2(엔티티 필드) §7 INV-D5(미지 오더 관측 가능 무시).
 * 오더 id는 커뮤니티 문서화된 WC3 상수(사실/interface 취급, clean-room 안전 — 실측 근거 §2.1/§3.1).
 *
 * RM-1 관례(units.ts entOf와 동일 정신): 유닛 상태의 단일 진실 = sim UnitEntity. 엔티티가 없으면
 * (sim 미주입 격리 VM, 또는 defStore 미주입이라 CreateUnit이 엔티티를 스폰하지 않은 경우) 이동은
 * 무의미하므로 전 native가 no-op+false로 폴백한다(핸들 data 미러 없음 — §3.1 registration 주석).
 *
 * SetUnitMoveSpeed 상한 캡(design §3.1 `gc.maxUnitSpeedU`)은 이 슬라이스 스코프에서 보류한다 —
 * GameConstants는 현재 Sim/NativeCallContext에 배선되지 않았고(installCombat에만 opts로 직접 주입,
 * 이 파일이 손댈 수 있는 파일 목록엔 sim.ts가 없음) 그 배선은 스코프 밖이다. 하한(0) 클램프만 적용.
 */
import type { JassVm, NativeCallContext, JassValue } from "../vm.ts";
import { vbool, vreal, vint } from "../vm.ts";
import { clampInt } from "../../sim/balance/fixed.ts";
import {assignPointMove} from '../../sim/movement.ts';

/** 커뮤니티 문서화 WC3 오더 id(사실 취급 — MOVEMENT_LOOP_DESIGN §2.1 실측: move 244사이트 등). */
export const ORDER_MOVE = 851986;
export const ORDER_STOP = 851972;
export const ORDER_ATTACK = 851983;

function unitOf(ctx: NativeCallContext, v: JassValue | undefined) {
  if (v?.t === "handle" && v.v !== null) {
    const h = ctx.handles.get(v.v);
    if (h && h.kind === "unit") return h;
  }
  return undefined;
}

function num(v: JassValue | undefined): number {
  if (!v) return 0;
  if (v.t === "real" || v.t === "int") return v.v as number;
  return 0;
}

/** location 핸들(kind:"location", GetRectCenter 등이 생성)에서 x/y 추출 — 무효면 {0,0}(throw 금지). */
function locXY(ctx: NativeCallContext, v: JassValue | undefined): { x: number; y: number } {
  if (v?.t === "handle" && v.v !== null) {
    const h = ctx.handles.get(v.v);
    if (h && h.kind === "location") return { x: (h.data.x as number) ?? 0, y: (h.data.y as number) ?? 0 };
  }
  return { x: 0, y: 0 };
}

/**
 * 851986(move) 공통 처리 — IssuePointOrderByIdLoc/ById 양쪽이 공유(§3.1 "ByIdLoc와 동일 처리").
 * sim 엔티티 없으면 no-op+false. move 아니면 UnknownOrder emit+false(INV-D5). move면 동일 목표
 * 재오더 dedupe(legsCompleted 미증가, §3.1/§5.3) 후 true.
 */
function dispatchPointOrder(ctx: NativeCallContext, unitArg: JassValue | undefined, orderId: number, x: number, y: number): boolean {
  const u = unitOf(ctx, unitArg);
  const entity = u ? ctx.sim?.getUnit(u.id) : undefined;
  if (!entity) return false;

  if (orderId !== ORDER_MOVE) {
    ctx.sim!.emit({ kind: "UnknownOrder", orderId, unitId: entity.id });
    return false;
  }

  if(!Number.isFinite(x)||!Number.isFinite(y)||!entity.alive)return false;
  ctx.sim!.cancelTargetAbilityOrders(entity.id);delete entity.attackTargetId;return assignPointMove(entity,x,y);
}

export function registerOrderNatives(vm: JassVm): void {
  vm.registerNative("IssuePointOrderByIdLoc", (ctx, args) => {
    const orderId = args[1]?.t === "int" ? args[1].v : 0;
    const loc = locXY(ctx, args[2]);
    return vbool(dispatchPointOrder(ctx, args[0], orderId, loc.x, loc.y));
  });

  vm.registerNative("IssuePointOrderById", (ctx, args) => {
    const orderId = args[1]?.t === "int" ? args[1].v : 0;
    return vbool(dispatchPointOrder(ctx, args[0], orderId, num(args[2]), num(args[3])));
  });

  vm.registerNative("IssueTargetOrderById", (ctx, args) => {
    const u=unitOf(ctx,args[0]),entity=u?ctx.sim?.getUnit(u.id):undefined,orderId=num(args[1]);
    if(!entity?.alive)return vbool(false);
    if(orderId===ORDER_ATTACK){
      const target=unitOf(ctx,args[2]),other=target?ctx.sim?.getUnit(target.id):undefined;
      if(!other?.alive||other.owner===entity.owner||!(ctx.sim?.defStore?.getDef(entity.typeId).attack||ctx.sim?.defStore?.getDef(entity.typeId).secondaryAttack))return vbool(false);
      ctx.sim!.cancelTargetAbilityOrders(entity.id);entity.attackTargetId=other.id;return vbool(true);
    }
    ctx.sim!.emit({kind:'UnknownOrder',orderId,unitId:entity.id});return vbool(false);
  });

  vm.registerNative("IssueImmediateOrderById", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    const entity = u ? ctx.sim?.getUnit(u.id) : undefined;
    const orderId = args[1]?.t === "int" ? args[1].v : 0;
    if (!entity) return vbool(false);
    if (orderId === ORDER_STOP) {
      ctx.sim!.cancelTargetAbilityOrders(entity.id);entity.orderActive = 0;delete entity.attackTargetId;
      return vbool(true);
    }
    ctx.sim!.emit({ kind: "UnknownOrder", orderId, unitId: entity.id });
    return vbool(false);
  });

  // 실측 1사이트(×0.85 슬로우). 상한 캡 보류 사유는 파일 헤더 참조 — 하한 0만 적용.
  vm.registerNative("SetUnitMoveSpeed", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    const entity = u ? ctx.sim?.getUnit(u.id) : undefined;
    if (entity) {
      entity.moveSpeedU = clampInt(Math.round(num(args[1])), 0);
    }
    return vint(0); // returns nothing 관례(units.ts SetUnitX 등과 동일 — 코드베이스 컨벤션)
  });

  vm.registerNative("GetUnitDefaultMoveSpeed", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    const entity = u ? ctx.sim?.getUnit(u.id) : undefined;
    if (!entity) return vreal(0);
    const def = ctx.sim?.defStore?.getDef(entity.typeId);
    return vreal(def ? def.moveSpeedU : entity.moveSpeedU);
  });
}
