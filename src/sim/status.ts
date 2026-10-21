/**
 * G-5 — 상태효과 3종(GEM_IDENTITY_MINE_DESIGN §5.4, DISPATCH_SONNET_G3_G6 §1/§2 G-5).
 * 격리 신설 파일(§1 "sim/status.ts 신설로 격리, 소비 지점만 최소 훅") — combat-pipe.ts/combat-system.ts와
 * 의도적으로 분리한다. 초기 3종(slow/stun/dot)에 P25의 타격 방어 감소만 추가한다. 별도 버프 프레임워크는 만들지 않는다.
 *
 * 저장 모양: 엔티티id → (key → StatusEffect) 2단 Map, 전부 정수, 둘 다 삽입순(INV-D4) — Sim.stateHash()가
 * 그대로 순회해 포함한다(sim.ts 참조). 동종 재부여는 갱신(§"동종 오라 최고 1개" 스택 규율과는 다른 개념 —
 * 여기는 3종이 서로 다른 kind라 동시 보유 가능하고, 같은 key 재부여는 마지막 값으로 교체한다. 출처별 독은 다른 key로 공존한다).
 *
 * 소비 지점(호출측이 최소 훅으로 배선):
 *   - slow: movement.ts stepEntity가 slowMultiplierPm()으로 moveBudgetPm 가산치를 배율(정수 mulPm) 적용.
 *   - stun: movement.ts(이동 스킵) + combat-pipe.ts(발사 스킵, CombatCtx.status 경유) 양쪽에서 isStunned() 조회.
 *   - dot: tickDot()이 매 틱 엔티티별 hp를 정수 차감하고, 사망 전이(hp<=0)한 엔티티 목록만 반환한다 —
 *     사망 "정산"(UnitDied emit·bounty·removeUnit) 자체는 이 파일이 하지 않는다(호출측 combat-system.ts가
 *     기존 combatStep과 동일한 emit 계약·rollBounty 재사용으로 정산 — §"신규 사망 정산 경로 금지" 준수,
 *     이 파일은 "누가 dot으로 죽었는가"라는 순수 사실만 산출한다).
 *
 * 순수: rng 무접촉(§3④ "오라/스플래시/상태효과는 rng 무접촉") · Math.random/Date.now 0 · 부동소수 0.
 */
import type { UnitEntity } from "./unit-entity.ts";

export type StatusEffectKind = "slow" | "stun" | "dot" | "armorReduction";

/** 필요한 상태의 판별 유니온 — 전 필드 정수(§5.4 "전부 정수"). remainingTicks<=0 도달 시 tickExpire가 제거한다. */
export type StatusEffect =
  | { kind: "armorReduction"; amount: number; remainingTicks: number }
  | { kind: "slow"; magnitudePm: number; remainingTicks: number }
  | { kind: "stun"; remainingTicks: number }
  | { kind: "dot"; perTick: number; remainingTicks: number; perSecondPm?:number;remainder?:number;sourceUnitId?:number;sourceOwner?:number;minHp?:number;pulseIntervalTicks?:number;pulseTicksLeft?:number;pulseDamagePm?:number };

/** 엔티티id → (key → effect) — 둘 다 삽입순 Map(INV-D4, Sim.stateHash()가 그대로 순회). */
export type StatusEffectKey=StatusEffectKind|"frost"|`burn:${number}`|`armor:${string}`|`venom:${string}:${number}`|`liquid:${string}`;
export type StatusStore = Map<number, Map<StatusEffectKey, StatusEffect>>;

export function createStatusStore(): StatusStore {
  return new Map();
}

