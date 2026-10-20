/**
 * R-201 — 결정론 sim 골격.
 * 계약 근거: docs/ARCHITECTURE.md §sim tick(고정 7단계) · §결정성 5종(INV-D1~D5, AGENTS.md).
 * src/sim/는 순수(DOM/Canvas/formats/jass import 0, 부수효과·전역 0) — INV-D3.
 *
 * 아직 유닛/전투/이동/트리거 로직은 없다(R-202~207의 일). 여기서 고정하는 것:
 *   - tick 7단계 중 서브시스템이 꽂을 수 있는 5단계(훅 seam, registerTickPhase)
 *   - 단일 rng 소유(INV-D1)
 *   - stateHash()(INV-D4 — Map 삽입순 순회만)
 *   - 이벤트 2채널(snapshot=units() / event stream=drainEvents())
 */
import type { MapIR } from "../ir/types.ts";
import {rawCodeOf} from "../ir/fourcc.ts";
import type { UnitMoveRejectReason, UnitTrainRejectReason, AbilityOrderRejectReason, UnitUpgradeRejectReason, IWorld, SimEvent, UnitSnapshot, WorldFactory } from "../world_api.ts";
import { Rng } from "./rng.ts";
import {createEntity,type UnitEntity} from "./unit-entity.ts";
import type { DefStore } from "./def-store.ts";
import { PlayerStateStore, PLAYER_STATE_GIVES_BOUNTY,ALLIANCE_TYPES, PLAYER_STATE_RESOURCE_FOOD_USED, PLAYER_STATE_RESOURCE_LUMBER } from "./playerstate.ts";
import { PLAYER_STATE_RESOURCE_GOLD } from "./playerstate.ts";
import {rollBounty,rollSourceBounty, GoldLedger } from "./balance/economy.ts";
import { LifeLedger, type LifeConfig } from "./life.ts";
import {effectiveArmorValue} from "./ability-effects.ts";
import { damageAfterDefense } from "./balance/combat.ts";
import type { GameConstants, AttackTypeId, ResearchSpec } from "./balance/config.ts";
import { createStatusStore, isStunned, type StatusStore } from "./status.ts";
import {assignPointMove} from './movement.ts';

/**
 * tick 7단계(ARCHITECTURE §sim tick) 중 서브시스템이 등록 가능한 5단계.
 * ①시계 전진(=Sim.step이 tickCount를 직접 증가)과 ⑦이벤트 드레인(=drainEvents() 호출)은
 * Sim 자체가 소유하는 프레임 경계라 훅 대상이 아니다 — 나머지 5단계만 훅 seam.
 */
export interface AbilityCastRequest {unitId:number;abilityId:string;targetUnitId:number|null;targetPoint?:{x:number;y:number};playerId?:number;approach?:{x:number;y:number};cancelled?:boolean;}
function withinReach(a:{x:number;y:number},b:{x:number;y:number},range:number):boolean{return (a.x-b.x)**2+(a.y-b.y)**2<=range**2;}

export type TickPhase = "timers" | "unitLoop" | "combat" | "triggerBridge" | "rebucket";

/** 고정 순서(불변) — R-202~207이 이 배열의 위치대로 매 틱 실행된다. */
export const TICK_PHASES: readonly TickPhase[] = ["timers", "unitLoop", "combat", "triggerBridge", "rebucket"];

export type TickHook = (sim: Sim) => void;

/** FNV-1a 32bit — 의존성 0, stateHash() 전용. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 결정론 게임 코어. `IWorld`를 구현하며 `WorldFactory` 시그니처(ir, seed)로 생성된다.
 * entities는 spawnUnit/removeUnit/getUnit으로 조작하는 실제 유닛 레지스트리(R-205 combat-system이 소비) —
 * units()는 그 삽입순 스냅샷이다. 플레이어 서브시스템은 아직 없어 stateHash()의 p=[] 자리는 항상 빈 배열이다.
 */
export class Sim implements IWorld {
  private readonly ir: MapIR;
  private readonly simRng: Rng;
  private _tickCount = 0;
  private readonly hooks: Record<TickPhase, TickHook[]> = {
    timers: [],
    unitLoop: [],
    combat: [],
    triggerBridge: [],
    rebucket: [],
  };
  private readonly eventQueue: SimEvent[] = [];
  /** R-207: injectChat()으로 쌓인 미소비 채팅 입력 — triggerBridge 단계 훅이 drainChat()으로 소비. */
  private readonly chatQueue: Array<{ playerId: number; text: string }> = [];
  /** R-307b: injected headless dialog clicks, consumed in injection order by triggerBridge. */
  private readonly dialogClickQueue: Array<{ playerId: number; buttonId: number }> = [];
  private readonly trainingQueue:Array<{playerId:number;producerId:number;typeId:string}>=[];
  readonly pendingTrainings=new Map<number,{playerId:number;producerId:number;typeId:string;owner:number;cost:number;remainingTicks:number}>();
  private readonly upgradeQueue:Array<{playerId:number;unitId:number;targetTypeId:string}>=[];
  readonly pendingUpgrades=new Map<number,{playerId:number;unitId:number;fromTypeId:string;targetTypeId:string;owner:number;cost:number;remainingTicks:number}>();
  private readonly buildQueue: Array<{ builderId: number | null; playerId?: number; typeId: string; x: number; y: number }> = [];
  /** C-1b(DISPATCH_SONNET_C1_COMBINE §2 C-1b): targetUnitId는 기존 필드에 추가된 선택 필드(신규 큐 아님) —
   *  무타겟 시전은 null. natives/bridge.ts가 발화 시 threadMeta.spellTargetUnit으로 그대로 전달. */
  private readonly castQueue: AbilityCastRequest[] = [];
  /** Synchronous bridge snapshot only; cancellation marks shared request references. */
  private castBatch: AbilityCastRequest[] = [];
  /** G-2c: research()이 쌓는 요청 큐 — buildQueue/castQueue와 동형(enqueue only, triggerBridge가 소비). */
  private readonly researchQueue: Array<{ playerId: number; techId: string }> = [];
  /** G-2c: player×techId → 현재 레벨(정수). PlayerStateStore의 정수 stateKey는 문자열 techId를 담지
   *  못해(설계 §4 "새 소형 저장소" 요구) 별도 Map을 둔다 — PlayerStateStore와 동일한 삽입순 정신(INV-D4). */
  private readonly researchLevels: Map<number, Map<string, number>> = new Map();
  /** R-207 확장: natives/bridge.ts 전용 보조 채널 — emit()이 채우고 drainBridgeEvents()가 비운다(같은
   *  틱 내 RectEntered/UnitDied를 triggerBridge phase가 소비). eventQueue/drainEvents()의 외부 소비
   *  계약과는 독립적인 사본이라 스모크·테스트의 기존 drainEvents() 사용(§"이벤트 2채널")을 건드리지 않는다. */
  private readonly bridgeEventQueue: SimEvent[] = [];

