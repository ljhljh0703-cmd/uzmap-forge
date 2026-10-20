/**
 * R-202b B2 — BalanceDefaultsProvider: 공식 기반 DefaultsProvider(DV-004, D-6 해소).
 * 계약: docs/BALANCE_ENGINE_DESIGN.md §4.3.
 *   - 순수: rng·시각·전역 무접촉(시그니처에 rng 자체가 없음 — INV-D1 타입 수준 차단).
 *   - 완전: 모든 typeId에 대해 공백 없는 정수 블록 반환(미지 typeId = fallback).
 *   - 해석 순서(고정): overrides[typeId] 필드 > roleTable→공식 > fallback.
 *   - 프리셋: 곡선 평가 후 최종 배율 1지점(테이블 생성 시) — 패치와 난이도의 직교(§5.4).
 * 미지 typeId 이벤트(UnknownUnitDef)는 소비측(R-202)이 방출한다 — provider는 emit하지 않는다(§9 D5).
 */
import type { FourCC } from "../../ir/types.ts";
import { mulPm, clampInt } from "./fixed.ts";
import { buildNumTable, evalEnum } from "./curves.ts";
import {
  makeNeutralGameConstants,
  validateConfig,
  type AttackSpec,
  type ArmorTypeId,
  type AuraSpec,
  type BandSpec,
  type DifficultyPreset,
  type GameBalanceConfig,
  type GameConstants,
  type HeroAttrs,
  type OverrideSpec,
  type Role,
  type StaticDefSpec,
} from "./config.ts";

/** R-202 DefStore가 소비하는 완전 스탯 블록 — 전 필드 정수(설계 §4.3). */
export interface UnitDefDefaults {
  hpMax: number;
  mana: number;
  armorValue: number;
  armorType: ArmorTypeId;
  attack: AttackSpec | null;
  moveSpeedU: number;
  collisionU: number;
  goldCost: number;
  bounty: { base: number; spreadPm: number };
  regenPmPerSec: number;
  foodUsed: number;
  /** G-4(GEM_IDENTITY_MINE_DESIGN §5.3) — 공속 오라(타워 단위 자산, attack과 별개 — 광산 등 attack=null도
   *  이론상 오라 보유 가능하므로 UnitDefDefaults 최상위에 둔다). 부재 = 오라 없음(기존 전원 무회귀). */
  aura?: AuraSpec;
  meta: { role: Role; source: "formula" | "override" | "fallback" };
}

/** R-202가 부르는 시그니처(설계 §4.3 — DefaultsProvider seam의 공식 기반 구현). */
export interface DefaultsProvider {
  resolve(typeId: FourCC): UnitDefDefaults;
}

interface BandTables {
  spec: BandSpec;
  hp: number[];
  armor: number[];
  speed: number[];
  bounty: number[];
}

interface ProviderOptions {
  gameConstants?: GameConstants;
  preset?: string;
}

function freezeDef(d: UnitDefDefaults): UnitDefDefaults {
  if (d.attack) {
    if (d.attack.splash) Object.freeze(d.attack.splash); // G-3
    Object.freeze(d.attack);
  }
  if (d.aura) Object.freeze(d.aura); // G-4
  Object.freeze(d.bounty);
  Object.freeze(d.meta.role);
  Object.freeze(d.meta);
  return Object.freeze(d);
}