/** 상태효과 부여/갱신 — 동일 key 재부여는 최신 값으로 교체(각 key 안에서 스택 없음). */
export function applyStatus(store: StatusStore, entityId: number, effect: StatusEffect, key:StatusEffectKey=effect.kind): void {
  let byKind = store.get(entityId);
  if (!byKind) {
    byKind = new Map();
    store.set(entityId, byKind);
  }
  const old=byKind.get(key);
  if(effect.kind==="dot"&&old?.kind==="dot"){
    if(effect.perSecondPm!==undefined||effect.pulseIntervalTicks!==undefined)effect.remainder=old.remainder??0;
    if(effect.pulseIntervalTicks!==undefined&&old.pulseIntervalTicks===effect.pulseIntervalTicks)effect.pulseTicksLeft=old.pulseTicksLeft??effect.pulseIntervalTicks;
  }
  byKind.set(key, effect);
}

export function getStatus(store: StatusStore, entityId: number, kind: StatusEffectKind): StatusEffect | undefined {
  return store.get(entityId)?.get(kind);
}

/** stun 보유 여부 — movement.ts(이동 스킵)·combat-pipe.ts(발사 스킵) 공용 조회(§5.4 "이동·발사 둘 다"). */
export function isStunned(store: StatusStore, entityId: number): boolean {
  return store.get(entityId)?.has("stun") ?? false;
}

/** slow 배율(퍼밀, 1000=배율없음) — movement.ts가 moveBudgetPm 가산치에 곱한다(좌표 직접 조작 금지). */
export function slowMultiplierPm(store: StatusStore, entityId: number): number {
  let multiplier=1000;
  for(const key of ["slow","frost"] as const){const s=store.get(entityId)?.get(key);if(s?.kind==="slow")multiplier=Math.floor(multiplier*Math.max(0,1000-s.magnitudePm)/1000);}
  return multiplier;
}

/**
 * dot 차감(§5.4 "틱당 hp 차감") — 매 틱 1회 호출. hp<=0으로 전이한 엔티티만 반환(사망 정산은 호출측 소관,
 * 파일 헤더 참조). 만료(remainingTicks 감소·0 도달 시 제거)는 이 함수가 모든 kind에 대해 함께 처리한다
 * (dot뿐 아니라 slow/stun도 여기서 카운트다운 — 소비 지점이 여럿이라 만료를 한 곳에 모아 결정론을 지킨다).
 */
export function tickStatus(store: StatusStore, entities: ReadonlyMap<number, UnitEntity>,onDeath?:(entity:UnitEntity,effect:StatusEffect)=>void): UnitEntity[] {
  const diedFromDot: UnitEntity[] = [];
  for (const [entityId, byKind] of store) {
    const entity = entities.get(entityId);
    if (!entity || !entity.alive) {
      store.delete(entityId); // 소실된 엔티티의 잔류 효과 정리(누수 방지, 결정론에 영향 없음 — 조회 불가 상태였음)
      continue;
    }
    for (const [kind, effect] of [...byKind]) {
      if (effect.kind === "dot" && !entity.invulnerable && entity.hp>0) {
        let damage=effect.perTick;
        if(effect.pulseIntervalTicks!==undefined){
          effect.pulseTicksLeft=(effect.pulseTicksLeft??effect.pulseIntervalTicks)-1;
          if(effect.pulseTicksLeft<=0){const accumulated=(effect.remainder??0)+(effect.pulseDamagePm??0);damage+=Math.floor(accumulated/1000);effect.remainder=accumulated%1000;effect.pulseTicksLeft=effect.pulseIntervalTicks;}
        }else{const accumulated=(effect.remainder??0)+(effect.perSecondPm??0);damage+=Math.floor(accumulated/20_000);effect.remainder=accumulated%20_000;}
        // A source-specific floor is nonlethal, never healing or resurrecting a target.
        // 20Hz raw-HP accumulation is the existing compatibility policy, not native pulse/defense parity.
        const before=entity.hp;entity.hp=effect.minHp===undefined?before-damage:Math.min(before,Math.max(effect.minHp,before-damage));
        if (before>0&&entity.hp <= 0){diedFromDot.push(entity);onDeath?.(entity,effect);}
      }
      effect.remainingTicks -= 1;
      if (effect.remainingTicks <= 0) byKind.delete(kind);
    }
    if (byKind.size === 0) store.delete(entityId);
  }
  return diedFromDot;
}