  /** 엔티티 Map(삽입순 — INV-D4). spawnUnit/removeUnit/getUnit으로 조작, entities 게터로 읽기 전용 순회. */
  private readonly _entities: Map<number, UnitEntity> = new Map();
  /** R-208: generic integer player-state authority, included in stateHash. */
  readonly playerState = new PlayerStateStore();
  /** E-1: GOLD 단일 정본. 콜백 한 곳에서만 PlayerState 표시/이벤트 미러를 갱신한다. */
  readonly ledger = new GoldLedger((playerId, value) => {
    this.playerState.set(playerId, PLAYER_STATE_RESOURCE_GOLD, value);
  });
  /** L-1: 원본은 observe, 합성/신규게임은 enforce로 명시 설치. */
  life: LifeLedger | null = null;
  private _gameOver = false;

  /**
   * VM native(CreateUnit)가 실 스탯 Def를 해석할 provider 보관자 — 스모크/셋업이 주입.
   * 미주입(undefined) 시 natives는 얕은 폴백(hp1)을 쓴다(격리 VM 테스트 하위호환). 상태 아님 → stateHash 무관.
   */
  defStore: DefStore | undefined = undefined;

  /**
   * G-1: GEM_IDENTITY_MINE_DESIGN §5.1 — applyTriggerDamage가 damageAfterDefense를 호출하는 데 필요한
   * GameConstants. installCombat이 이미 gc를 받으므로 그쪽이 이 필드를 채운다(combat-system.ts).
   * 미주입(undefined) 시 applyTriggerDamage는 no-op(defStore와 동일한 방어적 폴백 seam). 상태 아님 → stateHash 무관.
   */
  gc: GameConstants | undefined = undefined;
  abilityRange?: (abilityId:string,level:number)=>number|undefined;
  bountyMode:import("./combat-pipe.ts").BountyMode="script";

  /**
   * G-2c: GameBalanceConfig.researches의 비용표 — defStore/gc와 동일한 "미주입 시 폴백" seam(호출측이
   * `sim.researchConfig = GEMTOWER_BALANCE.researches`처럼 직접 얹는다). 미주입(undefined)이면
   * research()는 전부 unknown-tech로 거부된다(조용한 통과 금지, INV-D5와 동일 정신). 상태 아님 → stateHash 무관.
   */
  researchConfig: Record<string, ResearchSpec> | undefined = undefined;

  /**
   * G-5(GEM_IDENTITY_MINE_DESIGN §5.4, DISPATCH_SONNET_G3_G6 §2 G-5) — 상태효과 3종 저장소(src/sim/status.ts
   * 소유 타입, 격리). defStore/gc/researchConfig와 동일한 "Sim에 얹고 installer가 소비하는" seam 패턴 —
   * movement.ts(slow 배율·stun 이동스킵)·combat-pipe.ts(stun 발사스킵, ctx.status 경유)·combat-system.ts
   * (dot 틱 처리)가 이 한 저장소를 공유 조회/변이한다. 삽입순 Map 2단(INV-D4) — stateHash()에 포함.
   */
  readonly status: StatusStore = createStatusStore();

  constructor(ir: MapIR, seed: number) {
    this.ir = ir;
    this.simRng = new Rng(seed); // INV-D1: 생성자 1회, sim 코어 유일 rng.
  }

  /** 서브시스템 공유 rng (INV-D1) — Math.random 사용처를 만들지 않기 위한 유일한 난수원. */
  get rng(): Rng {
    return this.simRng;
  }

  get tickCount(): number {
    return this._tickCount;
  }

  /** 원본 IR 참조(읽기 전용) — 이후 슬라이스(R-202 등)가 Def/Entity를 여기서 파생한다. */
  get mapIr(): MapIR {
    return this.ir;
  }

  /** 엔티티 읽기 전용 순회(삽입순 — INV-D4). combat-system 등 서브시스템이 매 틱 여기서 분할·순회한다. */
  get entities(): ReadonlyMap<number, UnitEntity> {
    return this._entities;
  }

  /**
   * 엔티티 스폰(R-202/206 소비, 이후 VM native 배선도 이 경로를 탄다). 삽입순 유지(INV-D4) —
   * 같은 id 재삽입은 Map.set 시맨틱(교체, 최초 삽입 위치 유지).
   */
  spawnUnit(entity: UnitEntity): void {
    const previous = this._entities.get(entity.id);
    const previousFood = previous && this.defStore ? this.defStore.getDef(previous.typeId).foodUsed : 0;
    const nextDef = this.defStore?.getDef(entity.typeId);
    const nextFood = nextDef?.foodUsed ?? 0;
    if (nextDef?.meta.source === "fallback") this.emit({kind: "UnknownUnitDef", typeId: entity.typeId});
    entity.spawnTick = this._tickCount;
    this._entities.set(entity.id, entity);
    const delta = nextFood - previousFood;
    if (delta !== 0) this.playerState.adjust(entity.owner, PLAYER_STATE_RESOURCE_FOOD_USED, delta);
  }

