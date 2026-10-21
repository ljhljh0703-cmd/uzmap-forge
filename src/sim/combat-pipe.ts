/**
 * R-204 — 전투 파이프: 획득→쿨다운→발사→대미지→사망→현상금의 단일 수렴 파이프(설계 §3).
 * 계약: docs/COMBAT_PROGRESSION_DESIGN.md §3.1(공격 사이클 4단계·사거리 이원화·정수 제곱거리)
 *       §3.2(rng 소비 2지점·순서) §3.3(사망→현상금 파이프) §3.4(비율식 확정) §3.5(minDamage)
 *       §4.5(bountyMode 3값) §8.1(S1/S2/S3 done-gate) §8.4(R-203 경계).
 * 대미지 산출은 balance/combat.ts의 damageAfterDefense만 소비한다(자체 공식 금지, §3.4) — typed(배율 적용값)는
 * typeBonusPm+mulPm(둘 다 combat.ts/fixed.ts 기존 export)로 별도 계산해 §3.5의 typedPositive(면역 판정)에만 쓴다.
 * rng 소비: ①공격 roll(발사 시, 타워 unitId asc 순회 순서) ②현상금 roll(틱 말 deathQueue push순, engine/both 지급 시만
 *   — §4.5 "엔진은 값만 산출·미지급"은 base/spreadPm 곡선이 항상 engine 소유라는 뜻으로 읽었고, script 모드에선
 *   실제 rng 굴림·지급 자체를 하지 않는다: 설계 §3.3 pseudocode의 "지급 시:" 들여쓰기가 roll+지급을 한 단위로 묶음).
 * 결정론: 타워 순회는 매 스텝 unitId asc로 정렬(호출측 배열 순서에 의존하지 않음). 사망 정산은 push순 + 처리완료
 *   Set으로 오버킬 중복 지급을 막는다(동일 크립을 같은 틱에 여러 타워가 hp≤0으로 만들 수 있음 — 최초로 push된
 *   항목만 정산되므로 unitId 낮은 타워가 처리순상 우선하고 그 owner가 killer로 귀속된다. §3.3 "오버킬 텔레메트리").
 *
 * ctx 모양 확정(설계 §8.1 제안 {towers:[{entity,def,state:{targetId,cooldownLeft}}],...}과 한 가지 다른 점) —
 * cooldownLeft는 상태를 이중 보관하지 않고 UnitEntity.cooldownLeft(이미 존재하는 필드)를 그대로 권위로 쓴다.
 * TowerState는 UnitEntity에 없는 targetId만 보유한다. creep의 pathProgress·targetsMask도 현재 UnitDef 해석
 * 경로(R-202b provider.ts)에 없는 값이라(§8.4 경계 + provider.ts formulaBlock의 creep 케이스가 BandSpec.targetsMask를
 * UnitDefDefaults로 전파하지 않는 gap — armorType은 전파되나 targetsMask는 안 됨) 호출측이 CreepCombatant에 직접 주입한다.
 *
 * bounty 수령자(killerOwner) = 사망을 유발한 타워의 owner(entity.owner) — 죽은 크립 자신의 owner가 아니다.
 * (§3.3/task 원문의 "gold[owner]"가 어느 owner인지 명문화가 안 돼 있어 이렇게 확정: 크립은 통상 hostile/neutral
 * 소유라 그쪽에 보상을 적립하는 건 무의미하고, GoldLedger가 플레이어별 잔고인 이유 자체가 킬 크레딧 귀속이다.)
 * UnitDied 이벤트의 owner는 반대로 "죽은 유닛 자신의 owner"(WC3 트리거 관례 GetOwningPlayer(GetTriggerUnit())과 동일
 * 시맨틱, world_api.ts SimEvent의 {kind:"UnitDied",unitId}와 kind/unitId 필드 호환 — 이 파일은 SimEvent를 import하지
 * 않고 구조적으로만 맞춘다, 스코프 밖 결합 회피).
 *
 * 의존성: sim 내부 모듈만(unit-entity/def-store/rng/balance/*). src/sim/ 순수(INV-D3). Math.random 미사용(INV-D1).
 */
