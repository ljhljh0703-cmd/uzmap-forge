/**
 * R-206a natives — 유닛 수명 클러스터(얕은 엔티티: typeId+소유+위치+생존만 — 스탯 충실도는 R-202/R-401).
 * 실측 top(§2.2 전체파일): GetUnitTypeId 3078·ReplaceUnitBJ 1545·GetUnitUserData 582·GetUnitLoc 542
 * ·GetAttacker 444·GetKillingUnit 378. rawcode는 이미 u32로 패킹된 정수라 그대로 typeId로 비교 가능
 * (ast.ts RawcodeLiteral 주석 — 별도 4CC 디코딩 불필요).
 */
import type { JassVm, NativeCallContext, JassValue } from "../vm.ts";
import { vhandle, vint, vreal, vbool, vstring } from "../vm.ts";
import { playerIndexOf } from "./players.ts";
import { createEntity } from "../../sim/unit-entity.ts";
import type { AttackTypeId } from "../../sim/balance/config.ts";

/** u32 rawcode → 4CC 문자열(lexer 패킹 스킴 역변환, UnitId2String과 동일) — DefStore.getDef 키. */
export {fourCC, rawCodeOf} from "../../ir/fourcc.ts";
import {fourCC, rawCodeOf} from "../../ir/fourcc.ts";

function num(v: JassValue | undefined): number {
  if (!v) return 0;
  if (v.t === "real" || v.t === "int") return v.v as number;
  return 0;
}

interface UnitData {
  typeId: number;
  owner: number;
  x: number;
  y: number;
  face: number;
  hp: number;
  hpMax: number;
  alive: boolean;
  userData: number;
  states: Map<string, JassValue>;
  abilities: Map<number, number>;
  /** RM-1: sim 엔티티로 백킹된 유닛인가(라이브). true인데 sim.getUnit=undefined면 "죽어서 제거됨"으로 판정. */
  simBacked: boolean;
  acquireRangeU?:number;
}

function unitOf(ctx: NativeCallContext, v: JassValue | undefined) {
  if (v?.t === "handle" && v.v !== null) {
    const h = ctx.handles.get(v.v);
    if (h && h.kind === "unit") return h;
  }
  return undefined;
}

/** E-2/E-3 bridge reuse: create a VM unit handle and its RM-1 Sim entity through the native authority path. */
export function createUnitEntityHandle(ctx: NativeCallContext, ownerIdx: number, typeId: number, x: number, y: number, face: number) {
  const sim = ctx.sim;
  const def = sim && sim.defStore ? sim.defStore.getDef(fourCC(typeId)) : undefined;
  const hpMax = def ? def.hpMax : 1;
  const data: UnitData = { typeId, owner: ownerIdx, x, y, face, hp: hpMax, hpMax, alive: true, userData: 0, acquireRangeU:def?.sourceAcquireRangeU??def?.attack?.acquireU??0, states: new Map(), abilities: new Map(), simBacked: Boolean(sim && def) };
  const h = ctx.handles.create("unit", data as unknown as Record<string, unknown>);
  if (sim && def) {
    sim.spawnUnit(createEntity(def, { id: h.id, owner: ownerIdx, x: Math.round(x), y: Math.round(y), facing: Math.round(face) }));
  }
  return h;
}

/**
 * RM-1(dual-model 통합, 2026-07-12): 유닛 상태의 단일 진실 = sim `UnitEntity`(라이브 — 핸들 id=엔티티 id).
 * 아래 접근자는 엔티티 우선으로 읽고 쓴다 — combat이 바꾼 hp/생존이 스크립트에도 반영됨(divergence 제거).
 * 미주입(defStore/sim 없는 격리 VM 테스트)이면 핸들 data로 폴백(하위호환). typeId(int)·states는 핸들 잔류.
 */
function entOf(ctx: NativeCallContext, u: { id: number }) {
  return ctx.sim?.getUnit(u.id);
}