  /** 엔티티 제거(사망 정리 등). 존재하지 않는 id는 무시(Map.delete가 이미 no-op, 방어적). */
  removeUnit(id: number): void {
    const entity = this._entities.get(id);
    if (!entity) return;
    this._entities.delete(id);
    const foodUsed = this.defStore ? this.defStore.getDef(entity.typeId).foodUsed : 0;
    if (foodUsed !== 0) this.playerState.adjust(entity.owner, PLAYER_STATE_RESOURCE_FOOD_USED, -foodUsed);
  }

  /** id로 엔티티 조회(가변 참조 그대로 반환 — 호출측이 직접 필드를 mutate 가능, combat-system/VM native 등). */
  getUnit(id: number): UnitEntity | undefined {
    return this._entities.get(id);
  }

  installLife(config: LifeConfig): LifeLedger {
    this.life = new LifeLedger(config);
    this.registerTickPhase("rebucket", () => this.processLifeTimeouts());
    return this.life;
  }

  /** L-2 bridge entry: bounds map runtime rect registrations to authored gate data. */
  handleLifeRect(bounds: { minX: number; minY: number; maxX: number; maxY: number }, unitId: number): "none" | "observed" | "enforced" {
    const life = this.life;
    if (!life || life.config.mode === "off") return "none";
    const gate = life.config.leakGateRects.find((candidate) =>
      candidate.minX === bounds.minX && candidate.minY === bounds.minY && candidate.maxX === bounds.maxX && candidate.maxY === bounds.maxY
    );
    if (!gate) return "none";
    const claimed = life.claimGate(this._tickCount, gate.id, unitId);
    if (!claimed) return life.config.mode === "enforce" ? "enforced" : "observed";
    const unit = this._entities.get(unitId);
    if (!unit?.alive || !life.config.creepOwners.includes(unit.owner)) return "none";
    if (life.config.mode === "observe") {
      this.emit({ kind: "LeakObserved", playerId: gate.playerId, unitId: unit.id, gateId: gate.id });
      return "observed";
    }
    const transition = life.decrement(gate.playerId, "leak");
    if (transition) {
      this.playerState.set(gate.playerId, PLAYER_STATE_RESOURCE_LUMBER, transition.value);
      this.emit({ kind: "LifeChanged", playerId: gate.playerId, unitId: unit.id, previous: transition.previous, value: transition.value, cause: "leak" });
      this.removeUnit(unit.id);
      if (transition.value === 0 && (life.config.lifeMode === "shared" || gate.playerId === 0)) this.endGame(null);
    }
    return "enforced";
  }

  /**
   * G-1: GEM_IDENTITY_MINE_DESIGN §5.1 — 트리거 특수 대미지(UnitDamageTargetBJ 네이티브)의 단일 진입점.
   * combat-pipe.ts의 엔진 대미지(damageAfterDefense 직접 소비)와 별도 경로이지만 같은 공식을 재사용한다
   * (deny-first: 대미지 공식 재구현 금지 — balance/combat.ts가 유일한 정본).
   * ignoreArmorValue=true (non-Normal damage, including Enhanced) bypasses only
   * numeric armor; attack-type versus armor-class ratios still apply. The previous
   * v1 approximation reversed these two axes (original Wc3C test report, 2008).
   * 사망 정산은 combat-pipe.ts의 deathQueue 밖에서 독립적으로 수행(alive=false·removeUnit·UnitDied emit)
   * — killerUnitId 시맨틱(GetKillingUnit())은 엔진 사망과 동일한 모양으로 유지한다.
   */
  applyTriggerDamage(
    targetId: number,
    attackerId: number | null,
    amount: number,
    attackType: AttackTypeId,
    ignoreArmorValue = false,
  ): { applied: boolean; dealt: number; died: boolean } {
    const target = this._entities.get(targetId);
    if (!target || !target.alive || target.invulnerable) return { applied: false, dealt: 0, died: false };
    const def = this.defStore?.getDef(target.typeId);
    const gc = this.gc;
    if (!def || !gc) return { applied: false, dealt: 0, died: false };
    const roll = Math.trunc(amount);
    const armor=effectiveArmorValue(def.armorValue,target.abilities,this.abilityEffects,{target,targetMask:def.movementType?(def.movementType==='fly'?2:1):3,sources:this._entities.values(),status:this.status,areAllied:(a,b)=>this.playerState.getAlliance(a,b,ALLIANCE_TYPES.ALLIANCE_PASSIVE)});
    const dealt = damageAfterDefense(roll,attackType,def.armorType,ignoreArmorValue?0:armor,gc);
    target.hp -= dealt;
    let died = false;
    if (target.hp <= 0 && target.alive) {
      died = true;
      this.settleUnitDeath(target.id,attackerId??undefined);
    }
    return { applied: true, dealt, died };
  }

  /** One live settlement path for attack, trigger and DOT deaths. Removing is not killing.
   * Membership is the once-only guard: settlement removes the entity; repeated hits cannot pay again. */
  settleUnitDeath(unitId:number,killerUnitId?:number,sourceOwner?:number):boolean{
    const unit=this._entities.get(unitId);if(!unit||unit.hp>0)return false;
    const owner=this._entities.get(killerUnitId??-1)?.owner??sourceOwner,def=this.defStore?.getDef(unit.typeId);
    unit.alive=false;
    if(owner!==undefined&&Number.isSafeInteger(owner)&&owner>=0&&def){
      if(this.bountyMode==='source'){
        if(owner!==unit.owner&&!this.playerState.getAlliance(owner,unit.owner,ALLIANCE_TYPES.ALLIANCE_PASSIVE)&&this.playerState.get(unit.owner,PLAYER_STATE_GIVES_BOUNTY)!==0){
          if(def.sourceBounty)this.ledger.adjustGold(owner,rollSourceBounty(this.rng,def.sourceBounty),'bounty');
          else this.emit({kind:'MissingUnitBounty',typeId:unit.typeId});
        }
      }else if(this.bountyMode==='engine'||this.bountyMode==='both')this.ledger.adjustGold(owner,rollBounty(this.rng,def.bounty.base,def.bounty.spreadPm),'bounty');
    }
    this.emit({kind:'UnitDied',unitId,killerUnitId});this.removeUnit(unitId);return true;
  }

