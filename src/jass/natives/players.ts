/**
 * R-206a natives — 플레이어 클러스터.
 * 실측(§2.2 whole-file top / R-205 보너스 프로브 config+main 91종): Player 725/1878, GetPlayerId,
 * GetOwningPlayer 857, GetPlayerController/GetPlayerSlotState/SetPlayer* 계열(config-time 설정).
 * D-3(STATUS.md): GetLocalPlayer = P1(index 0) 고정.
 */
import type { JassVm, NativeCallContext, JassValue, HandleTable } from "../vm.ts";
import { vhandle, vint, vbool, vstring } from "../vm.ts";
import type { Sim } from "../../sim/sim.ts";
import { fourCC } from "./units.ts";
import { evalBoolExpr } from "./registry.ts";
import {
  ALLIANCE_TYPES, MAP_CONTROLS, PLAYER_SLOT_STATES,
  PLAYER_STATE_GIVES_BOUNTY, PLAYER_STATE_ALLIED_VICTORY,
  PLAYER_STATE_RESOURCE_FOOD_CAP,
  PLAYER_STATE_RESOURCE_FOOD_USED,
  PLAYER_STATE_RESOURCE_GOLD,
  PLAYER_STATE_RESOURCE_LUMBER,
} from "../../sim/playerstate.ts";

/** player index → handle id 캐시(같은 index로 Player()를 여러 번 불러도 동일 핸들 — 결정론 동일성/
 *  등가비교, valuesEqual은 handle id로 비교하므로 캐시 없이는 GetTriggerPlayer()==Player(0) 같은
 *  비교가 어긋난다). VM 인스턴스마다 독립(installNatives가 새로 만들어 registerEventBridge와 공유). */
export type PlayerHandleCache = Map<number, number>;

const PLAYER1_INDEX = 0; // D-3: GetLocalPlayer = P1

export function getOrCreatePlayerHandle(handles: HandleTable, cache: PlayerHandleCache, index: number): number {
  let id = cache.get(index);
  if (id === undefined) {
    id = handles.create("player", { index }).id;
    cache.set(index, id);
  }
  return id;
}

export function playerIndexOf(ctx: NativeCallContext, v: JassValue): number {
  if (v.t === "handle" && v.v !== null) {
    const h = ctx.handles.get(v.v);
    if (h && h.kind === "player" && typeof h.data.index === "number") return h.data.index;
  }
  return -1;
}