import type { FourCC } from "../ir/types.ts";
import type { UnitEntity } from "./unit-entity.ts";
import type { UnitDef } from "./def-store.ts";
import type { Rng } from "./rng.ts";
import type { GameConstants } from "./balance/config.ts";
import {effectiveArmorValue,applyAttackArmorReduction} from "./ability-effects.ts";
import {applyStatus} from "./status.ts";
import { damageAfterDefense, typeBonusPm } from "./balance/combat.ts";
import { mulPm } from "./balance/fixed.ts";
import { rollBounty, type GoldLedger } from "./balance/economy.ts";
import { isStunned, type StatusStore } from "./status.ts";

/**
 * 정수 제곱거리(dx²+dy², √ 없음). R-203(이동/경로)이 정본을 소유할 예정(§8.4 경계) — 지금은 로컬 최소구현.
 */
export function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** 타워(공격 유닛)의 타깃팅 상태 — UnitEntity에 없는 targetId만 보유(cooldownLeft는 entity 필드가 권위). */
export interface TowerState {
  targetId: number | null;
}

export interface TowerCombatant {
  readonly entity: UnitEntity;
  readonly def: UnitDef;
  readonly state: TowerState;
}

/**
 * 피격 유닛(크립) 결합체 — pathProgress·targetsMask는 호출측이 주입(위 파일 헤더 설명).
 *   pathProgress: R-203 정본 예정 이전까지의 대체값(예: 경로 진행률 또는 y 좌표) — 타깃 우선순위(§3.1)에만 쓰인다.
 *   targetsMask: 원본 BandSpec.targetsMask(밴드 상수: flying→air 이동/피격 플래그, BALANCE_ENGINE_DESIGN §4.1)와
 *     동일 비트마스크 시맨틱 — attacker.targetsMask & creep.targetsMask !== 0 이면 유효 타깃.
 */
export interface CreepCombatant {
  readonly entity: UnitEntity;
  readonly def: UnitDef;
  readonly pathProgress: number;
  readonly targetsMask: number;
}

/** AD-3(config.ts GameBalanceConfig.bountyMode와 동일 시맨틱, §4.5) — 현상금 지급 주체. */
export type BountyMode = "engine" | "script" | "both" | "source";

/** 사망 이벤트(§3.3 step3) — owner는 죽은 유닛(크립) 자신의 owner(위 파일 헤더 참조, bounty 수령자와 다름). */
export type CombatEvent =
  | {
      kind: "UnitDied";
      unitId: number;
      owner: number;
      typeId: FourCC;
      /** 처치 타워의 entity.id — GetKillingUnit() 배선용(실맵 바운티 트리거가 소비). 오버킬은 최초 처리 타워 귀속(§3.3). */
      killerUnitId: number;
    }
  /**
   * G-1(GEM_IDENTITY_MINE_DESIGN §5.1) — 발사 성공 시마다 발화(사망 여부 무관, WC3 ATTACKED 시맨틱과
   * 동일: 명중 즉시 발화하고 그 다음에 사망 판정). 실맵 트리거뎀 9사이트(UnitDamageTargetBJ)·hJ 광산
   * 릴레이가 이 이벤트를 구독해야 재현된다(엔진 대미지와는 완전히 별개 채널 — 재구현 0, 배선만).
   */
  | { kind: "Attacked"; attackerUnitId: number; targetUnitId: number };