  private processLifeTimeouts(): void {
    const life = this.life;
    const timeout = life?.config.survivalTimeoutTicks;
    if (!life || life.config.mode !== "enforce" || timeout == null || this._gameOver) return;
    for (const unit of [...this._entities.values()]) {
      if (!unit.alive || !life.config.creepOwners.includes(unit.owner)) continue;
      if (this._tickCount - unit.spawnTick <= timeout) continue;
      // Timeout scenarios provide their lane owner through the first authored gate; real-map default is OFF.
      const playerId = life.config.leakGateRects[0]?.playerId ?? 0;
      const transition = life.decrement(playerId, "timeout");
      if (!transition) continue;
      this.playerState.set(playerId, PLAYER_STATE_RESOURCE_LUMBER, transition.value);
      this.emit({ kind: "LifeChanged", playerId, unitId: unit.id, previous: transition.previous, value: transition.value, cause: "timeout" });
      this.removeUnit(unit.id);
      if (transition.value === 0 && (life.config.lifeMode === "shared" || playerId === 0)) this.endGame(null);
    }
  }

  /** L-3 scenario-owned wave counter asks the engine only for terminal observation. */
  evaluateLifeVictory(wave: number, maxWave: number, winner = 0): boolean {
    const life = this.life;
    if (!life || life.config.mode !== "enforce" || this._gameOver) return false;
    if (Math.trunc(wave) < Math.trunc(maxWave) || life.lives(winner) <= 0) return false;
    for (const unit of this._entities.values()) {
      if (unit.alive && life.config.creepOwners.includes(unit.owner)) return false;
    }
    return this.endGame(Math.trunc(winner));
  }

  get gameOver(): boolean {
    return this._gameOver;
  }

  /** victory natives와 enforce LifeLedger가 공유하는 정확히-1회 종결 seam. */
  endGame(winner: number | null): boolean {
    if (this._gameOver) return false;
    this._gameOver = true;
    this.life?.markGameOver();
    this.emit({ kind: "GameOver", winner });
    return true;
  }

  /**
   * 서브시스템 등록 seam. R-202(unitLoop)~R-207(triggerBridge) 등이 여기 훅을 꽂는다.
   * 같은 phase에 여러 훅이 등록되면 등록순으로 실행(INV-D4 동점 규율과 동일 정신).
   */
  registerTickPhase(phase: TickPhase, fn: TickHook): void {
    this.hooks[phase].push(fn);
  }

  /** 훅이 이벤트를 큐에 넣는 유일한 경로(event stream 채널). R-207 확장: bridgeEventQueue에도 동시
   *  적재(같은 이벤트의 두 번째 사본) — natives/bridge.ts가 같은 틱 내 RectEntered/UnitDied를 drainEvents()
   *  의 외부 소비 계약을 건드리지 않고 소비할 수 있게 한다. */
  emit(event: SimEvent): void {
    this.eventQueue.push(event);
    this.bridgeEventQueue.push(event);
  }

  /** R-207: 헤드리스·M3 공용 입력 seam. 즉시 처리하지 않고 큐잉만 한다(triggerBridge 단계가 소비 —
   *  tick 순서 고정 규율을 그대로 따름, INV-D4). */
  injectChat(playerId: number, text: string): void {
    this.chatQueue.push({ playerId, text });
  }

  /** natives/triggers 브리지 전용 — 큐를 비우며 반환(삽입순). */
  drainChat(): Array<{ playerId: number; text: string }> {
    const drained = this.chatQueue.slice();
    this.chatQueue.length = 0;
    return drained;
  }

  injectDialogClick(playerId: number, buttonId: number): void {
    this.dialogClickQueue.push({ playerId: Math.trunc(playerId), buttonId: Math.trunc(buttonId) });
  }

  drainDialogClicks(): Array<{ playerId: number; buttonId: number }> {
    const drained = this.dialogClickQueue.slice();
    this.dialogClickQueue.length = 0;
    return drained;
  }

  abilityEffects?:import("./ability-effects.ts").CombatAbilityCatalog;
  navigation?:import("./navigation.ts").GridNavigation;

  placeStructure(playerId: number, typeId: string, x: number, y: number): boolean {
    if (!Number.isSafeInteger(playerId) || playerId < 0 || !Number.isFinite(x) || !Number.isFinite(y) ||
        !/^[\x00-\xff]{4}$/.test(typeId) || this.gameOver || this.playerState.getSlotState(playerId) !== 1) return false;
    const px=Math.round(x),py=Math.round(y);
    if(this.navigation&&!this.navigation.canBuild(typeId,px,py,this.buildQueue))return false;
    this.buildQueue.push({builderId:null,playerId,typeId,x:px,y:py});
    return true;
  }

  buildStructure(builderId: number, typeId: string, x: number, y: number): boolean {
    const builder = this._entities.get(Math.trunc(builderId));
    if (!builder?.alive || (this.navigation&&!this.navigation.canBuild(typeId,x,y,this.buildQueue))) return false;
    this.buildQueue.push({ builderId: builder.id, typeId, x: Math.round(x), y: Math.round(y) });
    return true;
  }