export function registerPlayerNatives(vm: JassVm, cache: PlayerHandleCache, sim: Sim): void {
  function playerHandleFor(ctx: NativeCallContext, index: number): JassValue {
    return vhandle(getOrCreatePlayerHandle(ctx.handles, cache, index));
  }

  vm.registerNative("Player", (ctx, args) => {
    const idx = args[0]?.t === "int" ? args[0].v : 0;
    return playerHandleFor(ctx, idx);
  });

  vm.registerNative("GetLocalPlayer", (ctx) => playerHandleFor(ctx, PLAYER1_INDEX));

  vm.registerNative("GetPlayerId", (ctx, args) => {
    const idx = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    return vint(idx < 0 ? 0 : idx);
  });

  vm.registerNative("GetOwningPlayer", (ctx, args) => {
    const u = args[0]?.t === "handle" && args[0].v !== null ? ctx.handles.get(args[0].v) : undefined;
    const idx = u && u.kind === "unit" && typeof u.data.owner === "number" ? u.data.owner : 0;
    return playerHandleFor(ctx, idx);
  });

  // Reuse the existing Sim player store; relation, vision and command sharing are distinct.
  // BJ flag group facts: https://jass.sourceforge.net/doc/api/Blizzard_j-source.shtml
  for (const [name, id] of Object.entries(ALLIANCE_TYPES)) vm.setGlobal(name, vint(id));
  vm.registerNative("ConvertAllianceType", (_ctx, args) => vint(args[0]?.t === "int" ? args[0].v : -1));
  const allianceKeyOf = (value: JassValue | undefined): number => value?.t === "int" ? value.v : -1;
  const setAlliance = (ctx: NativeCallContext, source: JassValue | undefined, other: JassValue | undefined,
    setting: number, flag: JassValue | undefined) => {
    if (flag?.t === "bool") sim.playerState.setAlliance(source ? playerIndexOf(ctx, source) : -1,
      other ? playerIndexOf(ctx, other) : -1, setting, flag.v);
    return vint(0);
  };
  vm.registerNative("SetPlayerAlliance", (ctx, args) => setAlliance(ctx, args[0], args[1], allianceKeyOf(args[2]), args[3]));
  vm.registerNative("GetPlayerAlliance", (ctx, args) => vbool(sim.playerState.getAlliance(
    args[0] ? playerIndexOf(ctx, args[0]) : -1, args[1] ? playerIndexOf(ctx, args[1]) : -1, allianceKeyOf(args[2]))));
  vm.registerNative("SetPlayerAllianceBJ", (ctx, args) => {
    const source = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    const other = args[3] ? playerIndexOf(ctx, args[3]) : -1;
    return source === other ? vint(0) : setAlliance(ctx, args[0], args[3], allianceKeyOf(args[1]), args[2]);
  });
  const allianceHelpers: Array<[string, readonly number[]]> = [
    ["SetPlayerAllianceStateAllyBJ", [0, 1, 2, 3, 4]],
    ["SetPlayerAllianceStateVisionBJ", [ALLIANCE_TYPES.ALLIANCE_SHARED_VISION]],
    ["SetPlayerAllianceStateControlBJ", [ALLIANCE_TYPES.ALLIANCE_SHARED_CONTROL]],
    ["SetPlayerAllianceStateFullControlBJ", [ALLIANCE_TYPES.ALLIANCE_SHARED_ADVANCED_CONTROL]],
  ];
  for (const [name, settings] of allianceHelpers) vm.registerNative(name, (ctx, args) => {
    for (const setting of settings) setAlliance(ctx, args[0], args[1], setting, args[2]);
    return vint(0);
  });

  // Map controller settings and actual lobby occupancy are different authorities.
  for (const [name, value] of Object.entries({...MAP_CONTROLS, ...PLAYER_SLOT_STATES})) vm.setGlobal(name, vint(value));
  vm.registerNative("ConvertMapControl", (_ctx, args) => vint(args[0]?.t === "int" ? args[0].v : -1));
  vm.registerNative("ConvertPlayerSlotState", (_ctx, args) => vint(args[0]?.t === "int" ? args[0].v : -1));
  vm.registerNative("GetPlayerController", (ctx, args) => vint(sim.playerState.getController(args[0] ? playerIndexOf(ctx, args[0]) : -1)));
  vm.registerNative("GetPlayerSlotState", (ctx, args) => vint(sim.playerState.getSlotState(args[0] ? playerIndexOf(ctx, args[0]) : -1)));
  vm.registerNative("SetPlayerController", (ctx, args) => {
    sim.playerState.setController(args[0] ? playerIndexOf(ctx, args[0]) : -1, args[1]?.t === "int" ? args[1].v : -1);
    return vint(0);
  });
  vm.registerNative("SetPlayerRacePreference", () => vint(0));
  vm.registerNative("SetPlayerRaceSelectable", () => vint(0));
  vm.registerNative("SetPlayerTeam", () => vint(0));
  vm.registerNative("SetPlayerColor", () => vint(0));
  vm.registerNative("ConvertPlayerColor", (_ctx, args) => vint(args[0]?.t === "int" ? args[0].v : 0));
  const stateKeyOf = (v: JassValue | undefined): number => v?.t === "int" || v?.t === "real" ? Math.trunc(v.v) : 0;
  const numberOf = (v: JassValue | undefined): number => v?.t === "int" || v?.t === "real" ? Math.trunc(v.v) : 0;
  const setState = (ctx: NativeCallContext, player: JassValue | undefined, state: JassValue | undefined, value: JassValue | undefined) => {
    const playerId = player ? playerIndexOf(ctx, player) : -1;
    const stateKey = stateKeyOf(state);
    if (playerId >= 0) {
      if (stateKey === PLAYER_STATE_RESOURCE_GOLD) sim.ledger.setGold(playerId, numberOf(value), "script");
      else sim.playerState.set(playerId, stateKey, numberOf(value));
    }
    return vint(0);
  };
  vm.registerNative("SetPlayerState", (ctx, args) => setState(ctx, args[0], args[1], args[2]));
  vm.registerNative("SetPlayerStateBJ", (ctx, args) => setState(ctx, args[0], args[1], args[2]));
  vm.registerNative("GetPlayerState", (ctx, args) => {
    const playerId = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    const stateKey = stateKeyOf(args[1]);
    return vint(playerId >= 0 ? (stateKey === PLAYER_STATE_RESOURCE_GOLD ? sim.ledger.gold(playerId) : sim.playerState.get(playerId, stateKey)) : 0);
  });
  vm.registerNative("AdjustPlayerStateBJ", (ctx, args) => {
    const playerId = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    const stateKey = stateKeyOf(args[2]);
    if (playerId >= 0) {
      if (stateKey === PLAYER_STATE_RESOURCE_GOLD) sim.ledger.adjustGold(playerId, numberOf(args[0]), "script");
      else sim.playerState.adjust(playerId, stateKey, numberOf(args[0]));
    }
    return vint(0);
  });
  vm.registerNative("ConvertPlayerState", (_ctx, args) => vint(stateKeyOf(args[0])));

  // common.j is not bundled; install the public enum values required by the map instead of collapsing to VUNKNOWN.
  vm.setGlobal("PLAYER_STATE_RESOURCE_GOLD", vint(PLAYER_STATE_RESOURCE_GOLD));
  vm.setGlobal("PLAYER_STATE_RESOURCE_LUMBER", vint(PLAYER_STATE_RESOURCE_LUMBER));
  vm.setGlobal("PLAYER_STATE_RESOURCE_FOOD_CAP", vint(PLAYER_STATE_RESOURCE_FOOD_CAP));
  vm.setGlobal("PLAYER_STATE_RESOURCE_FOOD_USED", vint(PLAYER_STATE_RESOURCE_FOOD_USED));
  vm.setGlobal("PLAYER_STATE_GIVES_BOUNTY", vint(PLAYER_STATE_GIVES_BOUNTY));
  vm.setGlobal("PLAYER_STATE_ALLIED_VICTORY", vint(PLAYER_STATE_ALLIED_VICTORY));
  vm.setGlobal("LESS_THAN", vint(0));
  vm.setGlobal("LESS_THAN_OR_EQUAL", vint(1));
  vm.setGlobal("EQUAL", vint(2));
  vm.setGlobal("GREATER_THAN_OR_EQUAL", vint(3));
  vm.setGlobal("GREATER_THAN", vint(4));
  vm.setGlobal("NOT_EQUAL", vint(5));

  // 시작 위치 — DefineStartLocation/SetPlayerStartLocation/ForcePlayerStartLocation/SetStartLocPrio*.
  vm.registerNative("DefineStartLocation", (_ctx, args) => {
    const idx = args[0]?.t === "int" ? args[0].v : 0;
    const x = args[1]?.t === "real" || args[1]?.t === "int" ? args[1].v : 0;
    const y = args[2]?.t === "real" || args[2]?.t === "int" ? args[2].v : 0;
    sim.playerState.defineStartLocation(idx,x,y);
    return vint(0);
  });
  for(const name of ['SetPlayerStartLocation','ForcePlayerStartLocation'])vm.registerNative(name,(ctx,args)=>{
    sim.playerState.setStartLocation(playerIndexOf(ctx,args[0]!),args[1]?.t==='int'?args[1].v:0);return vint(0);
  });
  vm.registerNative("SetStartLocPrio", () => vint(0));
  vm.registerNative("SetStartLocPrioCount", () => vint(0));
  vm.registerNative("GetPlayerStartLocationLoc", (ctx, args) => {
    const idx = playerIndexOf(ctx,args[0]!);
    const loc = sim.playerState.getStartLocation(idx) ?? { x: 0, y: 0 };
    return vhandle(ctx.handles.create("location", { x: loc.x, y: loc.y }).id);
  });

  // tech 카운트(GetPlayerTechCountSimple 580회 — MAP §2.4-5, 이 맵의 게이트 메커니즘). R-2(DISPATCH_SONNET_R2_
  // TECH_WIRING): 원작 WC3 시맨틱 = "해당 tech를 연구한 횟수(레벨)" 조회 — 정확히 sim.getResearchLevel()(G-2c
  // 연구 파이프, R-1 C-1/C-2로 비용·선행조건 정합)가 그 저장소다. JASS 정수 fourcc ↔ sim 문자열 techId 변환은
  // units.ts의 기존 fourCC() 재사용(신규 유틸 발명 0). sim은 registerPlayerNatives의 필수 인자(installNatives가
  // 항상 주입) — "sim 미주입" 케이스는 이 클러스터에 존재하지 않는다.
  // 시맨틱 분리(R-1 C-3 근본원인 교정): 이전 구현은 SetPlayerTechMaxAllowed(원작 호출 0회 — "최대 허용치")를
  // count 저장소로 오용했다. 원작이 그 native를 아예 안 쓰므로 무해하지만 의미가 다른 값을 섞으면 안 되므로
  // 별도 맵(techMaxAllowed)으로 분리 — count 조회(GetPlayerTechCountSimple)는 이제 여기를 절대 보지 않는다.
  const techMaxAllowed = new Map<string, number>(); // `${playerIdx}:${techId}` -> max-allowed(원작 미사용, 조회 native 없음 — 저장만)
  // P10: the Simple wrapper also counts exact owned unit types for structure prerequisites.
  vm.registerNative("GetPlayerTechCountSimple", (ctx, args) => {
    const playerIdx = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    const techIdInt = args[0]?.t === "int" ? args[0].v : 0;
    if (playerIdx < 0) return vint(0);
    return vint(sim.getPlayerTechCount(playerIdx, fourCC(techIdInt)));
  });
  vm.registerNative("SetPlayerTechMaxAllowed", (ctx, args) => {
    const playerIdx = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    const techIdInt = args[0]?.t === "int" ? args[0].v : 0;
    const max = args[2]?.t === "int" ? args[2].v : 0;
    if (playerIdx >= 0) techMaxAllowed.set(`${playerIdx}:${techIdInt}`, max);
    return vint(0);
  });

  for (const name of ["IsPlayerAlly", "IsPlayerEnemy"]) vm.registerNative(name, (ctx, args) => {
    const source = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    const other = args[1] ? playerIndexOf(ctx, args[1]) : -1;
    if (source < 0 || other < 0) return vbool(false);
    const allied = source === other || sim.playerState.getAlliance(source, other, ALLIANCE_TYPES.ALLIANCE_PASSIVE);
    return vbool(name === "IsPlayerAlly" ? allied : !allied);
  });
  // Reuse the existing force handle payload; enum/filter contexts are per VM thread.
  const enumPlayers = new Map<number, number>();
  const filterPlayers = new Map<number, number>();
  const forceOf = (ctx: NativeCallContext, value: JassValue | undefined) => {
    const h = value?.t === "handle" && value.v !== null ? ctx.handles.get(value.v) : undefined;
    return h?.kind === "force" ? h : undefined;
  };
  const restoreContext = (store: Map<number,number>, id: number, previous: number | undefined) => {
    if(previous===undefined)store.delete(id);else store.set(id,previous);
  };
  vm.registerNative("CreateForce", ctx=>vhandle(ctx.handles.create("force",{players:[] as number[]}).id));
  vm.registerNative("DestroyForce", (ctx,args)=>{const f=forceOf(ctx,args[0]);if(f)ctx.handles.delete(f.id);return vint(0);});
  vm.registerNative("ForceAddPlayer", (ctx,args)=>{
    const f=forceOf(ctx,args[0]),index=args[1]?playerIndexOf(ctx,args[1]):-1;
    if(f&&index>=0){const players=f.data.players as number[];if(!players.includes(index))players.push(index);}
    return vint(0);
  });
  vm.registerNative("ForceRemovePlayer", (ctx,args)=>{
    const f=forceOf(ctx,args[0]),index=args[1]?playerIndexOf(ctx,args[1]):-1;
    if(f){const players=f.data.players as number[],at=players.indexOf(index);if(at>=0)players.splice(at,1);}
    return vint(0);
  });
  vm.registerNative("ForceClear", (ctx,args)=>{const f=forceOf(ctx,args[0]);if(f)(f.data.players as number[]).length=0;return vint(0);});
  vm.registerNative("CountPlayersInForceBJ", (ctx,args)=>vint((forceOf(ctx,args[0])?.data.players as number[]|undefined)?.length??0));
  vm.registerNative("IsPlayerInForce", (ctx,args)=>vbool((forceOf(ctx,args[1])?.data.players as number[]|undefined)?.includes(args[0]?playerIndexOf(ctx,args[0]):-1)??false));
  vm.registerNative("GetEnumPlayer", ctx=>enumPlayers.has(ctx.threadId)?playerHandleFor(ctx,enumPlayers.get(ctx.threadId)!):vhandle(null));
  vm.registerNative("GetFilterPlayer", ctx=>filterPlayers.has(ctx.threadId)?playerHandleFor(ctx,filterPlayers.get(ctx.threadId)!):vhandle(null));
  vm.registerNative("ForceEnumPlayers", (ctx,args)=>{
    const f=forceOf(ctx,args[0]);if(!f)return vint(0);
    const players=f.data.players as number[];players.length=0;
    const previous=filterPlayers.get(ctx.threadId);
    try {for(let index=0;index<16;index++){filterPlayers.set(ctx.threadId,index);if(evalBoolExpr(ctx,args[1]))players.push(index);}}
    finally {restoreContext(filterPlayers,ctx.threadId,previous);}
    return vint(0);
  });
  vm.registerNative("ForForce", (ctx,args)=>{
    const players=forceOf(ctx,args[0])?.data.players as number[]|undefined;
    const code=args[1];if(!players||!code)return vint(0);
    const previous=enumPlayers.get(ctx.threadId);
    try {for(const index of players.slice()){enumPlayers.set(ctx.threadId,index);ctx.callVm(code,[]);}}
    finally {restoreContext(enumPlayers,ctx.threadId,previous);}
    return vint(0);
  });
  vm.registerNative("ForcePickRandomPlayer", (ctx,args)=>{
    const players=forceOf(ctx,args[0])?.data.players as number[]|undefined;
    return players?.length?playerHandleFor(ctx,players[sim.rng.int(0,players.length-1)]!):vhandle(null);
  });
  vm.registerNative("BJDebugMsg", () => vint(0)); // 흔한 디버그 출력 BJ — no-op(로그 원하면 misc_stubs 쪽 DisplayTextToForce로 충분)
  vm.registerNative("SetPlayerFlagBJ", (ctx,args) => setState(ctx,args[2],args[0],vint(args[1]?.t==='bool'&&args[1].v?1:0)));
  vm.registerNative("GetPlayerName", (ctx, args) => {
    const idx = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    return vstring(idx >= 0 ? `Player ${idx + 1}` : "");
  });

  // 맵 메타/설정계(config-time 전용 1회성 no-op) — 값 조회는 게임 상수, 실제 UI 없으니 상수 반환.
  vm.registerNative("SetMapName", () => vstring(""));
  vm.registerNative("SetMapDescription", () => vstring(""));
  vm.registerNative("SetPlayers", () => vint(0));
  vm.registerNative("SetTeams", () => vint(0));
  vm.registerNative("SetGamePlacement", () => vint(0));
}
