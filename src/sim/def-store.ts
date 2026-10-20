/**
 * R-202 — Unit Def 저장소. typeId → 완전한 정적 스탯 블록(UnitDef)을 캐시하며 산출한다.
 * 계약: docs/BALANCE_ENGINE_DESIGN.md §4.3(DefaultsProvider) §4.4(필드 파티션 — 밸런스 필드는
 *       provider가 정답, 배선/정체성은 주입된 identity 공급자만 통과). docs/ARCHITECTURE.md §sim 2층(Def 정적 / Entity 동적) 중 정적 절반.
 * 순수: provider가 이미 순수(rng·시각 무접촉, DefaultsProvider 시그니처에 rng 인자 자체가 없음 —
 *       INV-D1 타입 수준 차단). 이 파일은 그 위에 typeId→resolve 캐시만 얹는다.
 * 결정론: typeId당 provider.resolve는 1회만(캐시), 캐시는 삽입순 Map(INV-D4). 같은 typeId 재조회는
 *         캐시된 동일 참조를 반환한다.
 */
import type {PathingFootprint} from "../ir/pathing.ts";
import type { FourCC } from "../ir/types.ts";
import { createBalanceProvider, type DefaultsProvider, type UnitDefDefaults } from "./balance/provider.ts";
import { GEMTOWER_BALANCE } from "./balance/configs/gemtower.ts";

/**
 * typeId가 부착된 완전 스탯 블록 — 밸런스 필드(UnitDefDefaults, provider 산출)는 정답,
 * 배선/정체성 필드(name/abilities 등, R-106 objectMods passthrough 대상)는 이번 슬라이스에서
 * optional로 유지한다(§4.4 — 공급자 미주입 시 undefined).
 */
export interface SourceBounty {readonly base:number;readonly dice:number;readonly sides:number;}
export interface UnitUpgradeIdentity {
 readonly sourceMinMoveSpeedU?:number;readonly sourceMaxMoveSpeedU?:number;readonly sourceCollisionU?:number;
 readonly secondaryAttack?:Readonly<import('./balance/config.ts').AttackSpec>;
 readonly primaryAttackDisabled?:boolean;
 readonly trainingOptions?:ReadonlyArray<string>;
 readonly sourceLumberCost?:number;readonly sourceFoodCost?:number;
 readonly sourceAcquireRangeU?:number;
 readonly sourceBounty?:SourceBounty;
 readonly upgradesTo?:ReadonlyArray<string>;
 readonly sourceGoldCost?:number;
 readonly buildTimeTicks?:number;
 readonly techRequirements?:ReadonlyArray<{techId:string;count:number}>;
}
export interface UnitDef extends UnitDefDefaults,UnitUpgradeIdentity {
  readonly typeId: FourCC;
  /** 배선/정체성 passthrough(표현용) — 주입 시에만 제공. */
  readonly name?: string;
  readonly movementType?:string;
  readonly pathing?:PathingFootprint;
  /** Script-owned life/leak weight, separate from parametric combat balance. */
  readonly pointValue?: number;
  readonly abilities?: ReadonlyArray<string>;
}

/**
 * DefaultsProvider를 감싸 typeId→UnitDef 캐시를 제공한다.
 * provider는 생성자 주입 seam(테스트·다게임 재사용) — 미지정 시 GemTower 시드 config로 만든
 * 기본 provider(createBalanceProvider(GEMTOWER_BALANCE))를 쓴다.
 */
export interface UnitIdentityProvider {
  resolve(typeId: FourCC): {readonly name?: string; readonly abilities?: ReadonlyArray<string>; readonly pointValue?: number; readonly movementType?:string; readonly pathing?:PathingFootprint} & UnitUpgradeIdentity;
}

export class DefStore {
  private readonly provider: DefaultsProvider;
  private readonly identity?: UnitIdentityProvider;
  private readonly cache: Map<FourCC, UnitDef> = new Map(); // 삽입순(INV-D4) — typeId→resolve 1회 메모

  constructor(provider?: DefaultsProvider, identity?: UnitIdentityProvider) {
    this.identity = identity;
    this.provider = provider ?? createBalanceProvider(GEMTOWER_BALANCE);
  }

  /** New cache scoped to one map/profile; original store and balance source stay untouched. */
  withIdentity(identity: UnitIdentityProvider): DefStore {
    return new DefStore(this.provider, identity);
  }

  /** typeId → 완전 UnitDef. 캐시 히트 시 provider.resolve를 재호출하지 않고 동일 참조를 반환한다. */
  getDef(typeId: FourCC): UnitDef {
    const hit = this.cache.get(typeId);
    if (hit) return hit;
    const defaults = this.provider.resolve(typeId);
    const identity = this.identity?.resolve(typeId);
    const def: UnitDef = Object.freeze({ ...defaults, typeId,
      ...(identity?.secondaryAttack?{secondaryAttack:identity.secondaryAttack}:{}),
      ...(identity?.primaryAttackDisabled?{attack:null,primaryAttackDisabled:true}:{}),
      ...(identity?.trainingOptions!==undefined?{trainingOptions:identity.trainingOptions}:{}),
      ...(identity?.sourceLumberCost!==undefined?{sourceLumberCost:identity.sourceLumberCost}:{}),
      ...(identity?.sourceFoodCost!==undefined?{sourceFoodCost:identity.sourceFoodCost}:{}),
      ...(identity?.sourceMinMoveSpeedU!==undefined?{sourceMinMoveSpeedU:identity.sourceMinMoveSpeedU}:{}),
      ...(identity?.sourceMaxMoveSpeedU!==undefined?{sourceMaxMoveSpeedU:identity.sourceMaxMoveSpeedU}:{}),
      ...(identity?.sourceCollisionU!==undefined?{sourceCollisionU:identity.sourceCollisionU}:{}),
      ...(identity?.sourceAcquireRangeU!==undefined?{sourceAcquireRangeU:identity.sourceAcquireRangeU}:{}),
      ...(identity?.sourceBounty!==undefined?{sourceBounty:identity.sourceBounty}:{}),
      ...(identity?.upgradesTo!==undefined?{upgradesTo:identity.upgradesTo}:{}),
      ...(identity?.sourceGoldCost!==undefined?{sourceGoldCost:identity.sourceGoldCost}:{}),
      ...(identity?.buildTimeTicks!==undefined?{buildTimeTicks:identity.buildTimeTicks}:{}),
      ...(identity?.techRequirements!==undefined?{techRequirements:identity.techRequirements}:{}),
      ...(identity?.movementType !== undefined ? {movementType:identity.movementType} : {}),
      ...(identity?.pathing !== undefined ? {pathing:identity.pathing} : {}),
      ...(identity?.name !== undefined ? {name: identity.name} : {}),
      ...(identity?.pointValue !== undefined ? {pointValue: identity.pointValue} : {}),
      ...(identity?.abilities !== undefined ? {abilities: Object.freeze([...identity.abilities])} : {}),
    });
    this.cache.set(typeId, def);
    return def;
  }
}