  getPlayerTechCount(playerId:number,techId:string):number{
    const researched=this.getResearchLevel(playerId,techId);if(researched>0)return researched;
    let count=0;for(const e of this._entities.values())if(e.alive&&e.owner===playerId&&e.typeId===techId)count++;return count;
  }
  validateTrainUnit(playerId:number,producerId:number,typeId:string):UnitTrainRejectReason|null{
    if(this.gameOver)return 'game-over';
    const producer=this.getUnit(producerId);if(!producer?.alive)return 'missing-unit';
    if(!this.playerState.canControl(producer.owner,playerId))return 'not-owner';
    if(!this.defStore?.getDef(producer.typeId).trainingOptions?.includes(typeId))return 'not-trainable';
    if(this.pendingTrainings.has(producerId)||this.trainingQueue.some(q=>q.producerId===producerId))return 'busy';
    const target=this.defStore.getDef(typeId);
    if(target.sourceGoldCost===undefined||target.buildTimeTicks===undefined||target.techRequirements===undefined||target.sourceLumberCost===undefined||target.sourceFoodCost===undefined)return 'missing-data';
    // Current map purchases explicitly cost zero lumber and food. Other cost types stay explicit gaps.
    if(target.sourceLumberCost!==0||target.sourceFoodCost!==0)return 'unsupported-cost';
    if(target.techRequirements.some(r=>this.getPlayerTechCount(producer.owner,r.techId)<r.count))return 'prereq-unmet';
    if(this.ledger.gold(producer.owner)<target.sourceGoldCost)return 'insufficient-gold';return null;
  }
  issueTrainUnit(playerId:number,producerId:number,typeId:string):boolean{
    const reason=this.validateTrainUnit(playerId,producerId,typeId);if(reason){this.emit({kind:'TrainingRejected',playerId,producerId,typeId,reason});return false;}
    this.trainingQueue.push({playerId,producerId,typeId});return true;
  }
  drainTrainingRequests(){return this.trainingQueue.splice(0);}

  unitUpgradeCost(unitId:number,targetTypeId:string):number|undefined{
    const unit=this.getUnit(unitId),from=unit&&this.defStore?.getDef(unit.typeId),target=this.defStore?.getDef(targetTypeId);
    if(!target||target.sourceGoldCost===undefined||this.gc?.relativeUpgradeCost===undefined)return undefined;
    if(this.gc.relativeUpgradeCost){if(from?.sourceGoldCost===undefined)return undefined;return Math.max(0,target.sourceGoldCost-from.sourceGoldCost);}
    return target.sourceGoldCost;
  }
  validateUnitUpgrade(playerId:number,unitId:number,targetTypeId:string):UnitUpgradeRejectReason|null{
    if(this.gameOver)return 'game-over';
    const unit=this.getUnit(unitId);if(!unit?.alive)return 'missing-unit';
    if(!this.playerState.canControl(unit.owner,playerId))return 'not-owner';
    const from=this.defStore?.getDef(unit.typeId),target=this.defStore?.getDef(targetTypeId);
    if(unit.typeId===targetTypeId||!from?.upgradesTo?.includes(targetTypeId))return 'not-an-upgrade';
    if(unit.upgrading||this.pendingUpgrades.has(unitId)||this.upgradeQueue.some(r=>r.unitId===unitId))return 'busy';
    const cost=this.unitUpgradeCost(unitId,targetTypeId);
    if(!target||target.buildTimeTicks===undefined||target.techRequirements===undefined||cost===undefined)return 'missing-data';
    if(target.techRequirements.some(r=>this.getPlayerTechCount(unit.owner,r.techId)<r.count))return 'prereq-unmet';
    if(this.ledger.gold(unit.owner)<cost)return 'insufficient-gold';return null;
  }
  issueUnitUpgrade(playerId:number,unitId:number,targetTypeId:string):boolean{
    const reason=this.validateUnitUpgrade(playerId,unitId,targetTypeId);
    if(reason){this.emit({kind:'UpgradeRejected',playerId,unitId,targetTypeId,reason});return false;}
    this.upgradeQueue.push({playerId,unitId,targetTypeId});return true;
  }
  private advanceUnitUpgrades():void{
    for(const [id,p] of this.pendingUpgrades){
      const unit=this.getUnit(id);if(!unit?.alive){this.pendingUpgrades.delete(id);this.emit({kind:'UpgradeRejected',playerId:p.playerId,unitId:id,targetTypeId:p.targetTypeId,reason:'missing-unit'});continue;}
      p.remainingTicks--;
      if(p.remainingTicks<=0)this.finishUnitUpgrade(id);
    }
    const requests=this.upgradeQueue.splice(0);
    for(const r of requests){
      const reason=this.validateUnitUpgrade(r.playerId,r.unitId,r.targetTypeId);if(reason){this.emit({kind:'UpgradeRejected',...r,reason});continue;}
      const unit=this.getUnit(r.unitId)!,target=this.defStore!.getDef(r.targetTypeId),cost=this.unitUpgradeCost(unit.id,r.targetTypeId)!;
      if(cost)this.ledger.adjustGold(unit.owner,-cost,'cost');unit.upgrading=true;
      this.pendingUpgrades.set(unit.id,{...r,fromTypeId:unit.typeId,owner:unit.owner,cost,remainingTicks:target.buildTimeTicks!});
      this.emit({kind:'UpgradeStarted',unitId:unit.id,fromTypeId:unit.typeId,targetTypeId:r.targetTypeId,owner:unit.owner,cost,durationTicks:target.buildTimeTicks!});
      if(target.buildTimeTicks===0)this.finishUnitUpgrade(unit.id);
    }
  }
  private finishUnitUpgrade(id:number):void{
    const p=this.pendingUpgrades.get(id),old=this.getUnit(id);if(!p||!old?.alive||!this.defStore)return;
    const from=this.defStore.getDef(old.typeId),target=this.defStore.getDef(p.targetTypeId),next=createEntity(target,{id:old.id,owner:old.owner,x:old.x,y:old.y,facing:old.facing});
    next.userData=old.userData;next.hp=Math.max(1,Math.min(next.hpMax,Math.floor(old.hp*next.hpMax/Math.max(1,old.hpMax))));next.invulnerable=old.invulnerable;next.paused=old.paused;next.cooldownLeft=old.cooldownLeft;next.spawnPending=old.spawnPending;next.spawnTick=old.spawnTick;next.prevX=old.prevX;next.prevY=old.prevY;
    const inherent=new Set((from.abilities??[]).map(rawCodeOf));
    for(const [ability,level] of old.abilities)if(!inherent.has(ability)||next.abilities.has(ability))next.abilities.set(ability,level);
    this._entities.set(id,next);this.pendingUpgrades.delete(id);this.navigation?.refresh();
    this.emit({kind:'UpgradeFinished',unitId:id,fromTypeId:p.fromTypeId,targetTypeId:p.targetTypeId,owner:next.owner,cost:p.cost});
  }