export function registerUnitNatives(vm: JassVm): void {
  // sim + defStore가 주입돼 있으면(스모크·라이브) 실 스탯 Def로 sim 엔티티까지 스폰(핸들 id = 엔티티 id로 통일 →
  // 후속 조회·combat이 같은 유닛을 가리킴). 미주입(격리 VM 테스트)이면 얕은 폴백(hp1) — 하위호환.
  function createUnitEntity(ctx: NativeCallContext, ownerIdx: number, typeId: number, x: number, y: number, face: number) {
    return createUnitEntityHandle(ctx, ownerIdx, typeId, x, y, face);
  }

  vm.registerNative("SetUnitInvulnerable",(ctx,args)=>{
    const u=unitOf(ctx,args[0]);if(u){const value=args[1]?.t==="bool"&&args[1].v;const e=entOf(ctx,u);if(e)e.invulnerable=value;u.data.invulnerable=value;}return vint(0);
  });
  vm.registerNative('SetUnitLifePercentBJ',(ctx,args)=>{
    const u=unitOf(ctx,args[0]);if(!u)return vint(0);const entity=entOf(ctx,u),max=entity?.hpMax??Number(u.data.hpMax??0);
    setLife(ctx,u,max*Math.max(0,num(args[1]))*.01);return vint(0);
  });
  vm.registerNative("GetUnitName",(ctx,args)=>{
    const u=unitOf(ctx,args[0]);if(!u)return vstring("");
    const id=entOf(ctx,u)?.typeId??fourCC(u.data.typeId as number);return vstring(ctx.sim?.defStore?.getDef(id).name??"");
  });

  vm.registerNative("CreateUnit", (ctx, args) => {
    const ownerIdx = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    const typeId = args[1]?.t === "int" ? args[1].v : 0;
    const h = createUnitEntity(ctx, ownerIdx, typeId, num(args[2]), num(args[3]), num(args[4]));
    return vhandle(h.id);
  });

  // CreateNUnitsAtLoc(count, unitId, player, loc, face) — BJ 시그니처(실측: 149회). n개를 같은 좌표에
  // 스폰(오프셋 계산은 렌더/충돌 스코프라 생략) + 그룹으로 묶어 반환(bj_lastCreatedGroup 대응 없이
  // 반환값 자체를 group으로 — BJ 원본과 동일 반환형).
  vm.registerNative("CreateNUnitsAtLoc", (ctx, args) => {
    const n = args[0]?.t === "int" ? args[0].v : 0;
    const typeId = args[1]?.t === "int" ? args[1].v : 0;
    const ownerIdx = args[2] ? playerIndexOf(ctx, args[2]) : -1;
    const loc = args[3]?.t === "handle" && args[3].v !== null ? ctx.handles.get(args[3].v) : undefined;
    const x = loc ? (loc.data.x as number) : 0;
    const y = loc ? (loc.data.y as number) : 0;
    const face = num(args[4]);
    // Caller-local 1.28 Scripts/Blizzard.j: clear/reuse the scratch group, and
    // CreateUnitAtLocSaveLast updates bj_lastCreatedUnit on each iteration.
    const last=vm.getGlobal('bj_lastCreatedGroup');
    let group=last.t==='handle'&&last.v!==null?ctx.handles.get(last.v):undefined;
    if(group?.kind!=='group')group=ctx.handles.create('group',{units:[] as number[]});
    (group.data.units as number[]).length=0;
    ctx.setGlobal('bj_lastCreatedGroup',vhandle(group.id));
    for (let i = 0; i < Math.max(0, n); i++) {
      const h = createUnitEntity(ctx, ownerIdx, typeId, x, y, face);
      ctx.setGlobal("bj_lastCreatedUnit",vhandle(h.id));
      (group.data.units as number[]).push(h.id);
    }
    ctx.setGlobal("bj_lastCreatedGroup", vhandle(group.id));
    return vhandle(group.id);
  });

  vm.registerNative("ReplaceUnitBJ", (ctx, args) => {
    const which = unitOf(ctx, args[0]);
    const newTypeId = args[1]?.t === "int" ? args[1].v : 0;
    if (!which) return vhandle(null);
    const h = createUnitEntity(ctx, which.data.owner as number, newTypeId, which.data.x as number, which.data.y as number, which.data.face as number);
    which.data.alive = false; // 원본 제거(단순화 — 실제는 RemoveUnit 시맨틱)
    ctx.sim?.removeUnit(which.id); // sim 엔티티도 제거(티어 교체 = 옛 유닛 사라짐)
    ctx.setGlobal("bj_lastReplacedUnit", vhandle(h.id));
    return vhandle(h.id);
  });

  vm.registerNative("RemoveUnit", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    if (u) {
      u.data.alive = false;
      ctx.sim?.removeUnit(u.id); // 핸들 id = 엔티티 id
    }
    return vint(0);
  });
  const killUnit = (ctx:NativeCallContext,u:ReturnType<typeof unitOf>) => {
    if(!u)return;
    const e=entOf(ctx,u);
    const alive=e?e.alive:!u.data.simBacked&&u.data.alive===true;
    if(!alive)return;
    u.data.alive=false;u.data.hp=0;
    if(e){e.hp=0;ctx.sim!.settleUnitDeath(e.id);}
    else ctx.sim?.emit({kind:"UnitDied",unitId:u.id});
  };
  vm.registerNative("KillUnit",(ctx,args)=>{killUnit(ctx,unitOf(ctx,args[0]));return vint(0);});
  const setLife=(ctx:NativeCallContext,u:ReturnType<typeof unitOf>,value:number)=>{
    if(!u||!Number.isFinite(value))return;
    const e=entOf(ctx,u);if(u.data.simBacked&&!e)return;
    const life=Math.max(0,Math.min(e?.hpMax??Number(u.data.hpMax),Math.round(value)));
    if(life===0){killUnit(ctx,u);return;}
    if(e)e.hp=life;u.data.hp=life;
  };
  vm.registerNative("SetWidgetLife",(ctx,args)=>{setLife(ctx,unitOf(ctx,args[0]),num(args[1]));return vint(0);});
  vm.registerNative("GetWidgetLife",(ctx,args)=>{
    const u=unitOf(ctx,args[0]);return vreal(u?(entOf(ctx,u)?.hp??(u.data.simBacked?0:Number(u.data.hp))):0);
  });
  vm.registerNative("GetUnitPointValue",(ctx,args)=>{
    const u=unitOf(ctx,args[0]);if(!u)return vint(0);
    const point=ctx.sim?.defStore?.getDef(fourCC(Number(u.data.typeId))).pointValue;
    if(point===undefined){ctx.emit({kind:"UnimplementedNative",name:"GetUnitPointValue"});return vint(0);}
    return vint(point);
  });
  vm.registerNative("GetUnitAcquireRange",(ctx,args)=>{
    const u=unitOf(ctx,args[0]),e=u?entOf(ctx,u):undefined;
    return vreal(e?.acquireRangeU??(u&&!u.data.simBacked?Number(u.data.acquireRangeU??0):0));
  });
  vm.registerNative('SetUnitAcquireRange',(ctx,args)=>{
    const u=unitOf(ctx,args[0]),value=num(args[1]);if(!u||!Number.isFinite(value))return vint(0);
    const e=entOf(ctx,u);if(e)e.acquireRangeU=Math.max(0,Math.round(value));else if(!u.data.simBacked)u.data.acquireRangeU=Math.max(0,Math.round(value));
    return vint(0);
  });
  // RM-1: 엔티티 있으면 그 alive. 없는데 simBacked=true면 "죽어서 sim에서 제거됨"→false(combat 킬 반영).
  // simBacked=false(격리 VM)면 핸들 data.alive 폴백.
  const aliveOf = (ctx: NativeCallContext, u: ReturnType<typeof unitOf>): boolean => {
    if (!u) return false;
    const e = entOf(ctx, u);
    if (e) return e.alive;
    return u.data.simBacked ? false : (u.data.alive as boolean);
  };
  vm.registerNative("IsUnitAliveBJ", (ctx, args) => vbool(aliveOf(ctx, unitOf(ctx, args[0]))));
  vm.registerNative("UnitAlive", (ctx, args) => vbool(aliveOf(ctx, unitOf(ctx, args[0]))));

  vm.registerNative("GetUnitTypeId", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    return vint(u ? (u.data.typeId as number) : 0);
  });
  // rawcode(u32 패킹, lexer.ts와 동일 스킴: c0<<24|c1<<16|c2<<8|c3)를 4CC 문자열로 역변환.
  vm.registerNative("UnitId2String", (_ctx, args) => {
    const id = args[0]?.t === "int" ? args[0].v : 0;
    const u = id >>> 0;
    const chars = [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff];
    return vstring(String.fromCharCode(...chars));
  });
  // RM-1: 읽기=엔티티 우선, 쓰기=엔티티(라이브) + 핸들 미러(격리 폴백 일관). x/y/facing/owner/userData.
  const rX = (ctx: NativeCallContext, u: ReturnType<typeof unitOf>): number => (u ? (entOf(ctx, u)?.x ?? (u.data.x as number)) : 0);
  const rY = (ctx: NativeCallContext, u: ReturnType<typeof unitOf>): number => (u ? (entOf(ctx, u)?.y ?? (u.data.y as number)) : 0);
  const wXY = (ctx: NativeCallContext, u: ReturnType<typeof unitOf>, x?: number, y?: number): void => {
    if (!u) return;
    const e = entOf(ctx, u);
    if (x !== undefined) { if (e) e.x = Math.round(x); u.data.x = x; }
    if (y !== undefined) { if (e) e.y = Math.round(y); u.data.y = y; }
  };
  vm.registerNative("GetUnitUserData", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    return vint(u ? (entOf(ctx, u)?.userData ?? (u.data.userData as number)) : 0);
  });
  vm.registerNative("SetUnitUserData", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    if (u) {
      const v = args[1]?.t === "int" ? args[1].v : 0;
      const e = entOf(ctx, u);
      if (e) e.userData = v;
      u.data.userData = v;
    }
    return vint(0);
  });
  vm.registerNative("GetUnitX", (ctx, args) => vreal(rX(ctx, unitOf(ctx, args[0]))));
  vm.registerNative("GetUnitY", (ctx, args) => vreal(rY(ctx, unitOf(ctx, args[0]))));
  vm.registerNative("SetUnitX", (ctx, args) => { wXY(ctx, unitOf(ctx, args[0]), num(args[1]), undefined); return vint(0); });
  vm.registerNative("SetUnitY", (ctx, args) => { wXY(ctx, unitOf(ctx, args[0]), undefined, num(args[1])); return vint(0); });
  vm.registerNative("SetUnitPosition", (ctx, args) => { wXY(ctx, unitOf(ctx, args[0]), num(args[1]), num(args[2])); return vint(0); });
  vm.registerNative("GetUnitLoc", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    return vhandle(ctx.handles.create("location", { x: rX(ctx, u), y: rY(ctx, u) }).id);
  });
  // C-1b(DISPATCH_SONNET_C1_COMBINE §2 C-1b, 실측: 62회) — SetUnitPositionLoc(unit, location): 기존
  // wXY(§RM-1 read/write 헬퍼) + location 핸들(kind:"location", Location()/GetRectCenter()/GetUnitLoc()가
  // 만든 동일 모양)을 그대로 재사용. 새 좌표 저장소 발명 0 — SetUnitPosition(unit,x,y)의 location-핸들 변형.
  vm.registerNative("SetUnitPositionLoc", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    const loc = args[1]?.t === "handle" && args[1].v !== null ? ctx.handles.get(args[1].v) : undefined;
    if (loc && loc.kind === "location") wXY(ctx, u, loc.data.x as number, loc.data.y as number);
    return vint(0);
  });
  vm.registerNative("GetUnitFacing", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    return vreal(u ? (entOf(ctx, u)?.facing ?? (u.data.face as number)) : 0);
  });
  const setFacing=(ctx:NativeCallContext,args:JassValue[])=>{
    const u=unitOf(ctx,args[0]);if(u){const v=num(args[1]),e=entOf(ctx,u);if(e)e.facing=Math.round(v);u.data.face=v;}return vint(0);
  };
  vm.registerNative('SetUnitFacing',setFacing);
  // Classic Blizzard.j wrapper: position first, then face from loc toward lookAt (not a timed turn).
  vm.registerNative('SetUnitPositionLocFacingLocBJ',(ctx,args)=>{
    const loc=args[1]?.t==='handle'&&args[1].v!==null?ctx.handles.get(args[1].v):undefined;
    const look=args[2]?.t==='handle'&&args[2].v!==null?ctx.handles.get(args[2].v):undefined;
    if(loc?.kind==='location'&&look?.kind==='location'){
      wXY(ctx,unitOf(ctx,args[0]),loc.data.x as number,loc.data.y as number);
      setFacing(ctx,[args[0]!,vreal(Math.atan2((look.data.y as number)-(loc.data.y as number),(look.data.x as number)-(loc.data.x as number))*180/Math.PI)]);
    }
    return vint(0);
  });
  vm.registerNative("SetUnitOwner", (ctx, args) => {
    const u = unitOf(ctx, args[0]);
    const idx = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    if (u && idx >= 0) {
      const e = entOf(ctx, u);
      if (e) e.owner = idx;
      u.data.owner = idx;
    }
    return vint(0);
  });

  const abilitiesOf = (ctx: NativeCallContext, u: ReturnType<typeof unitOf>): Map<number, number> | undefined => {
    if (!u) return undefined;
    return entOf(ctx, u)?.abilities ?? (u.data.abilities as Map<number, number> | undefined);
  };
  vm.registerNative("PauseUnit",(ctx,args)=>{
    const u=unitOf(ctx,args[0]);if(!u)return vint(0);
    const paused=args[1]?.t==='bool'&&args[1].v===true,e=entOf(ctx,u);
    if(e)e.paused=paused;else if(!u.data.simBacked)u.data.paused=paused;
    return vint(0);
  });
  vm.registerNative("IsUnitPaused",(ctx,args)=>{
    const u=unitOf(ctx,args[0]);return vbool(Boolean(u&&(entOf(ctx,u)?.paused??(!u.data.simBacked&&u.data.paused))));
  });
  const getAbilityLevel=(ctx:NativeCallContext,args:JassValue[]) => {
    const abilities = abilitiesOf(ctx, unitOf(ctx, args[0]));
    const abilityId = args[1]?.t === "int" ? args[1].v >>> 0 : 0;
    return vint(abilities?.get(abilityId) ?? 0);
  };
  vm.registerNative("GetUnitAbilityLevel",getAbilityLevel);
  vm.registerNative("GetUnitAbilityLevelSwapped",(ctx,args)=>getAbilityLevel(ctx,[args[1]!,args[0]!]));
  vm.registerNative("UnitAddAbility", (ctx, args) => {
    const abilities = abilitiesOf(ctx, unitOf(ctx, args[0]));
    const abilityId = args[1]?.t === "int" ? args[1].v >>> 0 : 0;
    if (!abilities) return vbool(false);
    if (!abilities.has(abilityId)) abilities.set(abilityId, 1);
    return vbool(true);
  });
  vm.registerNative("UnitRemoveAbility", (ctx, args) => {
    const abilities = abilitiesOf(ctx, unitOf(ctx, args[0]));
    const abilityId = args[1]?.t === "int" ? args[1].v >>> 0 : 0;
    return vbool(abilities ? abilities.delete(abilityId) : false);
  });
  // A level adjustment is not an ability grant. Original GemTower calls setters for
  // several possible gem types after replacement; granting absent IDs made ordinary
  // Opal gain Perfect Opal's aura. UnitAddAbility owns the explicit grant seam.
  const setAbilityLevel=(ctx:NativeCallContext,unitArg:JassValue|undefined,abilityArg:JassValue|undefined,levelArg:JassValue|undefined)=>{
    const abilities=abilitiesOf(ctx,unitOf(ctx,unitArg));
    const abilityId=abilityArg?.t==='int'?abilityArg.v>>>0:0;
    const level=levelArg?.t==='int'?levelArg.v:0;
    if(!abilities||(abilities.get(abilityId)??0)<1||level<1)return vint(0);
    abilities.set(abilityId,level);return vint(level);
  };
  vm.registerNative("SetUnitAbilityLevel",(ctx,args)=>setAbilityLevel(ctx,args[0],args[1],args[2]));
  vm.registerNative("SetUnitAbilityLevelSwapped",(ctx,args)=>setAbilityLevel(ctx,args[1],args[0],args[2]));
  vm.registerNative("IncUnitAbilityLevel", (ctx, args) => {
    const abilities = abilitiesOf(ctx, unitOf(ctx, args[0]));
    const abilityId = args[1]?.t === "int" ? args[1].v >>> 0 : 0;
    const level = (abilities?.get(abilityId) ?? 0) + 1;
    if (abilities) abilities.set(abilityId, level);
    return vint(level);
  });

  // Classic common.j unitstate values. Life/mana observe the same live entity as combat.
  vm.setGlobal("UNIT_STATE_LIFE",vint(0));vm.setGlobal("UNIT_STATE_MAX_LIFE",vint(1));
  vm.setGlobal("UNIT_STATE_MANA",vint(2));vm.setGlobal("UNIT_STATE_MAX_MANA",vint(3));
  vm.registerNative("ConvertUnitState",(_ctx,args)=>vint(num(args[0])));
  const getState=(ctx:NativeCallContext,args:JassValue[])=>{
    const u=unitOf(ctx,args[0]);if(!u)return vreal(0);const e=entOf(ctx,u),key=num(args[1]);
    if(key===0)return vreal(e?.hp??(u.data.simBacked?0:Number(u.data.hp)));
    if(key===1)return vreal(e?.hpMax??Number(u.data.hpMax));
    if(key===2)return vreal(e?.mana??num((u.data.states as Map<string,JassValue>).get(JSON.stringify(vint(2)))));
    const v=(u.data.states as Map<string,JassValue>).get(JSON.stringify(args[1]??null));return vreal(num(v));
  };
  vm.registerNative("GetUnitState",getState);
  vm.registerNative("GetUnitStateSwap",(ctx,args)=>getState(ctx,[args[1]!,args[0]!]));
  vm.registerNative("SetUnitState",(ctx,args)=>{
    const u=unitOf(ctx,args[0]);if(!u)return vint(0);
    const key=num(args[1]);if(key===0)setLife(ctx,u,num(args[2]));
    else {const e=entOf(ctx,u);if(key===2&&e)e.mana=Math.max(0,Math.round(num(args[2])));(u.data.states as Map<string,JassValue>).set(JSON.stringify(args[1]??null),args[2]??vreal(0));}
    return vint(0);
  });

  // 이벤트 응답(발화 컨텍스트) — R-207: 스레드-로컬(threadMeta)에서 제공.
  vm.registerNative("GetTriggerUnit", (ctx) => ctx.threadMeta.unit ?? vhandle(null));
  vm.registerNative("GetSpellAbilityUnit", (ctx) => ctx.threadMeta.unit ?? vhandle(null));
  vm.registerNative("GetSpellAbilityId", (ctx) => ctx.threadMeta.spellAbilityId ?? vint(0));
  // C-1b(DISPATCH_SONNET_C1_COMBINE §2 C-1b, 실측: 24회) — GetTriggerUnit/GetSpellAbilityUnit과 동일한
  // threadMeta 경유 패턴(natives/bridge.ts가 castAbility의 선택적 targetUnitId를 여기 실어 채운다).
  // 무타겟 시전(targetUnitId 미지정)은 null 핸들 — WC3 원본 시맨틱과 동일(대상 없으면 null).
  vm.registerNative('GetSpellTargetX',ctx=>ctx.threadMeta.spellTargetX??vreal(0));
  vm.registerNative('GetSpellTargetY',ctx=>ctx.threadMeta.spellTargetY??vreal(0));
  vm.registerNative('GetSpellTargetLoc',ctx=>vhandle(ctx.handles.create('location',{x:num(ctx.threadMeta.spellTargetX),y:num(ctx.threadMeta.spellTargetY)}).id));
  vm.registerNative("GetSpellTargetUnit", (ctx) => ctx.threadMeta.spellTargetUnit ?? vhandle(null));
  vm.registerNative("GetAttacker", (ctx) => ctx.threadMeta.attacker ?? vhandle(null));
  vm.registerNative("GetKillingUnit", (ctx) => ctx.threadMeta.killingUnit ?? vhandle(null));
  vm.registerNative("GetDyingUnit", (ctx) => ctx.threadMeta.unit ?? vhandle(null));
  vm.registerNative("GetTrainedUnit", (ctx) => ctx.threadMeta.trainedUnit ?? vhandle(null));
  vm.registerNative("GetTrainingUnit", (ctx) => ctx.threadMeta.unit ?? vhandle(null));
  vm.registerNative("GetTransportUnit", (ctx) => ctx.threadMeta.unit ?? vhandle(null));

  vm.registerNative("CreateDestructable", (ctx) => vhandle(ctx.handles.create("generic", {}).id));

  // Public API enum values verified from the caller-owned 1.28 common.j.
  // JASS NORMAL is GUI Spells; MELEE is GUI Normal. Raw unit weapon strings
  // remain unchanged. The old sequential-name approximation misclassified spells.
  const attackTypes:ReadonlyArray<readonly [string,number,AttackTypeId]>=[
    ['NORMAL',0,'spells'],['MELEE',1,'normal'],['PIERCE',2,'pierce'],
    ['SIEGE',3,'siege'],['MAGIC',4,'magic'],['CHAOS',5,'chaos'],['HERO',6,'hero'],
  ];
  const attackTypeIntToString=new Map<number,AttackTypeId>();
  for(const [name,id,type]of attackTypes){vm.setGlobal('ATTACK_TYPE_'+name,vint(id));attackTypeIntToString.set(id,type);}
  const damageTypes:ReadonlyArray<readonly [string,number]>=[
    ['UNKNOWN',0],['NORMAL',4],['ENHANCED',5],['FIRE',8],['COLD',9],['LIGHTNING',10],
    ['POISON',11],['DISEASE',12],['DIVINE',13],['MAGIC',14],['SONIC',15],['ACID',16],
    ['FORCE',17],['DEATH',18],['MIND',19],['PLANT',20],['DEFENSIVE',21],['DEMOLITION',22],
    ['SLOW_POISON',23],['SPIRIT_LINK',24],['SHADOW_STRIKE',25],['UNIVERSAL',26],
  ];
  for(const [name,id]of damageTypes)vm.setGlobal('DAMAGE_TYPE_'+name,vint(id));
  vm.registerNative('ConvertAttackType',(_ctx,args)=>vint(num(args[0])));
  vm.registerNative('ConvertDamageType',(_ctx,args)=>vint(num(args[0])));
  const damageTarget=(ctx:NativeCallContext,sourceValue:JassValue|undefined,targetValue:JassValue|undefined,amount:JassValue|undefined,attack:JassValue|undefined,damage:JassValue|undefined)=>{
    const target=unitOf(ctx,targetValue),source=unitOf(ctx,sourceValue);
    if(!target||!ctx.sim)return vbool(false);
    const attackType=attackTypeIntToString.get(num(attack))??'normal';
    // Normal alone applies numeric armor. Type-vs-armor-class ratios always apply.
    // Original independent test report: Sophismata, Wc3C #19 (2008-08-15).
    const result=ctx.sim.applyTriggerDamage(target.id,source?.id??null,num(amount),attackType,num(damage)!==4);
    return vbool(result.applied);
  };
  vm.registerNative('UnitDamageTargetBJ',(ctx,args)=>damageTarget(ctx,args[0],args[1],args[2],args[3],args[4]));
  vm.registerNative('UnitDamageTarget',(ctx,args)=>damageTarget(ctx,args[0],args[1],args[2],args[5],args[6]));
}