export interface CombatCtx {
  readonly settleDeath?:(unitId:number,killerUnitId:number,killerOwner:number)=>void;
  readonly abilitySources?:ReadonlyArray<Pick<TowerCombatant,"entity"|"def">>;
  readonly abilityEffects?:import("./ability-effects.ts").CombatAbilityCatalog;
  readonly areAllied?:(sourceOwner:number,targetOwner:number)=>boolean;
  readonly towers: ReadonlyArray<TowerCombatant>;
  readonly creeps: ReadonlyArray<CreepCombatant>;
  readonly rng: Rng;
  readonly gc: GameConstants;
  readonly ledger: GoldLedger;
  readonly bountyMode: BountyMode;
  /** §3.5 — 0|1. GameConstants엔 아직 필드가 없어(config.ts 스코프 밖) ctx 독립 필드로 주입한다. */
  readonly minDamage: 0 | 1;
  readonly emit: (event: CombatEvent) => void;
  /** G-5(GEM_IDENTITY_MINE_DESIGN §5.4) — stun 발사 스킵 조회(부재 = 기존 전원 무회귀). ctx 독립 필드
   *  주입(§8.1 관례 그대로 — combatStep 시그니처 자체는 무변경, ctx 모양만 additive 확장). */
  readonly status?: StatusStore;
}

/**
 * §3.5 최소대미지 — minDamage==1 && typedPositive && dealt<1 이면 1. 면역(typedPositive=false)은 min-dmg가
 * 뚫지 않는다(배율 0 상성은 0 유지). dealt는 damageAfterDefense가 이미 0 이상 정수로 반환하므로 추가 클램프 불요.
 */
export function applyMinDamage(dealt: number, typedPositive: boolean, minDamage: 0 | 1): number {
  if (minDamage === 1 && typedPositive && dealt < 1) return 1;
  return dealt;
}

/**
 * G-4(GEM_IDENTITY_MINE_DESIGN §5.3) — 위치 at 기준 반경 내 attackSpeed 오라의 "최고 1개만"(비중첩,
 * WC3 동종 오라 비중첩 관례 — 커뮤니티 문서화, §2 G-4 done-gate②) bonusPm을 반환한다. 합산 금지.
 * towers는 호출측이 넘긴 삽입순 배열 그대로(§2 G-4 "오라 탐색 = 타워 삽입순") — orderedTowers(id asc,
 * rng 결정론 정렬)와는 별개 순회축이다(순서가 결과값에 영향 없음 — 최고값 선택은 순서 불변, 그래도
 * 명세를 문자 그대로 지키기 위해 삽입순 배열을 순회한다). 자기 자신의 오라도 포함(WC3 아우라는 통상
 * 시전 유닛 자신도 적용받는다 — dist2(self,self)=0이 항상 반경 이내이므로 자연히 포함됨).
 */
function bestAttackSpeedAuraBonusPm(towers: ReadonlyArray<Pick<TowerCombatant,"entity"|"def">>, at: UnitEntity, catalog?:CombatCtx["abilityEffects"]): number {
  let best = 0;
  for (const t of towers) {
    if (!t.entity.alive) continue;
    const sourceEffects=catalog?.effects(t.entity.abilities)??[];
    const resolved=sourceEffects.filter(e=>e.kind==='speedAura');
    if(resolved.length){for(const e of resolved)if((e.selfOnly?t.entity.id===at.id:t.entity.owner===at.owner)&&dist2(at,t.entity)<=e.radiusU**2)best=Math.max(best,e.bonusPm);continue;}
    const aura = t.def.aura;
    if (!aura || aura.kind !== "attackSpeed") continue;
    if (dist2(at, t.entity) > aura.radiusU * aura.radiusU) continue;
    if (aura.bonusPm > best) best = aura.bonusPm;
  }
  return best;
}

/** 유효 타깃 판정(§3.1 step1/2 공용) — 생존 + targetsMask 교집합 + keepRange(=acquireRange, A-C2) 이내. */
function isValidTarget(from: { x: number; y: number }, attackerMask: number, acquireU: number, creep: CreepCombatant): boolean {
  if (!creep.entity.alive || creep.entity.invulnerable) return false;
  if ((attackerMask & creep.targetsMask) === 0) return false;
  return dist2(from, creep.entity) <= acquireU * acquireU;
}