  drainBuildRequests(): Array<{ builderId: number | null; playerId?: number; typeId: string; x: number; y: number }> {
    const drained = this.buildQueue.slice();
    this.buildQueue.length = 0;
    return drained;
  }


  validateMoveOrder(playerId:number,unitId:number,x:number,y:number):UnitMoveRejectReason|null{
    if(this.gameOver)return 'game-over';
    if(!Number.isSafeInteger(playerId)||playerId<0||!Number.isSafeInteger(unitId)||unitId<=0||!Number.isFinite(x)||!Number.isFinite(y))return 'invalid-order';
    const unit=this.getUnit(unitId);if(!unit?.alive)return 'missing-unit';
    if(!this.playerState.canControl(unit.owner,playerId))return 'not-owner';
    if(unit.paused)return 'paused';if(unit.upgrading||unit.moveSpeedU<=0)return 'immobile';return null;
  }
  issueMoveOrder(playerId:number,unitId:number,x:number,y:number):boolean{
    const reason=this.validateMoveOrder(playerId,unitId,x,y);if(reason){this.emit({kind:'MoveOrderRejected',playerId,unitId,reason});return false;}
    this.cancelTargetAbilityOrders(unitId);const unit=this.getUnit(unitId)!;delete unit.attackTargetId;return assignPointMove(unit,x,y);
  }

  /** Player intent: checks owner/shared-control permission now and again when consumed. castAbility
   * remains the low-level trigger-injection seam for controlled diagnostics. */
  validateAbilityOrder(playerId: number, unitId: number, abilityId: string, targetUnitId: number | null = null): AbilityOrderRejectReason | null {
    if(this.gameOver)return "game-over";
    if (!Number.isSafeInteger(playerId) || playerId < 0 || !Number.isSafeInteger(unitId) || typeof abilityId !== "string" ||
        !/^[\x00-\xff]{4}$/.test(abilityId)) return "invalid-order";
    const unit = this._entities.get(unitId);
    if (!unit?.alive) return "missing-unit";
    if (!this.playerState.canControl(unit.owner, playerId)) return "not-owner";
    if ((unit.abilities.get(rawCodeOf(abilityId)) ?? 0) < 1) return "missing-ability";
    if(targetUnitId!==null){
      if(!Number.isSafeInteger(targetUnitId)||targetUnitId<=0)return 'invalid-order';
      const target=this.getUnit(targetUnitId);if(!target?.alive)return 'missing-target';
      if(unit.paused)return 'paused';if(unit.upgrading)return 'busy';if(isStunned(this.status,unit.id))return 'stunned';
      const reach=this.targetAbilityReach(unit,abilityId,target);if(reach===undefined)return 'missing-ability-data';
      if(!withinReach(unit,target,reach)){
        if(!(unit.moveSpeedU>0)||this.defStore?.getDef(unit.typeId).movementType==='_')return 'out-of-range';
        if(!this.targetApproachGoal(unit,target,reach))return 'unreachable';
      }
    }
    return null;
  }

  issueAbilityOrder(playerId: number, unitId: number, abilityId: string, targetUnitId: number | null = null): boolean {
    const reason = this.validateAbilityOrder(playerId, unitId, abilityId, targetUnitId);
    if (reason) {
      this.emit({kind: "AbilityOrderRejected", playerId, unitId, abilityId, reason});
      return false;
    }
    this.cancelTargetAbilityOrders(unitId);if(targetUnitId!==null)delete this.getUnit(unitId)!.attackTargetId;
    this.castQueue.push({playerId, unitId, abilityId, targetUnitId});
    return true;
  }

  validatePointAbilityOrder(playerId:number,unitId:number,abilityId:string,x:number,y:number):AbilityOrderRejectReason|null{
    const base=this.validateAbilityOrder(playerId,unitId,abilityId);if(base)return base;
    if(!Number.isFinite(x)||!Number.isFinite(y))return 'invalid-order';
    const unit=this._entities.get(unitId)!,range=this.abilityRange?.(abilityId,unit.abilities.get(rawCodeOf(abilityId))??1);
    if(range===undefined)return 'missing-ability-data';
    if((unit.x-x)**2+(unit.y-y)**2>range**2)return 'out-of-range';
    const grid=this.navigation?.grid;if(grid&&(x<grid.originX||y<grid.originY||x>=grid.originX+grid.width*grid.cellSize||y>=grid.originY+grid.height*grid.cellSize))return 'out-of-range';
    return null;
  }
  issuePointAbilityOrder(playerId:number,unitId:number,abilityId:string,x:number,y:number):boolean{
    const reason=this.validatePointAbilityOrder(playerId,unitId,abilityId,x,y);
    if(reason){this.emit({kind:'AbilityOrderRejected',playerId,unitId,abilityId,reason});return false;}
    this.cancelTargetAbilityOrders(unitId);
    this.castQueue.push({playerId,unitId,abilityId,targetUnitId:null,targetPoint:{x:Math.round(x),y:Math.round(y)}});return true;
  }

  castAbility(unitId: number, abilityId: string, targetUnitId: number | null = null): boolean {
    const unit = this._entities.get(Math.trunc(unitId));
    if (!unit?.alive) return false;
    this.castQueue.push({ unitId: unit.id, abilityId, targetUnitId: targetUnitId != null ? Math.trunc(targetUnitId) : null });
    return true;
  }

