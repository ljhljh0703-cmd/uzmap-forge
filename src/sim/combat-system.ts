import {ALLIANCE_TYPES} from './playerstate.ts';
/**
 * R-205 — combat-system: Sim 라이브 틱과 combat-pipe(순수 스텝 함수)를 잇는 배선.
 * 계약 근거: docs/ARCHITECTURE.md §sim tick(combat phase, TICK_PHASES 3번째) ·
 *   src/sim/combat-pipe.ts 헤더(ctx 모양·rng 소비 순서·bounty 정산) · src/sim/sim.ts(entities 레지스트리,
 *   spawnUnit/removeUnit/getUnit).
 * 이 파일은 "누가 누구를 얼마나 때리는가" 로직을 갖지 않는다(그건 combat-pipe.ts 소유) — 매 틱
 * sim.entities를 분류해 combatStep()/mineAttackStep()이 기대하는 ctx 모양으로 조립하고,
 * 결과(hp/cooldown mutation은 entity 참조 공유로 자동 반영, 사망 제거·이벤트 라우팅)를 sim에
 * 되먹임하는 얇은 어댑터다.
 *
 * G-2a(DISPATCH_SONNET_G2_CORE §1) 분류 정밀화: 이전엔 `def.attack` 유무만으로 towers/creeps를 갈랐다 —
 * 크립도 광산을 때리기 위해 `attack`을 갖게 되면서(§크립 공격 시딩) 그 기준이 무너진다(공격 가능한 크립이
 * "타워"로 오분류될 뻔함). 분류축을 `def.meta.role.kind`로 바꾼다:
 *   - role.kind==="tower" 이거나 (role.kind==="static" && attack 보유, 예: lowestGem 4종) → towers[](기존과
 *     동일 동작 — attack 보유 static은 여전히 타워로 취급, 회귀 없음).
 *   - role.kind==="creep" → creeps[](항상, attack 유무 무관 — 타워 파이프의 유효 타깃 풀은 "크립"으로만
 *     한정된다. done-gate "타워는 여전히 크립만 때린다"의 구조적 보장). attack을 가진 creep은 **추가로**
 *     mineAttackers[]에도 편입(광산 공격 소패스 §3.1 참조 — combat-pipe.ts 하단 mineAttackStep).
 *   - role.kind==="static" && role.archetype==="mine" → mines[](크립 공격 소패스의 유일한 유효 타깃 풀).
 *   - 그 외 static(빌더·마커·더미·테스터 등, attack 없음) → 어느 배열에도 편입되지 않는다
 *     (이전엔 creeps[]에 잘못 섞여 타워의 오사격 대상이 될 수 있었던 latent gap — 이번 분류 정밀화의
 *     자연스러운 부수 교정. 별도 필터 로직 추가 없이 3-way 분류만으로 해소됨).
 * 크립→광산 소패스(mineAttackStep)는 타워→크립 파이프(combatStep)와 완전 독립 — 같은 `damageAfterDefense`
 * 재사용, 호출 순서만 고정(§1 "양방향 일반화 금지" — combatStep을 먼저, mineAttackStep을 그 다음에 매 틱
 * 항상 같은 순서로 호출해 rng 소비 순서를 결정론적으로 고정한다).
 *
 * pathProgress/targetsMask 폴백(R-203 이동 시스템 전) — combat-pipe.ts 헤더가 이미 명시한 gap:
 * creep의 pathProgress·targetsMask는 UnitDef 해석 경로(R-202b provider.ts)에 없어 호출측이 주입해야 한다.
 *   - pathProgress = -entity.y : 실제 경로 진행률을 아직 모른다(R-203 정본 예정). y가 작을수록 더
 *     전진했다고 "가정"한 근사치일 뿐 — 좌표계·이동 방향의 실제 의미는 R-203이 확정한다. 결정론에는
 *     영향 없다(순서가 안정적이면 됨) — 게임플레이 의미만 R-203 전엔 근사.
 *   - targetsMask = 3(지상+공중 catch-all) : BandSpec.targetsMask가 provider.ts formulaBlock의 creep
 *     케이스로 전파되지 않는 gap(combat-pipe.ts 헤더 참조). combat-pipe.test.ts 합성 fixture와 동일 관례.
 *
 * TowerState(targetId)는 UnitEntity가 보유하지 않는 유일한 틱간 지속 상태라 이 모듈이 소유한다
 * (installCombat 호출 1회당 Map 1개, 클로저 — 여러 Sim에 각각 installCombat하면 상태도 독립적).
 *
 * 사망 정리: combatStep이 corpse.entity.alive=false로 표시(entity는 sim.entities와 동일 참조라 즉시
 * 반영됨) — 이 모듈은 그 직후 sim.removeUnit()으로 레지스트리에서 제거한다(다음 틱 재획득 로직이 죽은
 * 유닛을 다시 고르지 않도록, units() 스냅샷이 시체를 노출하지 않도록).
 *
 * emit 라우팅: CombatEvent{kind:"UnitDied",unitId,owner,typeId}는 world_api.ts SimEvent의 UnitDied
 * 변형{kind,unitId}보다 필드가 많다(owner/typeId 초과) — SimEvent 계약에 없는 필드는 드롭하는 최소
 * 매핑을 쓴다(combat-pipe.ts 헤더의 "구조적으로만 맞춘다" 설명대로 owner 시맨틱도 다르다: 이벤트의
 * owner=죽은 유닛 자신의 owner이고, ledger 지급 대상 killerOwner는 combat-pipe 내부에서 이미 소비되어
 * 이벤트에는 노출되지 않는다).
 *
 * 의존성: sim 내부 모듈만(sim/combat-pipe/def-store/balance). src/sim/ 순수(INV-D3). Math.random 미사용(INV-D1).
 */