/**
 * 한 틱 전투 처리(§3.1~§3.3). towers는 매 호출 시 unitId asc로 정렬해 순회(rng 소비 순서 결정성의 전제, §3.2).
 * 타워별: 1유효성→2획득→3쿨다운→4발사(rng①). 틱 말: deathQueue push순으로 사망 정산(bounty(rng②)→event→제거).
 * 순수 스텝 함수 — Sim.registerTickPhase 라이브 배선은 스코프 밖(§8.4 인접 경계, 이번 슬라이스는 테스트용 호출만).
 */
export function combatStep(ctx: CombatCtx): void {
  const { towers, creeps, rng, gc, ledger, bountyMode, minDamage, emit, status,abilityEffects } = ctx;

  const armorSources=(ctx.abilitySources??towers).map(source=>source.entity);
  const armorFor=(creep:CreepCombatant)=>effectiveArmorValue(creep.def.armorValue,creep.entity.abilities,abilityEffects,{target:creep.entity,targetMask:creep.targetsMask,sources:armorSources,areAllied:ctx.areAllied,status});

  const creepById = new Map<number, CreepCombatant>();
  for (const c of creeps) creepById.set(c.entity.id, c);

  const orderedTowers = [...towers].sort((a, b) => a.entity.id - b.entity.id);
  const deathQueue: Array<{ creep: CreepCombatant; killerOwner: number; killerUnitId: number }> = [];

  for (const tower of orderedTowers) {
    if (!tower.entity.alive || tower.entity.paused) continue;
    const weapons=[tower.def.attack,tower.def.secondaryAttack].filter((a):a is NonNullable<typeof a>=>Boolean(a));
    if(!weapons.length)continue;
    const weaponFor=(c:CreepCombatant,forced=false)=>{
      // Automatic acquisition/retention follows the existing alliance state. Explicit
      // attack orders keep their separate, existing permission and range policy.
      if(!forced&&(c.entity.owner===tower.entity.owner||ctx.areAllied?.(tower.entity.owner,c.entity.owner)))return undefined;
      return weapons.find(a=>isValidTarget(tower.entity,a.targetsMask,forced?a.rangeU:Math.min(a.rangeU,tower.entity.acquireRangeU??a.acquireU),c));
    };
    let targetId=tower.state.targetId;
    if(tower.entity.attackTargetId!==undefined){
      const forced=creepById.get(tower.entity.attackTargetId);
      if(!forced?.entity.alive||forced.entity.owner===tower.entity.owner)delete tower.entity.attackTargetId;
      else if(weaponFor(forced,true))targetId=forced.entity.id;
      else{if(tower.entity.cooldownLeft>0)tower.entity.cooldownLeft--;continue;}
    }
    if(targetId!==null){const cur=creepById.get(targetId);if(!cur||!weaponFor(cur,targetId===tower.entity.attackTargetId))targetId=null;}
    if(targetId===null){let best:CreepCombatant|null=null;
      for(const c of creeps){if(!weaponFor(c))continue;
        if(best===null||c.pathProgress>best.pathProgress||c.pathProgress===best.pathProgress&&c.entity.id<best.entity.id)best=c;
      }targetId=best?.entity.id??null;
    }
    tower.state.targetId=targetId;
    // 3 쿨다운
    if (tower.entity.cooldownLeft > 0) {
      tower.entity.cooldownLeft -= 1;
      continue;
    }

    // 4 발사
    if (targetId === null || tower.entity.upgrading) continue;
    // G-5(GEM_IDENTITY_MINE_DESIGN §5.4) — stun은 발사도 스킵한다(이동 스킵은 movement.ts 소비 지점 —
    // done-gate "이동만 막으면 미완"). status 미주입(undefined) 시 기존 전원 무회귀.
    if (status && isStunned(status, tower.entity.id)) continue;
    const target = creepById.get(targetId)!;
    const attack=weaponFor(target,targetId===tower.entity.attackTargetId)!;
    const acquireU=Math.min(attack.rangeU,tower.entity.acquireRangeU??attack.acquireU);
    let roll = attack.dmgBase + rng.int(0, attack.dmgSpread); // existing base RNG
    const effects=abilityEffects?.effects(tower.entity.abilities)??[];let criticalPm=1000,criticalTriggered=false;
    for(const effect of effects)if(effect.kind==='critical'&&effect.chancePm>0&&(effect.chancePm===1000||rng.int(1,1000)<=effect.chancePm)){criticalTriggered=true;criticalPm=Math.max(criticalPm,effect.multiplierPm);}
    let damageBonusPm=0,damageFlat=0;
    for(const source of ctx.abilitySources??towers)if(source.entity.alive)for(const effect of abilityEffects?.effects(source.entity.abilities)??[])if(effect.kind==='damageAura'&&(effect.selfOnly?source.entity.id===tower.entity.id:source.entity.owner===tower.entity.owner)&&dist2(source.entity,tower.entity)<=effect.radiusU**2){damageBonusPm=Math.max(damageBonusPm,effect.bonusPm);damageFlat=Math.max(damageFlat,effect.flatBonus);}
    roll=mulPm(Math.max(0,mulPm(roll,1000+damageBonusPm)+damageFlat),criticalPm);
    applyAttackArmorReduction(status,target.entity.id,target.targetsMask,effects);
    const typed = mulPm(roll, typeBonusPm(gc, attack.attackType, target.def.armorType));
    const dealt = damageAfterDefense(roll, attack.attackType, target.def.armorType, armorFor(target), gc);
    const final = applyMinDamage(dealt, typed > 0, minDamage);
    target.entity.hp -= final;
    if(status&&target.entity.hp>0)for(const effect of effects)if(effect.kind==='poison'&&effect.durationTicks>0&&((effect.targetsMask??3)&target.targetsMask)){
      applyStatus(status,target.entity.id,{kind:'dot',perTick:0,perSecondPm:effect.damagePerSecondPm,remainder:0,remainingTicks:effect.durationTicks,sourceUnitId:tower.entity.id,sourceOwner:tower.entity.owner});
      if(effect.slowPm>0)applyStatus(status,target.entity.id,{kind:'slow',magnitudePm:effect.slowPm,remainingTicks:effect.durationTicks});
    }
    if(status&&target.entity.hp>0)for(const effect of effects)if(effect.kind==='frost'&&effect.durationTicks>0&&(effect.targetsMask&target.targetsMask))applyStatus(status,target.entity.id,{kind:'slow',magnitudePm:effect.slowPm,remainingTicks:effect.durationTicks},'frost');
    // Aroc secondary missiles use this attack roll, not Efk1; a critical proc suppresses them.
    // Same existing defense/death/bounty pipeline; no extra ATTACKED event for secondary missiles.
    if(!criticalTriggered)for(const effect of effects)if(effect.kind==='barrage'){
      let left=effect.extraTargets;
      for(const other of creeps){
        if(left<=0)break;
        if(other.entity.id===target.entity.id||other.entity.owner===tower.entity.owner||!isValidTarget(tower.entity,attack.targetsMask&effect.targetsMask,Math.min(acquireU,effect.radiusU),other))continue;
        left--;
        const typedExtra=mulPm(roll,typeBonusPm(gc,attack.attackType,other.def.armorType));
        other.entity.hp-=applyMinDamage(damageAfterDefense(roll,attack.attackType,other.def.armorType,armorFor(other),gc),typedExtra>0,minDamage);
        if(other.entity.hp<=0)deathQueue.push({creep:other,killerOwner:tower.entity.owner,killerUnitId:tower.entity.id});
      }
    }
    // G-4(GEM_IDENTITY_MINE_DESIGN §5.3) — 유효 쿨다운 = cooldownTicks×1000/(1000+반경내 최고 오라
    // bonusPm), 정수 floor(§2 G-4 done-gate① 예시: cd20+250pm → 20*1000/1250=16). 매 발사 시점 재조회
    // (캐시 금지 — 결정론 단순성) — aura가 전혀 없는 환경은 auraBonusPm=0이라 기존과 완전 동일(무회귀).
    const auraBonusPm = bestAttackSpeedAuraBonusPm(ctx.abilitySources??towers, tower.entity,abilityEffects);
    tower.entity.cooldownLeft = Math.floor((attack.cooldownTicks * 1000) / (1000 + auraBonusPm));
    // G-1: ATTACKED — 명중할 때마다(사망과 독립) 발화. 실맵 트리거뎀 9사이트·hJ 광산 릴레이의 진입점.
    emit({ kind: "Attacked", attackerUnitId: tower.entity.id, targetUnitId: target.entity.id });
    if (target.entity.hp <= 0) {
      deathQueue.push({ creep: target, killerOwner: tower.entity.owner, killerUnitId: tower.entity.id });
    }

    // G-3(GEM_IDENTITY_MINE_DESIGN §5.2) — 스플래시: 주 타깃 100% 처리 후 반경 내 다른 크립에 배율 적용.
    // 배율 구간 full=1000‰/half=500‰/quarter=250‰은 WC3 커뮤니티 문서화 스플래시 관례(원장에 없는
    // 범용 상수 — 출처 명시, §3③ "발명 금지"의 예외인 공개 커뮤니티 규약). roll은 주 타깃과 동일 굴림을
    // 재사용(신규 rng 소비 0, §3④) — 대상별로는 damageAfterDefense를 독립 적용(재구현 금지 준수, 대상마다
    // armorType/armorValue가 다를 수 있어 배율만 미리 곱한 roll을 그대로 통과시킨다). 순회는 creeps
    // 삽입순(INV-D4) — 다중 사망은 기존 deathQueue push순 정산에 그대로 합류(신규 정산 경로 금지).
    if (attack.splash) {
      const { fullU, halfU, quarterU } = attack.splash;
      for (const other of creeps) {
        if (other.entity.id === target.entity.id) continue;
        if (!other.entity.alive || other.entity.invulnerable || !((attack.splash.targetsMask??3)&other.targetsMask)) continue;
        const d2 = dist2(target.entity, other.entity);
        let splashPm: number | null = null;
        if (d2 <= fullU * fullU) splashPm = 1000;
        else if (d2 <= halfU * halfU) splashPm = 500;
        else if (d2 <= quarterU * quarterU) splashPm = 250;
        if (splashPm === null) continue;
        const splashRoll = mulPm(roll, splashPm);
        const splashTyped = mulPm(splashRoll, typeBonusPm(gc, attack.attackType, other.def.armorType));
        const splashDealt = damageAfterDefense(splashRoll, attack.attackType, other.def.armorType, armorFor(other), gc);
        const splashFinal = applyMinDamage(splashDealt, splashTyped > 0, minDamage);
        other.entity.hp -= splashFinal;
        if(status&&other.entity.hp>0)for(const effect of effects)if(effect.kind==='frost'&&effect.durationTicks>0&&(effect.targetsMask&other.targetsMask))applyStatus(status,other.entity.id,{kind:'slow',magnitudePm:effect.slowPm,remainingTicks:effect.durationTicks},'frost');
        if (other.entity.hp <= 0) {
          deathQueue.push({ creep: other, killerOwner: tower.entity.owner, killerUnitId: tower.entity.id });
        }
      }
    }
  }

  // 틱 말 사망 정산(§3.3, push순 = 처리순)
  const settled = new Set<number>();
  for (const { creep: corpse, killerOwner, killerUnitId } of deathQueue) {
    if (settled.has(corpse.entity.id)) continue; // 이미 처리된 시체 skip — 오버킬 중복 지급 방어
    settled.add(corpse.entity.id);

    if(ctx.settleDeath){ctx.settleDeath(corpse.entity.id,killerUnitId,killerOwner);continue;}
    if (bountyMode === "engine" || bountyMode === "both") {
      const paid = rollBounty(rng, corpse.def.bounty.base, corpse.def.bounty.spreadPm); // rng 지점②
      ledger.adjustGold(killerOwner, paid, "bounty");
    }
    emit({ kind: "UnitDied", unitId: corpse.entity.id, owner: corpse.entity.owner, typeId: corpse.entity.typeId, killerUnitId });
    corpse.entity.alive = false;
  }
}