  private targetAbilityReach(unit:UnitEntity,abilityId:string,target:UnitEntity):number|undefined{
    const range=this.abilityRange?.(abilityId,unit.abilities.get(rawCodeOf(abilityId))??1);
    if(range===undefined||!Number.isFinite(range)||range<0)return undefined;
    const radius=(entity:UnitEntity)=>{const def=this.defStore?.getDef(entity.typeId);return Math.max(0,def?.sourceCollisionU??def?.collisionU??0);};
    return range+radius(unit)+radius(target);
  }
  private targetApproachGoal(unit:UnitEntity,target:UnitEntity,reach:number):{x:number;y:number}|undefined{
    if(!this.navigation)return {x:Math.round(target.x),y:Math.round(target.y)};
    const goal=this.navigation.route(unit,target,this.defStore?.getDef(unit.typeId).movementType==='fly',reach)?.at(-1);
    return goal&&withinReach(goal,target,reach)?goal:undefined;
  }
  private stopCastApproach(request:AbilityCastRequest):void{
    const unit=this.getUnit(request.unitId),goal=request.approach;
    if(goal&&unit&&unit.orderX===goal.x&&unit.orderY===goal.y)unit.orderActive=0;
    delete request.approach;
  }
  /** Valid newer orders cancel queued AND currently consumed snapshot references. */
  cancelTargetAbilityOrders(unitId:number):void{
    for(const request of [...this.castQueue,...this.castBatch])if(request.unitId===unitId&&request.playerId!==undefined&&request.targetUnitId!==null&&!request.cancelled){this.stopCastApproach(request);request.cancelled=true;}
    for(let i=this.castQueue.length-1;i>=0;i--)if(this.castQueue[i]!.cancelled)this.castQueue.splice(i,1);
  }
  /** Existing bridge consumes one intent, or keeps it in the same queue while approaching. */
  prepareAbilityCast(request:AbilityCastRequest):boolean{
    if(request.cancelled)return false;
    if(request.playerId===undefined)return Boolean(this.getUnit(request.unitId)?.alive);
    const reason=request.targetPoint?this.validatePointAbilityOrder(request.playerId,request.unitId,request.abilityId,request.targetPoint.x,request.targetPoint.y):this.validateAbilityOrder(request.playerId,request.unitId,request.abilityId,request.targetUnitId);
    if(reason){this.stopCastApproach(request);this.emit({kind:'AbilityOrderRejected',playerId:request.playerId,unitId:request.unitId,abilityId:request.abilityId,reason});return false;}
    if(request.targetUnitId!==null){
      const unit=this.getUnit(request.unitId)!,target=this.getUnit(request.targetUnitId)!,reach=this.targetAbilityReach(unit,request.abilityId,target)!;
      if(!withinReach(unit,target,reach)){
        const goal=this.targetApproachGoal(unit,target,reach)!;assignPointMove(unit,goal.x,goal.y,false);request.approach=goal;this.castQueue.push(request);return false;
      }
    }
    this.stopCastApproach(request);return true;
  }
  drainCastRequests(trackBatch=false):AbilityCastRequest[]{
    const drained=this.castQueue.slice();this.castQueue.length=0;if(trackBatch)this.castBatch=drained;return drained;
  }
  finishCastRequests():void{this.castBatch=[];}

  /** G-2c: enqueue only(buildStructure/castAbility와 동형) — 비용/만렙 검증·레벨 증가·RESEARCH_FINISH
   *  발화는 natives/bridge.ts의 triggerBridge 단계가 다음 틱에 수행한다. playerId 유효성(builder/unit
   *  aliveness에 대응하는 것)은 연구엔 없음 — 항상 큐잉하고 검증은 전부 소비 시점으로 미룬다. */
  research(playerId: number, techId: string): boolean {
    this.researchQueue.push({ playerId: Math.trunc(playerId), techId });
    return true;
  }

  drainResearchRequests(): Array<{ playerId: number; techId: string }> {
    const drained = this.researchQueue.slice();
    this.researchQueue.length = 0;
    return drained;
  }

  /** G-2c: 현재 레벨 조회(미접촉 player×techId는 0 — GoldLedger.gold()의 미접촉=0 관례와 동일). */
  getResearchLevel(playerId: number, techId: string): number {
    return this.researchLevels.get(Math.trunc(playerId))?.get(techId) ?? 0;
  }

  /** G-2c: natives/bridge.ts 전용 — 검증(비용 차감·만렙 미만) 통과 후에만 호출되는 절대값 세터. */
  setResearchLevel(playerId: number, techId: string, level: number): void {
    const p = Math.trunc(playerId);
    let byTech = this.researchLevels.get(p);
    if (!byTech) {
      byTech = new Map();
      this.researchLevels.set(p, byTech);
    }
    byTech.set(techId, Math.trunc(level));
  }

  /** R-207 확장: natives/bridge.ts 전용 — 이번 틱(및 이전 미소비분) 누적 이벤트를 소비(드레인, 삽입순). */
  drainBridgeEvents(): SimEvent[] {
    const drained = this.bridgeEventQueue.slice();
    this.bridgeEventQueue.length = 0;
    return drained;
  }

  /** 현재값 채널(snapshot polling) — entities를 삽입순으로 UnitSnapshot(world_api 계약)에 매핑한다. */
  units(): ReadonlyArray<UnitSnapshot> {
    const out: UnitSnapshot[] = [];
    for (const entity of this._entities.values()) {
      out.push({ id: entity.id, typeId: entity.typeId, owner: entity.owner, x: entity.x, y: entity.y, hp: entity.hp, hpMax: entity.hpMax });
    }
    return out;
  }

  /** 순간사건 채널(event stream) — 반환 후 큐를 비운다. snapshot 채널과 섞지 않는다. */
  drainEvents(): SimEvent[] {
    const drained = this.eventQueue.slice();
    this.eventQueue.length = 0;
    return drained;
  }

  /**
   * DT 1틱. tick 7단계 고정 순서:
   * ①시계 전진 ②timers ③unitLoop ④combat ⑤triggerBridge ⑥rebucket ⑦(호출자가 drainEvents()로 드레인)
   */
  step(): void {
    this._tickCount += 1; // ① 시계 전진 (DT=1/20 고정스텝 — 실제 초 환산은 DT 상수 소비 쪽 책임)
    for (const phase of TICK_PHASES) {
      if(phase==="triggerBridge")this.advanceUnitUpgrades();
      for (const hook of this.hooks[phase]) {
        hook(this);
      }
    }
    // ⑦ 이벤트 드레인은 Sim이 자동 수행하지 않는다 — drainEvents()가 그 경계.
    //    (여기서 자동 드레인하면 event stream이 step() 호출자 몰래 소비되어 계약이 깨진다.)
  }

