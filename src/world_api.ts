/**
 * IWorld seam — 에디터·런타임·헤드리스 봇이 sim을 보는 유일한 창구.
 * ([[woc-ai-gamedev-teardown]] §1 이식) 새 데이터/액션은 여기 먼저 추가 → 구현.
 * M2(R-201)에서 Sim이 이 계약을 구현한다. 프레젠테이션은 IWorld만 읽고 명령한다.
 */
import type { MapIR } from "./ir/types.ts";

export interface UnitSnapshot {
  id: number;
  typeId: string;
  owner: number;
  x: number;
  y: number;
  hp: number;
  hpMax: number;
}

export type AbilityOrderRejectReason = "invalid-order" | "missing-unit" | "not-owner" | "missing-ability" | "missing-target" | "missing-ability-data" | "out-of-range" | "unreachable" | "paused" | "stunned" | "busy" | "game-over";

export type UnitUpgradeRejectReason='missing-unit'|'not-owner'|'not-an-upgrade'|'busy'|'insufficient-gold'|'prereq-unmet'|'missing-data'|'game-over';
export type UnitMoveRejectReason='invalid-order'|'missing-unit'|'not-owner'|'immobile'|'paused'|'game-over';
export type UnitTrainRejectReason=UnitUpgradeRejectReason|'not-trainable'|'unsupported-cost';
export type SimEvent =
  | {kind:'MoveOrderRejected';playerId:number;unitId:number;reason:UnitMoveRejectReason}
  | {kind:'TrainingStarted';producerId:number;typeId:string;owner:number;cost:number;durationTicks:number}
  | {kind:'TrainingFinished';producerId:number;unitId:number;typeId:string;owner:number;cost:number}
  | {kind:'TrainingRejected';producerId:number;playerId:number;typeId:string;reason:UnitTrainRejectReason}
  | {kind:'MissingUnitBounty';typeId:string}
  | {kind:'UpgradeStarted';unitId:number;fromTypeId:string;targetTypeId:string;owner:number;cost:number;durationTicks:number}
  | {kind:'UpgradeFinished';unitId:number;fromTypeId:string;targetTypeId:string;owner:number;cost:number}
  | {kind:'UpgradeRejected';playerId:number;unitId:number;targetTypeId:string;reason:UnitUpgradeRejectReason}
  | { kind: "UnitDied"; unitId: number; killerUnitId?: number }
  | { kind: "Attacked"; attackerUnitId: number; targetUnitId: number } // G-1: 발사 성공 시마다(사망 무관) 발화
  | { kind: "UnimplementedNative"; name: string } // INV-D5
  | { kind: "UnknownUnitDef"; typeId: string } // R-202b: roleTable 밖 typeId — 조용한 기본값 금지(설계 §9 D5)
  | { kind: "GameOver"; winner: number | null }
  | { kind: "BuildRejected"; builderId: number | null; playerId?: number; typeId: string; reason: "inactive-player" | "game-over" | "missing-builder" | "insufficient-gold" | "missing-def-store" | "blocked-placement" }
  | { kind: "ConstructFinished"; builderId: number | null; playerId?: number; unitId: number; typeId: string }
  | {kind: "AbilityOrderRejected"; playerId: number; unitId: number; abilityId: string; reason: AbilityOrderRejectReason}
  | { kind: "SpellCast"; unitId: number; abilityId: string }
  | { kind: "LeakObserved"; playerId: number; unitId: number; gateId: string }
  | { kind: "LifeChanged"; playerId: number; unitId: number; previous: number; value: number; cause: "leak" | "timeout" }
  | { kind: "UnknownOrder"; orderId: number; unitId: number } // R-203 M-2: 미지 오더 id — 조용한 no-op 금지(INV-D5)
  | { kind: "DialogClicked"; playerId: number; dialogId: number; buttonId: number }
  | { kind: "RectEntered"; rectId: number; unitId: number } // R-203 M-3: 렉트 진입 전이(발화는 R-207 소비)
  // G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c) — 연구 완료/거부. buildStructure의 ConstructFinished/BuildRejected와
  // 동형(enqueue→triggerBridge 소비 패턴 재사용) — 효과(nL/QM/tM)는 스크립트 소관, 여기는 사실만 통지.
  | { kind: "ResearchFinished"; playerId: number; techId: string; level: number }
  // R-1 C-2(DISPATCH_SONNET_R1_RESEARCH_FIX §2) — prereq-unmet: ResearchSpec.requires 미충족 거부(신규 이벤트
  // 종류 발명 금지 — 기존 ResearchRejected 유니온에 reason 값만 추가).
  | { kind: "ResearchRejected"; playerId: number; techId: string; reason: "unknown-tech" | "max-level" | "insufficient-gold" | "prereq-unmet" };

export interface IWorld {
  readonly tickCount: number;
  /** 현재값 채널 (snapshot polling) */
  units(): ReadonlyArray<UnitSnapshot>;
  /** 순간사건 채널 (event stream) — 두 채널을 섞지 않는다 */
  drainEvents(): SimEvent[];
  /** 결정론 회귀용 상태 해시 */
  stateHash(): string;
  step(): void; // DT 1틱
  /** R-207: 헤드리스·M3 공용 입력 seam — 채팅 명령 주입(다음 triggerBridge 단계에서 소비). */
  injectChat(playerId: number, text: string): void;
  /** R-307b: headless mode/UI adapter click injection, consumed next triggerBridge phase. */
  injectDialogClick(playerId: number, buttonId: number): void;
  /** E-2: enqueue only; construction is consumed on the next triggerBridge phase. */
  /** App placement: player-owned construction, independent of worker entities. */
  placeStructure(playerId: number, typeId: string, x: number, y: number): boolean;
  buildStructure(builderId: number, typeId: string, x: number, y: number): boolean;
  /** E-3: enqueue only; spell triggers consume this on the next triggerBridge phase.
   *  C-1b(DISPATCH_SONNET_C1_COMBINE §2 C-1b): targetUnitId는 기존 castAbility seam의 추가 선택 인자다
   *  (새 입력 경로 아님) — natives/bridge.ts가 소비 시 threadMeta.spellTargetUnit으로 실어 GetSpellTargetUnit()이
   *  조회한다. 미지정/null = 무타겟 시전(GetSpellTargetUnit()은 null 핸들). */
  issueAbilityOrder(playerId: number, unitId: number, abilityId: string, targetUnitId?: number | null): boolean;
  issuePointAbilityOrder(playerId:number,unitId:number,abilityId:string,x:number,y:number):boolean;
  issueMoveOrder(playerId:number,unitId:number,x:number,y:number):boolean;
  /** Raw diagnostic event injection; player input must use issueAbilityOrder. */
  castAbility(unitId: number, abilityId: string, targetUnitId?: number | null): boolean;
  /** G-2c: enqueue only; cost/max-level validation + level increment + RESEARCH_FINISH happens on the
   *  next triggerBridge phase (mirrors buildStructure/castAbility's deferred-validation contract). */
  research(playerId: number, techId: string): boolean;
  issueTrainUnit(playerId:number,producerId:number,typeId:string):boolean;
  issueUnitUpgrade(playerId:number,unitId:number,targetTypeId:string):boolean;
}

export interface WorldFactory {
  (ir: MapIR, seed: number): IWorld;
}
