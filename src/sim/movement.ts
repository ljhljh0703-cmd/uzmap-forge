/**
 * R-203 M-1/M-3 — 결정론 이동 + 렉트 진입 판정.
 * 계약: docs/MOVEMENT_LOOP_DESIGN.md §4(결정론 이동, §4.2 정수 등속 적분 그대로) §5.1(렉트 진입 판정).
 * 모델: 직선 등속, 회피 없음(§4.1 — 라우팅은 스크립트 소유, 이 맵은 ucol=0으로 간섭을 스스로 제거).
 *
 * installMovement(sim, registry?) — combat-system.ts installCombat과 동일 패턴: Sim의 "unitLoop" tick
 * phase에 훅 1개를 등록하는 얇은 배선. 훅 본체:
 *   1. 엔티티 삽입순(INV-D4)으로 §4.2 스텝 적용 — prevX/Y 스냅샷 → 오더 적분 → 이동/도착.
 *   2. (registry 주입 시) 등록순 rect × 삽입순 엔티티 이중 루프로 진입 전이 판정 → RectEntered emit.
 * 순수: rng 무접촉(INV-D1) · 부동소수 미유입(INV-D2, 밀리유닛 정수 누산) · sim 내부 모듈만 import(INV-D3,
 * wpm/formats 접근 없음 — v1 직선 이동은 IR을 소비하지 않는다).
 *
 * RectRegistry는 R-207이 소유하는 자료구조(TriggerRegisterEnterRectSimple이 채움) — 이 슬라이스는
 * 형태(인터페이스) 정의 + 읽기 전용 소비까지만 담당한다(§8.1 M-3 스코프). 실제 트리거 발화 배선은 R-207.
 */
import {ALLIANCE_TYPES} from "./playerstate.ts";
import type {GameConstants} from "./balance/config.ts";
import type {UnitDef} from "./def-store.ts";
import type { Sim } from "./sim.ts";
import type { UnitEntity } from "./unit-entity.ts";
import { mulPm } from "./balance/fixed.ts";
import { isStunned, slowMultiplierPm, type StatusStore } from "./status.ts";

/** DT=1/20초 고정스텝에서 moveSpeedU(유닛/초) → 밀리유닛/틱 환산 계수(§4.2 3행: ×1000pm÷20틱=×50). */
const MILLIUNITS_PER_UNIT_PER_TICK = 50;
const MILLIUNITS_PER_UNIT = 1000;

/** R-207이 채우는 렉트 1건 — TriggerRegisterEnterRectSimple 등록 순서대로 배열에 쌓인다(§5.1). */
export interface RegisteredRect {
  readonly rectId: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly triggerId: number;
}

/** R-203이 읽기 전용으로 소비하는 렉트 등록부 — 등록순 배열 1개(§5.1). R-207 소유, M-3은 형태만 정의. */
export interface RectRegistry {
  readonly rects: ReadonlyArray<RegisteredRect>;
}

/** 폐구간 AABB 포함 판정(§5.1 경계 포함 규칙, WC3 관례 근사 — 가정 A-M4). */
function insideRect(rect: RegisteredRect, x: number, y: number): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

/**
 * §4.2 정수 등속 적분 1엔티티분. prevX/Y 스냅샷은 orderActive 여부와 무관하게 항상 먼저 찍는다
 * (§5.1 진입 판정이 이동 없는 엔티티에도 prev==now로 안전하게 동작해야 하므로).
 */
function stepEntity(e: UnitEntity, status: StatusStore, destination?:{x:number;y:number}|null,auraSlowPm=0,gc?:GameConstants,limits?:UnitDef): void {
  e.prevX = e.x;
  e.prevY = e.y;
  if (e.orderActive === 0 || e.upgrading || e.paused || destination===null) return;
  // G-5(GEM_IDENTITY_MINE_DESIGN §5.4) — stun은 이동을 완전히 스킵한다(발사 스킵은 combat-pipe.ts가 별도
  // 수행 — done-gate "이동만 막으면 미완"). moveBudgetPm 자체를 건드리지 않아 stun 해제 후 잔여 예산이
  // 그대로 이어진다(오실레이션 없음, §4.2 정신과 동일).
  if (isStunned(status, e.id)) return;

  // G-5: slow는 moveBudgetPm 가산치에 정수 배율(mulPm)로만 적용한다(좌표 직접 조작 금지, done-gate ①).
  const slowPm = mulPm(slowMultiplierPm(status,e.id),1000-auraSlowPm);
  let budget=e.moveSpeedU>0?mulPm(e.moveSpeedU*MILLIUNITS_PER_UNIT_PER_TICK,slowPm):0;
  const minimum=Math.max(gc?.minUnitSpeedU??0,limits?.sourceMinMoveSpeedU??0);
  const localMaximum=limits?.sourceMaxMoveSpeedU??0;
  const maximum=Math.min(gc?.maxUnitSpeedU??Infinity,localMaximum>0?localMaximum:Infinity);
  if(minimum>maximum)throw new RangeError('incompatible local/global movement speed bounds');
  if(e.moveSpeedU>0)budget=Math.min(Math.max(budget,minimum*MILLIUNITS_PER_UNIT_PER_TICK),maximum*MILLIUNITS_PER_UNIT_PER_TICK);
  e.moveBudgetPm += budget;
  const stepU = Math.floor(e.moveBudgetPm / MILLIUNITS_PER_UNIT);
  e.moveBudgetPm -= stepU * MILLIUNITS_PER_UNIT;

  const target=destination??{x:e.orderX,y:e.orderY};
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const chebyshevDist = Math.max(Math.abs(dx), Math.abs(dy));

  if (chebyshevDist <= stepU) {
    // 도착 = 스냅 + 오더 종료(§4.2 6행) — 오실레이션·미세잔차 없음.
    e.x = target.x;
    e.y = target.y;
    if(e.x===e.orderX&&e.y===e.orderY)e.orderActive = 0;
    e.moveBudgetPm = 0;
  } else {
    // 체비셰프 지배축 정규화, 0방향 절사 정수 나눗셈(§4.2 7행).
    e.x += Math.trunc((dx * stepU) / chebyshevDist);
    e.y += Math.trunc((dy * stepU) / chebyshevDist);
  }
}