import type { Sim } from "./sim.ts";
import type { SimEvent } from "../world_api.ts";
import type { DefStore } from "./def-store.ts";
import type { GameConstants } from "./balance/config.ts";
import type { GoldLedger } from "./balance/economy.ts";

import { tickStatus,applyStatus,type StatusEffectKey } from "./status.ts";
import {
  combatStep,
  mineAttackStep,
  type TowerCombatant,
  type CreepCombatant,
  type MineAttacker,
  type MineTarget,
  type CombatEvent,
  type BountyMode,
  type TowerState,
} from "./combat-pipe.ts";
import type { UnitEntity } from "./unit-entity.ts";

/** MOVEMENT_LOOP_DESIGN §5.3 — integer, monotonic progress scalar. */
export function pathProgressOf(entity: UnitEntity): number {
  const remaining = entity.orderActive === 1 ? Math.max(Math.abs(entity.orderX - entity.x), Math.abs(entity.orderY - entity.y)) : 0;
  return entity.legsCompleted * 4096 - remaining;
}

export interface InstallCombatOptions {
  readonly defStore: DefStore;
  readonly gc: GameConstants;
  readonly ledger: GoldLedger;
  readonly bountyMode: BountyMode;
  /** §3.5(combat-pipe.ts CombatCtx.minDamage와 동일 시맨틱) — 0|1. */
  readonly minDamage: 0 | 1;
}

/** CombatEvent → SimEvent 최소 매핑(구조 비호환 필드 드롭) — world_api.ts UnitDied는 {kind,unitId}만 계약.
 *  G-1: CombatEvent가 유니온으로 확장(Attacked 추가)되어 kind 분기 필요 — 분기 없이 unitId를 그대로
 *  읽으면 Attacked 이벤트가 {kind:"UnitDied",unitId:undefined}로 오염된다(world_api.ts SimEvent 계약 위반). */
function toSimEvent(event: CombatEvent): SimEvent {
  if (event.kind === "Attacked") {
    return { kind: "Attacked", attackerUnitId: event.attackerUnitId, targetUnitId: event.targetUnitId };
  }
  return { kind: "UnitDied", unitId: event.unitId, killerUnitId: event.killerUnitId };
}

