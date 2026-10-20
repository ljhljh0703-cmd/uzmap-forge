/**
 * R-206a natives — 그룹 클러스터. group.data.units는 삽입순 배열(Set 금지 — INV-D4).
 * ForGroup류는 ctx.callVm으로 콜백 동기 재진입(MAP §3 R-206a 결정 그대로).
 * 순회는 스냅샷(호출 시점 배열 slice) 기준 — 콜백 중 그룹이 변형돼도 결정론 유지(§5 매트릭스 "깨질 수 있는 곳 top3 ②"의 규정대로).
 */
import type { JassVm, NativeCallContext, JassValue } from "../vm.ts";
import { vhandle, vint, vbool, VUNKNOWN } from "../vm.ts";
import { evalBoolExpr } from "./registry.ts";
import { playerIndexOf } from "./players.ts";
import { fourCC } from "./units.ts";

export function registerGroupNatives(vm: JassVm): void {
  vm.registerNative("CreateGroup", (ctx) => vhandle(ctx.handles.create("group", { units: [] as number[] }).id));
  vm.registerNative("DestroyGroup", (ctx, args) => {
    if (args[0]?.t === "handle" && args[0].v !== null) ctx.handles.delete(args[0].v);
    return vint(0);
  });
  vm.registerNative("GroupClear", (ctx, args) => {
    const g = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (g) (g.data.units as number[]).length = 0;
    return vint(0);
  });
  vm.registerNative("GroupAddUnit", (ctx, args) => {
    const g = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const u = args[1];
    if (g && u?.t === "handle" && u.v !== null) {
      const units = g.data.units as number[];
      if (!units.includes(u.v)) units.push(u.v);
    }
    return vbool(true);
  });
  vm.registerNative("GroupRemoveUnit", (ctx, args) => {
    const g = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const u = args[1];
    if (g && u?.t === "handle" && u.v !== null) {
      const units = g.data.units as number[];
      const idx = units.indexOf(u.v);
      if (idx >= 0) units.splice(idx, 1);
    }
    return vbool(true);
  });
  vm.registerNative("BlzGroupGetSize", (ctx, args) => {
    const g = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vint(g ? (g.data.units as number[]).length : 0);
  });
  // C-1b(DISPATCH_SONNET_C1_COMBINE §2 C-1b, 실측: 11회) — 클래식 JASS 그룹 카운트. BlzGroupGetSize와
  // 동일 시맨틱(현재 그룹 소속 유닛 수) — 새 저장소 발명 0, 같은 units 배열 길이를 그대로 읽는다.
  vm.registerNative("CountUnitsInGroup", (ctx, args) => {
    const g = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    return vint(g ? (g.data.units as number[]).length : 0);
  });
  vm.registerNative("IsUnitInGroup", (ctx, args) => {
    const u = args[0];
    const g = args[1]?.t === "handle" && args[1].v !== null ? ctx.handles.get(args[1].v) : undefined;
    if (!g || !(u?.t === "handle") || u.v === null) return vbool(false);
    return vbool((g.data.units as number[]).includes(u.v));
  });

  const forGroupImpl = (ctx: NativeCallContext, args: JassValue[]) => {
    const g = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const code = args[1];
    if (g && code) {
      const snapshot = (g.data.units as number[]).slice(); // 스냅샷 순회(결정론)
      for (const unitId of snapshot) {
        // 콜백 안에서 GetEnumUnit()이 이 유닛을 보도록 임시 handle 인자는 없음(JASS 시맨틱상
        // GetEnumUnit()은 별도 native — bridge 대신 스레드-무관 "마지막 enum 유닛" 슬롯으로 최소 구현.
        lastEnumUnit.set(ctx.threadId, unitId);
        ctx.callVm(code, []);
      }
      lastEnumUnit.delete(ctx.threadId);
    }
    return vint(0);
  };
  vm.registerNative("ForGroup", forGroupImpl);
  vm.registerNative("ForGroupBJ", forGroupImpl); // blizzard.j BJ 변형 — 동일 시맨틱(콜백 재진입)

  // R-307c: 렉트/범위 열거 실 구현 — sim 엔티티를 삽입순(INV-D4)으로 훑어 조건 통과분을 group에 채운다.
  // 크립 이동 오더의 근간(실맵 Sd: ForGroup(GroupEnumUnitsInRect(레인렉트), 이동오더) — 이 열거가 비면
  // 크립이 첫 오더를 못 받아 멈춘다, 실측 2026-07-13). filter boolexpr는 GetFilterUnit/GetEnumUnit 슬롯을
  // 세팅해 per-unit 평가(통과분만 추가) — filter=null/미지면 렉트 내 alive 전부(WC3 null-filter 시맨틱).
  const numOf = (v: JassValue | undefined): number => (v && (v.t === "real" || v.t === "int") ? (v.v as number) : 0);
  const enumInto = (
    ctx: NativeCallContext,
    groupArg: JassValue | undefined,
    filterArg: JassValue | undefined,
    pred: (e: { x: number; y: number; owner: number; alive: boolean; typeId: string }) => boolean,
  ): void => {
    const g = groupArg?.t === "handle" && groupArg.v !== null ? ctx.handles.get(groupArg.v) : undefined;
    if (!g) return;
    const units = g.data.units as number[];units.length = 0;
    if (!ctx.sim) return;
    // All spatial searches use the existing condition evaluator. A nested search
    // restores the outer filter unit even when its callback throws.
    for (const e of ctx.sim.entities.values()) {
      if(e.alive&&pred(e)&&evaluateUnitFilter(ctx,e.id,filterArg))units.push(e.id);
    }
  };
  const rectBounds = (ctx: NativeCallContext, v: JassValue | undefined) => {
    const r = v?.t === "handle" && v.v !== null ? ctx.handles.get(v.v) : undefined;
    if (!r || r.kind !== "rect") return null;
    return { minx: r.data.minx as number, miny: r.data.miny as number, maxx: r.data.maxx as number, maxy: r.data.maxy as number };
  };
  vm.registerNative("GroupEnumUnitsInRect", (ctx, args) => {
    const b = rectBounds(ctx, args[1]);
    enumInto(ctx, args[0], args[2], (e) => b !== null && e.x >= b.minx && e.x <= b.maxx && e.y >= b.miny && e.y <= b.maxy);
    return vint(0);
  });
  vm.registerNative("GroupEnumUnitsInRange", (ctx, args) => {
    const cx = numOf(args[1]), cy = numOf(args[2]), r2 = numOf(args[3]) * numOf(args[3]);
    enumInto(ctx, args[0], args[4], (e) => {
      const dx = e.x - cx, dy = e.y - cy;
      return dx * dx + dy * dy <= r2;
    });
    return vint(0);
  });
  vm.registerNative("GroupEnumUnitsInRangeOfLoc", (ctx,args)=>{
    const loc=args[1]?.t==='handle'&&args[1].v!==null?ctx.handles.get(args[1].v):undefined;
    const valid=loc?.kind==='location',cx=valid?Number(loc.data.x):0,cy=valid?Number(loc.data.y):0,r2=numOf(args[2])**2;
    enumInto(ctx,args[0],args[3],e=>Boolean(valid)&&(e.x-cx)**2+(e.y-cy)**2<=r2);return vint(0);
  });
  // C-2a(DISPATCH_SONNET_C2_GROUPENUM) — 실맵 실측: sB()(GetUnitsOfPlayerAndTypeId BJ) 등 소유자 열거
  // 전량이 이 native에 의존(3-젬 병합 A00R 포함 — war3map.j eQ, RETURN_C2 §3). owner 술어 + 필터 실행
  // (evalFilter=true, §1c 근거).
  vm.registerNative("GroupEnumUnitsOfPlayer", (ctx, args) => {
    const targetIdx = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    enumInto(ctx, args[0], args[2], (e) => e.owner === targetIdx);
    return vint(0);
  });
  // C-2b — 실맵 실측(2회, §0.2): 둘 다 pB(unitname=UnitId2String(typeId)) 계열 라이브러리 경유 — 문자열
  // 인자가 이미 UnitId2String과 동일한 4CC 포맷이라 원장/DefStore 추정 없이 엔티티 typeId(FourCC 문자열)와
  // 직접 비교 가능(native 인자 자체가 typeId를 담고 있음 — 발명 아님).
  vm.registerNative("GroupEnumUnitsOfType", (ctx, args) => {
    const wantType = args[1]?.t === "string" ? args[1].v : "";
    enumInto(ctx, args[0], args[2], (e) => e.typeId === wantType);
    return vint(0);
  });
  vm.registerNative("GetEnumUnit", (ctx) => {
    const id = lastEnumUnit.get(ctx.threadId);
    return id !== undefined ? vhandle(id) : VUNKNOWN;
  });
  // GetFilterUnit — 열거 필터(boolexpr) 평가 중 현재 후보 유닛(GetEnumUnit과 동일 슬롯). 필터 함수가 소비.
  vm.registerNative("GetFilterUnit", (ctx) => {
    const id = lastEnumUnit.get(ctx.threadId);
    return id !== undefined ? vhandle(id) : VUNKNOWN;
  });
  // C-2c — 표준 Blizzard.j 헬퍼(GetUnitsOfPlayerAndTypeId BJ가 참조하는 필터 본문, war3map.j의
  // `filterGetUnitsOfPlayerAndTypeId=Filter(function GetUnitsOfPlayerAndTypeIdFilter)`). 이 맵의
  // war3map.j 추출본엔 이 함수 정의 자체가 없다(실측: parseJass().functionIndex.has(...)===false —
  // 같은 부류의 다른 표준 필터, 예 GetUnitsInRectOfPlayerFilter도 동형으로 없음). war3map.j는 맵 고유
  // 스크립트만 담고 Blizzard.j 표준 라이브러리는 게임 클라이언트가 별도 공급하는 사본이라 이 프로젝트의
  // "war3map.j만 파스" 추출 경로에는 애초에 안 잡히는 것으로 판단(다른 맵-저작 함수는 전부 functionIndex에
  // 있음 — sB/kB/nc/jB 등 실측 확인). 공개·표준 동작이라 AGENTS.md Hard Contract(2026-07-20 개정: 스톡
  // 동작 참조·구현 허용) 위반 아님 — 원문 그대로: GetUnitTypeId(GetFilterUnit())==bj_groupEnumTypeId.
  vm.registerNative("GetUnitsOfPlayerAndTypeIdFilter", (ctx) => {
    const id = lastEnumUnit.get(ctx.threadId);
    const entity = id !== undefined && ctx.sim ? ctx.sim.getUnit(id) : undefined;
    const want = ctx.getGlobal("bj_groupEnumTypeId");
    const wantId = want.t === "int" ? want.v : 0;
    return vbool(!!entity && entity.typeId === fourCC(wantId));
  });
  vm.registerNative("GroupPickRandomUnit", (ctx, args) => {
    const g = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    if (!ctx.sim || !g) return vhandle(null);
    const units = g.data.units as number[];
    if (units.length === 0) return vhandle(null);
    const idx = ctx.sim.rng.int(0, units.length - 1); // INV-D1: sim.rng only
    return vhandle(units[idx]!);
  });
}

/** ForGroup 콜백 중 GetEnumUnit()이 조회할 "현재 순회 유닛" — 스레드(재진입 문맥)별로 최신값만 유지. */
const lastEnumUnit = new Map<number, number>();

/** Reuse the same candidate slot for native event filters and nested group searches. */
export function evaluateUnitFilter(ctx:NativeCallContext,unitId:number,filter:JassValue|undefined):boolean{
 const previous=lastEnumUnit.get(ctx.threadId);lastEnumUnit.set(ctx.threadId,unitId);
 try{return evalBoolExpr(ctx,filter);}finally{if(previous===undefined)lastEnumUnit.delete(ctx.threadId);else lastEnumUnit.set(ctx.threadId,previous);}
}