export function createBalanceProvider(cfg: GameBalanceConfig, opts?: ProviderOptions): DefaultsProvider {
  const errors = validateConfig(cfg);
  if (errors.length > 0) throw new Error(`GameBalanceConfig 검증 실패(${cfg.name}):\n- ${errors.join("\n- ")}`);
  const gc = opts?.gameConstants ?? makeNeutralGameConstants();
  const presetKey = opts?.preset ?? cfg.defaultPreset;
  const presetSpec = cfg.difficultyPresets[presetKey];
  if (!presetSpec) throw new Error(`미지 난이도 프리셋: ${presetKey}`);
  // 함수 선언(호이스팅) 내부에서도 non-undefined가 보장되도록 값 캡처(TS 내로잉 경계).
  const preset: DifficultyPreset = presetSpec;

  // 테이블은 생성 시 1회(파생 캐시 — 상태 아님·stateHash 밖, §3.2/§9). 프리셋은 여기 1지점에서만 적용.
  const bandTables = new Map<string, BandTables>();
  for (const spec of cfg.bands) {
    const hpRaw = buildNumTable(spec.hp, cfg.maxWave);
    const bountyRaw = buildNumTable(spec.bounty, cfg.maxWave);
    bandTables.set(spec.key, {
      spec,
      hp: hpRaw.map((v) => Math.max(1, mulPm(v, preset.hpPm))),
      armor: buildNumTable(spec.armor, cfg.maxWave),
      speed: buildNumTable(spec.speed, cfg.maxWave),
      bounty: bountyRaw.map((v) => Math.max(0, mulPm(v, preset.bountyPm))),
    });
  }
  const lineDmg = new Map<string, number[]>();
  for (const [key, line] of Object.entries(cfg.towerLines)) {
    lineDmg.set(key, buildNumTable(line.dmg, line.cooldownTicksByTier.length));
  }

  const applySpeedBounds = (v: number): number => clampInt(v, gc.minUnitSpeedU, gc.maxUnitSpeedU);

  function fromStatic(s: StaticDefSpec, role: Role, source: "formula" | "fallback"): UnitDefDefaults {
    return {
      hpMax: s.hpMax,
      mana: s.mana,
      armorValue: s.armorValue,
      armorType: s.armorType,
      attack: s.attack ? { ...s.attack } : null,
      moveSpeedU: s.moveSpeedU,
      collisionU: s.collisionU,
      goldCost: s.goldCost,
      bounty: { base: s.bountyBase, spreadPm: s.bountySpreadPm },
      regenPmPerSec: s.regenPmPerSec,
      foodUsed: s.foodUsed ?? 0,
      meta: { role, source },
    };
  }

  function formulaBlock(role: Role): { def: UnitDefDefaults; heroAttrs?: HeroAttrs } {
    switch (role.kind) {
      case "creep": {
        const t = bandTables.get(role.band)!; // validate가 밴드 존재를 보장
        const w = role.wave;
        return {
          def: {
            hpMax: t.hp[w]!,
            mana: 0,
            armorValue: t.armor[w]!,
            armorType: evalEnum(t.spec.armorType, w),
            attack: null, // 이 게임의 크립은 비공격(공격형 크립은 static/override로) — 데이터가 결정
            moveSpeedU: applySpeedBounds(t.speed[w]! + preset.speedAddU),
            collisionU: t.spec.collisionU,
            goldCost: 0,
            bounty: { base: t.bounty[w]!, spreadPm: t.spec.bountySpreadPm },
            regenPmPerSec: t.spec.regenPmPerSec,
            foodUsed: t.spec.foodUsed,
            meta: { role, source: "formula" },
          },
        };
      }
      case "tower": {
        const line = cfg.towerLines[role.line]!;
        const dmg = lineDmg.get(role.line)![role.tier]!;
        const rangeU = line.rangeBaseU + line.rangeStepPerTierU * (role.tier - 1);
        // G-3: 티어별 원시 스플래시 표(곡선 아님 — 비단조 실측치를 그대로 인덱싱).
        const splash = line.splashByTier ? { ...line.splashByTier[role.tier - 1]! } : undefined;
        // G-4: 티어별 공속 오라(원시 표 — S002/S003/S004/S009 lv1 실측, provider.ts는 조회만).
        const aura = line.auraByTier ? { ...line.auraByTier[role.tier - 1]! } : undefined;
        return {
          def: {
            hpMax: line.hpMax,
            mana: 0,
            armorValue: line.armorValue,
            armorType: line.armorType,
            attack: {
              dmgBase: dmg,
              dmgSpread: mulPm(dmg, line.spreadPm),
              cooldownTicks: line.cooldownTicksByTier[role.tier - 1]!,
              rangeU,
              acquireU: rangeU + line.acquireBonusU,
              attackType: line.attackType,
              targetsMask: line.targetsMask,
              splash,
            },
            aura,
            moveSpeedU: 0,
            collisionU: 0,
            goldCost: line.goldCost,
            bounty: { base: 0, spreadPm: 0 },
            regenPmPerSec: 0,
            foodUsed: 0,
            meta: { role, source: "formula" },
          },
        };
      }
      case "static": {
        const s = cfg.statics[role.archetype]!;
        return { def: fromStatic(s, role, "formula"), heroAttrs: s.heroAttrs };
      }
    }
  }

  function applyOverride(def: UnitDefDefaults, ovr: OverrideSpec): { def: UnitDefDefaults; heroAttrs?: HeroAttrs } {
    const out: UnitDefDefaults = {
      hpMax: ovr.hpMax ?? def.hpMax,
      mana: ovr.mana ?? def.mana,
      armorValue: ovr.armorValue ?? def.armorValue,
      armorType: ovr.armorType ?? def.armorType,
      attack: ovr.attack !== undefined ? (ovr.attack ? { ...ovr.attack } : null) : def.attack,
      aura: ovr.aura ?? def.aura, // G-4 — override 미지정 시 formula/static의 aura를 그대로 승계.
      moveSpeedU: ovr.moveSpeedU ?? def.moveSpeedU,
      collisionU: ovr.collisionU ?? def.collisionU,
      goldCost: ovr.goldCost ?? def.goldCost,
      bounty: { base: ovr.bountyBase ?? def.bounty.base, spreadPm: ovr.bountySpreadPm ?? def.bounty.spreadPm },
      regenPmPerSec: ovr.regenPmPerSec ?? def.regenPmPerSec,
      foodUsed: ovr.foodUsed ?? def.foodUsed,
      meta: { role: def.meta.role, source: "override" },
    };
    return { def: out, heroAttrs: ovr.heroAttrs };
  }

  /** 영웅 스탯 선형 3종(§3.5) — gameConstants가 켠 경우에만 가산. 정수 산술. */
  function applyHeroAttrs(def: UnitDefDefaults, attrs: HeroAttrs): void {
    def.hpMax += attrs.str * gc.strHitPointBonus;
    def.armorValue += Math.floor((attrs.agi * gc.agiDefenseBonusPm) / 1000);
    def.mana += Math.floor((attrs.int * gc.intManaBonusPm) / 1000);
  }

  const cache = new Map<FourCC, UnitDefDefaults>(); // 삽입순(INV-D4) — 파생 캐시, 해시 밖

  return {
    resolve(typeId: FourCC): UnitDefDefaults {
      const hit = cache.get(typeId);
      if (hit) return hit;
      const role = cfg.roleTable[typeId];
      let def: UnitDefDefaults;
      let heroAttrs: HeroAttrs | undefined;
      if (role) {
        const built = formulaBlock(role);
        def = built.def;
        heroAttrs = built.heroAttrs;
      } else {
        def = fromStatic(cfg.fallback, { kind: "static", archetype: "__fallback" }, "fallback");
        heroAttrs = cfg.fallback.heroAttrs;
      }
      const ovr = cfg.overrides[typeId];
      if (ovr) {
        const applied = applyOverride(def, ovr);
        def = applied.def;
        heroAttrs = applied.heroAttrs ?? heroAttrs;
      }
      if (heroAttrs) applyHeroAttrs(def, heroAttrs);
      const frozen = freezeDef(def);
      cache.set(typeId, frozen);
      return frozen;
    },
  };
}