/**
 * sim의 "combat" tick phase에 훅을 등록한다. 훅 본체(매 틱):
 *   1. sim.entities를 alive만 골라 def.attack 유무로 towers/creeps로 분할, TowerState는 towerStates에서 지속 조회.
 *   2. combatStep(ctx) 호출 — hp/cooldownLeft/alive mutation은 entity 참조 공유로 sim에 즉시 반영.
 *   3. combatStep이 표시한 사망(alive=false) 크립을 sim.removeUnit으로 정리.
 * 순수 스텝 함수(combat-pipe.ts)를 라이브 tick에 잇는 유일한 지점 — 전투 로직 자체는 여기 없다.
 */
export function installCombat(sim: Sim, opts: InstallCombatOptions): void {
  const { defStore, gc, ledger, bountyMode, minDamage } = opts;
  /** 타워별 targetId 지속(틱간) — UnitEntity에 없는 값만 보관(combat-pipe.ts TowerState 계약). installCombat 호출당 1개. */
  const towerStates = new Map<number, TowerState>();
  /** G-2a: 광산을 공격하는 크립의 targetId 지속(틱간) — towerStates와 동형, 별도 Map(교차 오염 방지). */
  const mineAttackerStates = new Map<number, TowerState>();
  // G-1: Sim.applyTriggerDamage가 damageAfterDefense 호출에 필요한 GameConstants — installCombat이 이미
  // gc를 받으므로(생성자·별도 배선 불필요) 여기서 sim에 얹는다(defStore와 동일한 "미주입 시 폴백" seam).
  sim.gc = gc;sim.defStore=defStore;sim.bountyMode=bountyMode;

  sim.registerTickPhase("combat", (s) => {
    const towers: TowerCombatant[] = [];
    const abilitySources:Array<Pick<TowerCombatant,"entity"|"def">>=[];
    const creeps: CreepCombatant[] = [];
    const mineAttackers: MineAttacker[] = [];
    const mines: MineTarget[] = [];

    for (const entity of s.entities.values()) {
      if (!entity.alive) continue;
      const def = defStore.getDef(entity.typeId);
      const role = def.meta.role;
      abilitySources.push({entity,def});

      // P6 correction: the old static classification accidentally made event bosses untargetable.
      // Actual race input leaves h04Q circling at full HP in round 25; the original has a death trigger
      // for it. Reuse the existing target/damage/death pipeline, preserving its configured 150000 HP.
      const eventBoss = role.kind === "static" && role.archetype === "eventBoss";
      if ((def.attack||def.secondaryAttack) && role.kind !== "creep" && !eventBoss) {
        // 타워(role.kind==="tower") 또는 attack 보유 static(lowestGem 4종 등, role.kind==="static") — 기존과 동일.
        let state = towerStates.get(entity.id);
        if (!state) {
          state = { targetId: null };
          towerStates.set(entity.id, state);
        }
        towers.push({ entity, def, state });
        continue;
      }

      if (role.kind === "creep" || eventBoss) {
        // P6: event bosses join this pool too; builders and markers remain excluded. G-2a: 타워 파이프의 유효 타깃 풀 = "크립"으로만 한정(attack 유무 무관 — done-gate ①).
        creeps.push({
          entity,
          def,
          pathProgress: pathProgressOf(entity),
          targetsMask: def.movementType ? (def.movementType==="fly"?2:1) : 3, // caller-local source movement identity; legacy unknown remains explicit
        });
        if (def.attack||def.secondaryAttack) {
          // G-2a: 광산을 때릴 수 있는 크립 — 별도 소패스에도 편입(A-G5: 광산 외 비공격, mines[]로만 필터링).
          let state = mineAttackerStates.get(entity.id);
          if (!state) {
            state = { targetId: null };
            mineAttackerStates.set(entity.id, state);
          }
          mineAttackers.push({ entity, def, state });
        }
        continue;
      }

      if (role.kind === "static" && role.archetype === "mine") {
        mines.push({ entity, def });
      }
      // 그 외 static(attack 없음, mine도 아님) — 어느 배열에도 편입하지 않음(파일 헤더 참조).
    }

    // Permanent fire is an ability-owned source, including gems whose normal attack is disabled.
    const activeBurns=new Map<number,Set<StatusEffectKey>>();
    for(const source of s.entities.values()){
      if(!source.alive||creeps.some(c=>c.entity.id===source.id))continue;
      for(const effect of s.abilityEffects?.effects(source.abilities)??[])if(effect.kind==='immolation'){
        const key:StatusEffectKey=`burn:${source.id}`;
        for(const target of creeps){if(!target.entity.alive||target.entity.invulnerable||target.entity.owner===source.owner||!(target.targetsMask&effect.targetsMask))continue;
          if((source.x-target.entity.x)**2+(source.y-target.entity.y)**2>effect.radiusU**2)continue;
          let keys=activeBurns.get(target.entity.id);if(!keys){keys=new Set();activeBurns.set(target.entity.id,keys);}keys.add(key);
          applyStatus(s.status,target.entity.id,{kind:'dot',perTick:0,pulseIntervalTicks:effect.intervalTicks,pulseTicksLeft:effect.intervalTicks,pulseDamagePm:effect.pulseDamagePm,remainder:0,remainingTicks:2,sourceUnitId:source.id,sourceOwner:source.owner},key);
        }
      }
    }
    for(const [id,effects] of s.status){for(const key of effects.keys())if(key.startsWith('burn:')&&!activeBurns.get(id)?.has(key))effects.delete(key);if(!effects.size)s.status.delete(id);}
    combatStep({
      towers,
      creeps,
      rng: s.rng,
      gc,
      ledger,
      bountyMode,
      minDamage,
      emit: (event: CombatEvent) => s.emit(toSimEvent(event)),
      abilityEffects:s.abilityEffects,abilitySources,
      areAllied:(a,b)=>s.playerState.getAlliance(a,b,ALLIANCE_TYPES.ALLIANCE_PASSIVE),
      settleDeath:(unitId,killerUnitId,killerOwner)=>s.settleUnitDeath(unitId,killerUnitId,killerOwner),
      status: s.status, // G-5: stun 발사 스킵 조회(combat-pipe.ts CombatCtx.status).
    });

    // G-2a: combatStep 다음에 항상 고정 순서로 호출(§1 — rng 소비 순서 결정론).
    mineAttackStep({
      attackers: mineAttackers,
      abilityEffects:s.abilityEffects,abilitySources,
      areAllied:(a,b)=>s.playerState.getAlliance(a,b,ALLIANCE_TYPES.ALLIANCE_PASSIVE),
      mines,
      rng: s.rng,
      gc,
      minDamage,
      emit: (event: CombatEvent) => s.emit(toSimEvent(event)),
      status: s.status, // G-5: 광산 공격 크립의 stun 발사 스킵도 동일 저장소 조회.
    });

    // G-5(GEM_IDENTITY_MINE_DESIGN §5.4) — dot 틱 처리. tickStatus(status.ts, 격리 순수 함수)는 hp만
    // 차감하고 사망 전이 목록을 반환한다 — 사망 "정산"(emit·bounty·제거)은 combatStep/mineAttackStep과
    // 동일한 기존 패턴(emit 계약 재사용 + rollBounty 재사용)을 이 자리에서 수행한다(§1 "신규 사망 정산
    // 경로 금지" — 새 정산 메커니즘을 발명하지 않고 이미 두 파이프가 각각 갖고 있는 동일한 로컬
    // push→settled-set 정산 관례를 세 번째로 재사용할 뿐). killerUnitId는 v1 부여 경로(슬레이트 장착)가
    // DEFERRED라 "누가 이 dot을 걸었는가"를 아직 추적하지 않으므로 생략한다(RETURN.md 인수인계 참조).
    const dotSources=new Map<number,number|undefined>(),dotOwners=new Map<number,number|undefined>();
    const dotDeaths = tickStatus(s.status, s.entities,(entity,effect)=>{if(effect.kind==='dot'){dotSources.set(entity.id,effect.sourceUnitId);dotOwners.set(entity.id,effect.sourceOwner);}});
    for(const entity of dotDeaths)s.settleUnitDeath(entity.id,dotSources.get(entity.id),dotOwners.get(entity.id));

    for (const creep of creeps) {
      if (!creep.entity.alive) s.removeUnit(creep.entity.id);
    }
    for (const mine of mines) {
      if (!mine.entity.alive) s.removeUnit(mine.entity.id);
    }
  });
}