/**
 * (registry 주입 시) 등록순 rect × 삽입순 엔티티 이중 루프로 전이 판정(§5.1) — per-(rect,entity) 지속
 * 상태 없이 prev/now 두 좌표만으로 결정. 전이(밖→안) 검출 시 RectEntered를 sim에 emit(적재순=발화 계약
 * §5.2가 드레인할 순서, INV-D4).
 */
function detectRectEntries(sim: Sim, registry: RectRegistry): void {
  for (const rect of registry.rects) {
    for (const entity of sim.entities.values()) {
      // WC3 시맨틱: 렉트 *내부에 생성*된 유닛도 진입 발화(spawnPending=1 → 직전=밖으로 간주).
      // 스폰 크립의 첫 이동 오더가 이 발화에 의존(실맵: 경로진행 100% EnterRect 구동, 실측 2026-07-13).
      const wasInside = entity.spawnPending === 1 ? false : insideRect(rect, entity.prevX, entity.prevY);
      const isInside = insideRect(rect, entity.x, entity.y);
      if (!wasInside && isInside) {
        sim.emit({ kind: "RectEntered", rectId: rect.rectId, unitId: entity.id });
      }
    }
  }
}

/**
 * sim의 "unitLoop" tick phase에 이동 훅을 등록한다(combat-system.ts installCombat과 동일 배선 패턴).
 * registry는 옵션 — 미주입 시 이동만 처리하고 진입 판정은 건너뛴다(R-207 배선 전 하위호환).
 */
export function installMovement(sim: Sim, registry?: RectRegistry): void {
  sim.registerTickPhase("unitLoop", (s) => {
    s.navigation?.refresh();
    // Like existing damage/speed auras, this slice observes current source proximity.
    // Original AUau exit linger is not established; no invented duration timer here.
    const emitters=[...s.entities.values()].filter(e=>e.alive).flatMap(entity=>
      (s.abilityEffects?.effects(entity.abilities)??[]).filter(effect=>effect.kind==='enemySlowAura').map(effect=>({entity,effect})));
    const auraSlows=new Map<number,number>();
    for(const entity of s.entities.values()){
      const mask=s.defStore?.getDef(entity.typeId).movementType==='fly'?2:1;
      let slow=0;
      for(const source of emitters){
        if(source.entity.owner===entity.owner||s.playerState.getAlliance(source.entity.owner,entity.owner,ALLIANCE_TYPES.ALLIANCE_PASSIVE))continue;
        if(!(source.effect.targetsMask&mask)||(source.entity.x-entity.x)**2+(source.entity.y-entity.y)**2>source.effect.radiusU**2)continue;
        slow=Math.max(slow,source.effect.slowPm);
      }
      auraSlows.set(entity.id,slow);
    }
    for (const entity of s.entities.values()) {
      stepEntity(entity,s.status,s.navigation&&entity.orderActive?s.navigation.waypoint(entity):undefined,auraSlows.get(entity.id)??0,s.gc,s.defStore?.getDef(entity.typeId));
    }
    if (registry) {
      detectRectEntries(s, registry);
    }
    // 생성-내부 진입은 첫 판정에서만(WC3) — 판정 후 소거해 다음 틱부터 전이(밖→안)만 발화(INV-D4 결정론).
    for (const entity of s.entities.values()) {
      if (entity.spawnPending === 1) entity.spawnPending = 0;
    }
  });
}

/** The original native and player intent share the same integer goal/deduplication path. */
export function assignPointMove(entity:UnitEntity,x:number,y:number,countLeg=true):boolean{
 if(!Number.isFinite(x)||!Number.isFinite(y))return false;
 const tx=Math.round(x),ty=Math.round(y);
 if(entity.orderActive===1&&entity.orderX===tx&&entity.orderY===ty)return true;
 entity.orderX=tx;entity.orderY=ty;entity.orderActive=1;if(countLeg)entity.legsCompleted+=1;return true;
}