// ── G-2a(GEM_IDENTITY_MINE_DESIGN §2.1/§3.1, DISPATCH_SONNET_G2_CORE §1) ────────────────────────
// 크립→광산 전용 좁은 패스. 기존 타워→크립 combatStep(위)은 시맨틱·시그니처 무변경으로 보존한다(디스패치
// §1의 명시적 지침 — "양방향 일반화 금지", combat-pipe 재설계가 아니라 별도 소패스 추가). A-G5(크립은
// 광산 외 비공격)를 구조적으로 강제하기 위해 타깃 풀 자체를 "광산(mine archetype)"으로만 한정한다
// (AD-G1 — targetsMask 비트마스크와는 다른 축이므로 여기선 아예 별도 배열로 분리, targetsMask 의미 오염 0).
// damageAfterDefense·applyMinDamage·dist2는 위 combatStep과 동일하게 재사용(재구현 0).

/** 광산을 공격하는 크립(attack 보유) — TowerState를 그대로 재사용(타깃 지속 상태 모양이 동일하므로 신규 타입 불요). */
export interface MineAttacker {
  readonly entity: UnitEntity;
  readonly def: UnitDef; // 호출측이 def.attack != null인 것만 골라 넘긴다(방어적으로 여기서도 재확인).
  readonly state: TowerState;
}

