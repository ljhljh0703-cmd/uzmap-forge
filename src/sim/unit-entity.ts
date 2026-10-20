/**
 * R-202 — Unit Entity: 런타임 유닛 인스턴스(동적 절반, def-store.ts의 정적 UnitDef와 짝).
 * 계약: docs/ARCHITECTURE.md §sim 2층(Def 정적 / Entity 동적).
 * id는 호출측이 관리하는 creationSeq(생성순 증가 정수) — 이 파일은 카운터를 소유하지 않고 주입만 받는다
 * (결정론 규율: id=creationSeq 증가). Def와 달리 Entity는 가변(전투로 hp가 깎이는 등) — freeze하지 않는다.
 */
import {rawCodeOf} from "../ir/fourcc.ts";
import type { FourCC } from "../ir/types.ts";
import type { UnitDef } from "./def-store.ts";

/** 런타임 유닛 인스턴스. 전 필드 정수(x/y/facing 포함 — 정수 월드유닛 관례, 설계 §3.1-2). */
export interface UnitEntity {
  id: number;
  typeId: FourCC;
  owner: number;
  x: number;
  y: number;
  facing: number;
  hp: number;
  hpMax: number;
  mana: number;
  userData: number;
  cooldownLeft: number;
  alive: boolean;
  invulnerable?:boolean;
  upgrading?:boolean;
  paused?:boolean;
  acquireRangeU?:number;
  attackTargetId?:number;
  /** R-203 M-1 — 현재 이속(기본 def.moveSpeedU, SetUnitMoveSpeed로 변경 가능). MOVEMENT_LOOP_DESIGN §3.2. */
  moveSpeedU: number;
  /** R-203 M-1 — move 오더 목표(§4). orderActive=0이면 orderX/Y는 무의미(마지막 값 잔류). */
  orderX: number;
  orderY: number;
  orderActive: 0 | 1;
  /** R-203 M-1 — 등속 적분 잔여(밀리유닛, §4.2). */
  moveBudgetPm: number;
  /** R-203 M-1 — 수락된 상이 목표 move 오더 수(§5.3 pathProgress 성분). */
  legsCompleted: number;
  /** R-203 M-1/M-3 — 직전 틱 위치(진입 판정 §5.1 스냅샷). */
  prevX: number;
  prevY: number;
  /** R-307c — 생성 직후 첫 unitLoop 진입 판정 대기(1). WC3는 렉트 *내부에 생성*된 유닛도 EnterRect를
   *  발화한다(전이 밖→안이 아니어도) — 스폰 크립의 첫 이동 오더가 이 발화에 의존(실맵 실측). 판정 후 0. */
  spawnPending: 0 | 1;
  /** L-1 — Sim.spawnUnit이 현재 정수 tick으로 덮어쓰는 생성 시점. */
  spawnTick: number;
  /** E-4 — script-authored ability rawcode → integer level; effects remain trigger-owned. */
  abilities: Map<number, number>;
}

/** createEntity 초기화 입력 — id는 호출측 creationSeq 카운터가 공급(이 파일은 카운터 미소유). */
export interface CreateEntityInit {
  id: number;
  owner: number;
  x: number;
  y: number;
  facing: number;
}

/** def에서 신규 UnitEntity를 만든다. hp/mana는 def의 완전 블록으로 초기화(hp=hpMax). */
export function createEntity(def: UnitDef, init: CreateEntityInit): UnitEntity {
  return {
    id: init.id,
    typeId: def.typeId,
    owner: init.owner,
    x: init.x,
    y: init.y,
    facing: init.facing,
    hp: def.hpMax,
    hpMax: def.hpMax,
    mana: def.mana,
    userData: 0,
    cooldownLeft: 0,
    alive: true,
    invulnerable:false,upgrading:false,
    acquireRangeU:def.sourceAcquireRangeU??Math.max(def.attack?.acquireU??0,def.secondaryAttack?.acquireU??0),
    moveSpeedU: def.moveSpeedU,
    orderX: 0,
    orderY: 0,
    orderActive: 0,
    moveBudgetPm: 0,
    legsCompleted: 0,
    prevX: init.x,
    prevY: init.y,
    spawnPending: 1,
    spawnTick: 0,
    abilities: new Map((def.abilities ?? []).map(id => [rawCodeOf(id), 1])),
  };
}

/**
 * ReplaceUnit 시맨틱(실맵 ReplaceUnitBJ 1,545훅 대응, docs/BALANCE_ENGINE_DESIGN.md §2.1) —
 * 위치(x/y/facing)·소유(owner)는 old에서 승계하고, hp/mana는 newDef로 새로 산출(hp=newDef.hpMax),
 * id는 nextId로 갱신한다(엔진상 신규 핸들 취급 — cooldownLeft/userData도 0으로 리셋).
 * R-203 M-1: 오더는 승계하지 않는다(MOVEMENT_LOOP_DESIGN §3.2) — moveSpeedU는 newDef 기본값,
 * order/budget/legs는 리셋, prevX/Y는 old의 현재 위치(신규 핸들의 "직전 위치" = 스폰 위치와 동일).
 */
export function replaceEntity(old: UnitEntity, newDef: UnitDef, nextId: number): UnitEntity {
  return createEntity(newDef, {id: nextId, owner: old.owner, x: old.x, y: old.y, facing: old.facing});
}