  /**
   * 결정론 회귀용 상태 해시(INV-D4). 대상 = tickCount + rng 내부 state + 엔티티 Map(삽입순) + 플레이어 배열.
   * Map/배열 삽입순 순회만 — Set·객체 키 순서 의존 금지.
   */
  stateHash(): string {
    let entityPart = "";
    for (const [id, entity] of this._entities) {
      // 결정론 커버리지: 위치·hp·생존 + 전투 상태(cooldownLeft) + 이동 상태(R-203 신설 필드) 전부 정수 → 해시 포함.
      entityPart +=
        `${id}:${entity.typeId}:${entity.owner}:${entity.x}:${entity.y}:${entity.hp}:${entity.alive ? 1 : 0}` +
        `:${entity.cooldownLeft}:${entity.moveSpeedU}:${entity.orderX}:${entity.orderY}:${entity.orderActive}:${entity.moveBudgetPm}:${entity.legsCompleted}:${entity.spawnPending}:${entity.spawnTick}:${entity.hpMax}:${entity.mana}:${entity.facing}:${entity.userData}:${entity.prevX}:${entity.prevY}:${entity.invulnerable?1:0}:${entity.upgrading?1:0}|`;
      if(entity.attackTargetId!==undefined)entityPart+=`attack-target:${entity.attackTargetId}|`;
      if(entity.acquireRangeU!==undefined)entityPart+=`acquire:${entity.acquireRangeU}|`;
      if(entity.paused) entityPart += `paused:${entity.id}|`;
      for (const [abilityId, level] of entity.abilities) entityPart += `a${abilityId}:${level}|`;
    }
    let playerPart = "";
    for (const player of this.playerState.snapshots()) {
      const states = player.states.filter(([stateKey]) => stateKey !== PLAYER_STATE_RESOURCE_GOLD);
      if (states.length > 0) playerPart += `${JSON.stringify({ playerId: player.playerId, states })}|`;
    }
    let goldPart = "";
    for (const [playerId, value] of this.ledger.snapshots()) goldPart += `${playerId}:${value}|`;
    let lifePart = "";
    for (const [playerId, value] of this.life?.snapshots() ?? []) lifePart += `${playerId}:${value}|`;
    let buildPart = "";
    for (const request of this.buildQueue) buildPart += `${request.builderId}:${request.playerId ?? "legacy"}:${request.typeId}:${request.x}:${request.y}|`;
    let castPart = "";
    for (const request of this.castQueue) castPart += `${request.unitId}:${request.abilityId}:${request.targetUnitId ?? "-"}:${request.playerId ?? "raw"}${request.targetPoint?`:point:${request.targetPoint.x},${request.targetPoint.y}`:""}${request.approach?`:approach:${request.approach.x},${request.approach.y}`:""}|`;
    // G-2c: 연구 미소비 요청 큐 + 레벨 저장소(삽입순, INV-D4) — buildPart/castPart와 동일한 결정론 커버리지 정신.
    let researchQueuePart = "";
    for (const request of this.researchQueue) researchQueuePart += `${request.playerId}:${request.techId}|`;
    let researchLevelPart = "";
    for (const [playerId, byTech] of this.researchLevels) {
      for (const [techId, level] of byTech) researchLevelPart += `${playerId}:${techId}:${level}|`;
    }
    // G-5: 상태효과 저장소(삽입순 2단 Map, INV-D4) — 전 필드 정수라 그대로 문자열화.
    let statusPart = "";
    for (const [entityId, byKind] of this.status) {
      for (const [kind, effect] of byKind) {
        if (effect.kind === "slow") statusPart += `${entityId}:${kind}:${effect.magnitudePm}:${effect.remainingTicks}|`;
        else if (effect.kind === "stun") statusPart += `${entityId}:stun:${effect.remainingTicks}|`;
        else if(effect.kind === "armorReduction")statusPart += `${entityId}:${kind}:${effect.amount}:${effect.remainingTicks}|`;
        else statusPart += `${entityId}:${kind}:${effect.perTick}:${effect.remainingTicks}:${effect.perSecondPm??0}:${effect.remainder??0}:${effect.sourceUnitId??0}:${effect.sourceOwner??-1}:${effect.pulseIntervalTicks??0}:${effect.pulseTicksLeft??0}:${effect.pulseDamagePm??0}|`;
      }
    }
    let upgradePart='';for(const q of this.upgradeQueue)upgradePart+=`q:${q.playerId}:${q.unitId}:${q.targetTypeId}|`;for(const p of this.pendingUpgrades.values())upgradePart+=`p:${p.playerId}:${p.unitId}:${p.fromTypeId}:${p.targetTypeId}:${p.owner}:${p.cost}:${p.remainingTicks}|`;
    let trainingPart='';for(const q of this.trainingQueue)trainingPart+=`q:${q.playerId}:${q.producerId}:${q.typeId}|`;for(const q of this.pendingTrainings.values())trainingPart+=`p:${q.playerId}:${q.producerId}:${q.typeId}:${q.owner}:${q.cost}:${q.remainingTicks}|`;
    const canonical = `v=7;up=[${upgradePart}];t=${this._tickCount};r=${this.simRng.getState()};e=[${entityPart}];chat=${JSON.stringify(this.chatQueue)};dialog=${JSON.stringify(this.dialogClickQueue)};g=[${goldPart}];l=[${lifePart}];b=[${buildPart}];c=[${castPart}];rq=[${researchQueuePart}];rl=[${researchLevelPart}];st=[${statusPart}];o=${this._gameOver ? 1 : 0};p=[${playerPart}];alliances=${JSON.stringify(this.playerState.allianceSnapshots())};configuration=${JSON.stringify(this.playerState.configurationSnapshot())}`+(trainingPart?`;training=[${trainingPart}]`:"");
    return fnv1a(canonical);
  }
}

/** WorldFactory 구현 — src/world_api.ts 계약(ir, seed) => IWorld. */
export const createSim: WorldFactory = (ir: MapIR, seed: number): IWorld => new Sim(ir, seed);