/** 광산(광산 archetype 정적 유닛) — 크립 공격 패스의 유일한 유효 타깃 풀. */
export interface MineTarget {
  readonly entity: UnitEntity;
  readonly def: UnitDef;
}

export interface MineAttackCtx {
  readonly abilityEffects?: CombatCtx["abilityEffects"];
  readonly abilitySources?:CombatCtx['abilitySources'];
  readonly areAllied?:CombatCtx['areAllied'];
  readonly attackers: ReadonlyArray<MineAttacker>;
  readonly mines: ReadonlyArray<MineTarget>;
  readonly rng: Rng;
  readonly gc: GameConstants;
  readonly minDamage: 0 | 1;
  readonly emit: (event: CombatEvent) => void;
  /** G-5 — combatStep의 CombatCtx.status와 동일 시맨틱(stun 발사 스킵). 부재 = 기존 전원 무회귀. */
  readonly status?: StatusStore;
}

/**
 * 크립→광산 전용 소패스(§1). combatStep과 완전 독립 실행(호출 순서는 combat-system.ts가 고정 — 결정론
 * 재현을 위해 매 틱 항상 동일 순서로 호출돼야 한다, §3.2 rng 소비 순서 규율과 동일 정신).
 * 광산 타깃팅은 pathProgress 개념이 없어(광산은 정적) 최근접 우선(동점 시 unitId asc)으로 정한다 — 이는
 * 원장에 없는 자체 결정(디스패치가 명시 요구한 사항은 아니나, 게이트 배치상 플레이어당 사거리 내 광산은
 * 보통 1기뿐이라 실질적 모호성은 없음. 결정론만 고정하면 충분).
 */
export function mineAttackStep(ctx: MineAttackCtx): void {
  const { attackers, mines, rng, gc, minDamage, emit, status } = ctx;
  const armorSources=(ctx.abilitySources??[]).map(source=>source.entity);

  const mineById = new Map<number, MineTarget>();
  for (const m of mines) mineById.set(m.entity.id, m);

  const orderedAttackers = [...attackers].sort((a, b) => a.entity.id - b.entity.id);
  const deathQueue: Array<{ mine: MineTarget; killerUnitId: number }> = [];

  const isValidMine = (from: { x: number; y: number }, acquireU: number, mine: MineTarget): boolean =>
    !mine.entity.invulnerable && mine.entity.alive && dist2(from, mine.entity) <= acquireU * acquireU;

  for (const attacker of orderedAttackers) {
    if (!attacker.entity.alive || attacker.entity.paused) continue;
    const attack = [attacker.def.attack,attacker.def.secondaryAttack].find(a=>a&&(a.targetsMask&1));
    if (!attack) continue; // 방어적 — 호출측이 attack 보유만 넘기는 것이 계약이나 재확인

    // 1 유효성
    let targetId = attacker.state.targetId;
    if (targetId !== null) {
      const cur = mineById.get(targetId);
      if (!cur || !isValidMine(attacker.entity, attack.acquireU, cur)) targetId = null;
    }

    // 2 획득 — 최근접 우선(동점 unitId asc, strict) — mines 배열은 archetype 필터만으로 이미 좁혀져 있음.
    if (targetId === null) {
      let best: MineTarget | null = null;
      let bestDist = Infinity;
      for (const m of mines) {
        if (!isValidMine(attacker.entity, attack.acquireU, m)) continue;
        const d = dist2(attacker.entity, m.entity);
        if (best === null || d < bestDist || (d === bestDist && m.entity.id < best.entity.id)) {
          best = m;
          bestDist = d;
        }
      }
      targetId = best ? best.entity.id : null;
    }
    attacker.state.targetId = targetId;

    // 3 쿨다운
    if (attacker.entity.cooldownLeft > 0) {
      attacker.entity.cooldownLeft -= 1;
      continue;
    }

    // 4 발사
    if (targetId === null) continue;
    // G-5: stun은 광산 공격 발사도 스킵(combatStep과 동일 규율).
    if (status && isStunned(status, attacker.entity.id)) continue;
    const mine = mineById.get(targetId)!;
    const roll = attack.dmgBase + rng.int(0, attack.dmgSpread); // rng 소비(combatStep과 동일 규율 — 타워 처리 뒤에 옴, combat-system.ts 고정 순서)
    applyAttackArmorReduction(status,mine.entity.id,1,ctx.abilityEffects?.effects(attacker.entity.abilities)??[]);
    const typed = mulPm(roll, typeBonusPm(gc, attack.attackType, mine.def.armorType));
    const dealt = damageAfterDefense(roll, attack.attackType, mine.def.armorType, effectiveArmorValue(mine.def.armorValue,mine.entity.abilities,ctx.abilityEffects,{target:mine.entity,targetMask:1,sources:armorSources,areAllied:ctx.areAllied,status}), gc);
    const final = applyMinDamage(dealt, typed > 0, minDamage);
    mine.entity.hp -= final;
    attacker.entity.cooldownLeft = attack.cooldownTicks;
    emit({ kind: "Attacked", attackerUnitId: attacker.entity.id, targetUnitId: mine.entity.id });
    if (mine.entity.hp <= 0) deathQueue.push({ mine, killerUnitId: attacker.entity.id });
  }

  // 틱 말 사망 정산 — bounty 없음(광산은 크립이 아니다·현상금 대상 아님, 패배 판정도 스크립트 소유 — §3.1 step5).
  const settled = new Set<number>();
  for (const { mine, killerUnitId } of deathQueue) {
    if (settled.has(mine.entity.id)) continue;
    settled.add(mine.entity.id);
    emit({ kind: "UnitDied", unitId: mine.entity.id, owner: mine.entity.owner, typeId: mine.entity.typeId, killerUnitId });
    mine.entity.alive = false;
  }
}
