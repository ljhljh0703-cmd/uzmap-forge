/**
 * R-202b B1 — GameBalanceConfig 타입 + 검증. "엔진=코드, 게임=config 데이터" 경계(설계 §7).
 * config에는 코드가 없다(전부 리터럴, JSON 직렬화 가능) — 밸런스 패치 = 데이터 diff.
 * 계약: docs/BALANCE_ENGINE_DESIGN.md §3(공식) §4(Role·시딩) §5.4(프리셋) §6.2(gameConstants).
 */
import type { FourCC } from "../../ir/types.ts";
import { isSafeInt } from "./fixed.ts";
import { validateNumCurve, validateEnumCurve, type NumCurveSpec, type EnumCurveSpec } from "./curves.ts";
import type { LifeConfig } from "../life.ts";

export type AttackTypeId = string;
export type ArmorTypeId = string;

/** 역할 좌표 — 시딩 도구(오프라인)가 생성, 런타임은 조회만(설계 §4.1: 런타임 계약 = authored 태그 단독). */
export type Role =
  | { kind: "creep"; band: string; wave: number }
  | { kind: "tower"; line: string; tier: number }
  | { kind: "static"; archetype: string };

/** 밴드 멤버십 술어 — 선언 순서 첫 매치(§3.3). 시딩·검증·재사용용(런타임은 Role.band 직접 사용). */
export type BandMatch =
  | { kind: "mod"; m: number; r: number }
  | { kind: "in"; waves: ReadonlyArray<number> }
  | { kind: "range"; min?: number; max?: number }
  | { kind: "default" };

/** 크립 밴드 — 웨이브 축 곡선 묶음(§3.3, §5.1). */
export interface BandSpec {
  key: string;
  match: BandMatch;
  hp: NumCurveSpec;
  armor: NumCurveSpec;
  armorType: EnumCurveSpec;
  speed: NumCurveSpec;
  bounty: NumCurveSpec;
  bountySpreadPm: number;
  targetsMask: number;
  collisionU: number;
  regenPmPerSec: number;
  /** Alive unit contribution to PLAYER_STATE_RESOURCE_FOOD_USED. */
  foodUsed: number;
}

/** 타워 라인(색) — 형태 상수 + 티어 배율 곡선(§3.4). dmg 곡선의 x = tier. */
export interface TowerLineSpec {
  key: string;
  attackType: AttackTypeId;
  armorType: ArmorTypeId;
  armorValue: number;
  hpMax: number;
  dmg: NumCurveSpec;
  spreadPm: number;
  rangeBaseU: number;
  rangeStepPerTierU: number;
  cooldownTicksByTier: ReadonlyArray<number>;
  acquireBonusU: number;
  targetsMask: number;
  goldCost: number;
  /** G-3 — 티어별 스플래시(루비만 실측 보유, §2.3). 원시 표(비단조 가능) — 곡선 왜곡 금지(§3③). */
  splashByTier?: ReadonlyArray<SplashSpec>;
  /** G-4 — 티어별 공속 오라(오팔만 보유, S002/S003/S004/S009 lv1 실측). */
  auraByTier?: ReadonlyArray<AuraSpec>;
}

export interface HeroAttrs {
  str: number;
  agi: number;
  int: number;
}

/**
 * G-3(GEM_IDENTITY_MINE_DESIGN §5.2, DISPATCH_SONNET_G3_G6 §2 G-3) — 스플래시 반경 3단.
 * fullU 이내 = 100%(1000pm)·halfU 이내 = 50%(500pm)·quarterU 이내 = 25%(250pm)(WC3 커뮤니티 관례
 * — 실측 원장이 아니라 커뮤니티 문서화된 스플래시 배율 규약, combat-pipe.ts 적용부 주석 참조).
 * 부재(undefined) = 스플래시 없음(기존 타워 무회귀, done-gate ③).
 */
export interface SplashSpec {
  fullU: number;
  targetsMask?:number;
  halfU: number;
  quarterU: number;
}

/**
 * G-4(GEM_IDENTITY_MINE_DESIGN §5.3, DISPATCH_SONNET_G3_G6 §2 G-4) — 공속 오라.
 * kind는 v1 단일종(attackSpeed)만 — 과설계 금지 조항(§1)에 따라 유니온을 미리 늘리지 않는다.
 * bonusPm=Oae2×1000 실측 시딩(abilities_census.json S002/S003/S004/S009). radiusU=자체값 900(A-G2,
 * 원작 aare 필드가 0으로 관측돼 상속 불명 — R-405 튜닝 항목, gemtower.ts 시딩부 주석 참조).
 */
export interface AuraSpec {
  kind: "attackSpeed";
  bonusPm: number;
  radiusU: number;
}

/** 공격 블록(완전 명세) — 주사위 굴림은 소비측(R-204)이 sim rng로(INV-D1). */
export interface AttackSpec {
  dmgBase: number;
  dmgSpread: number;
  cooldownTicks: number;
  rangeU: number;
  acquireU: number;
  attackType: AttackTypeId;
  targetsMask: number;
  /** G-3 — 부재 시 스플래시 없음(기존 타워 전원 무회귀). */
  splash?: SplashSpec;
}

/** 곡선 밖 유닛(빌더·마커·더미·테스터 등)의 완전 스탯 리터럴. */
export interface StaticDefSpec {
  hpMax: number;
  mana: number;
  armorValue: number;
  armorType: ArmorTypeId;
  attack: AttackSpec | null;
  moveSpeedU: number;
  collisionU: number;
  goldCost: number;
  bountyBase: number;
  bountySpreadPm: number;
  regenPmPerSec: number;
  foodUsed?: number;
  heroAttrs?: HeroAttrs;
}

/** 필드 단위 수동 패치(작가 밸런스 패치 지점) — 해석 순서 최상위(§4.3). */
export interface OverrideSpec {
  hpMax?: number;
  mana?: number;
  armorValue?: number;
  armorType?: ArmorTypeId;
  attack?: AttackSpec | null;
  moveSpeedU?: number;
  collisionU?: number;
  goldCost?: number;
  bountyBase?: number;
  bountySpreadPm?: number;
  regenPmPerSec?: number;
  foodUsed?: number;
  heroAttrs?: HeroAttrs;
  /** G-4 — 오라 수동 패치 지점(현재 시딩은 towerLine.auraByTier 경유가 정본, 이 필드는 override seam 완비용). */
  aura?: AuraSpec;
}

/** 난이도 프리셋 — 곡선 평가 후 최종 배율(패치와 난이도의 직교, §5.4). */
export interface DifficultyPreset {
  hpPm: number;
  bountyPm: number;
  speedAddU: number;
}

/**
 * G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c, docs/GEM_IDENTITY_MINE_DESIGN.md §4) — 연구 레벨당 비용/만렙.
 * costPerLevel = 레벨1 기저 비용(w3q 실측 gglb, A-G1: R000 20·R001 50·R002 500). 레벨 카운트 자체(현재 몇
 * 레벨)는 config가 아니라 Sim의 런타임 저장소(player×techId, sim.ts) 소관 — 여기는 "비용표"만 데이터로 보관.
 *
 * costIncrementPerLevel은 상속까지 해결한 gglm(1.28 UpgradeMetaData의 goldmod 매핑)이다.
 * w3q 변경분에 필드가 없으면 stock 기본값을 먼저 해결해야 하며, 부재를0으로 해석하면 안 된다.
 * 비용 계산은 아래 researchCostForLevel 단일 경로를 사용한다. 해결된 증가분이0인 spec은
 * undefined로 생략할 수 있다. P19: R001의 Rhac goldmod25 상속 누락을 원작/stock으로 교정했다.
 *
 * R-1(§2 C-2) — requires: w3q R001에 실측되는 "greq"(선행 테크id)/"grqc"(요구 레벨수) 테크트리 의존성.
 * 부재 = 선행조건 없음(R000/R002 기존 거동 무회귀).
 */
export interface ResearchSpec {
  costPerLevel: number;
  maxLevel: number;
  costIncrementPerLevel?: number;
  requires?: { techId: string; count: number };
}

/** R-1 C-1 — 레벨별 비용 계산 단일 지점(격리). level = 지금 구매하려는 레벨(1-based, currentLevel+1). */
export function researchCostForLevel(spec: ResearchSpec, level: number): number {
  return spec.costPerLevel + (level - 1) * (spec.costIncrementPerLevel ?? 0);
}

/** 게임플레이 상수 — IR gameConstants(R-108, 맵 war3mapMisc.txt)에서 주입. 미제공 필드는 중립. */
export interface GameConstants {
  /** 방어 감산 계수(WC3 기본 0.06 = 60pm — 커뮤니티 문서화된 메커니즘 상수, 설계 §6.1). */
  armorFactorPm: number;
  /** Caller-sourced FrostMoveSpeedDecrease; absent means unresolved, never guessed. */
  frostMoveSpeedDecreasePm?:number;
  frostAttackSpeedDecreasePm?:number;
  relativeUpgradeCost?:boolean;
  strHitPointBonus: number;
  agiDefenseBonusPm: number;
  intManaBonusPm: number;
  maxUnitSpeedU?: number;
  minUnitSpeedU?: number;
  /** 공격타입×방어타입 per-mille 배율표(§6.2). 부재 = 중립(전부 1000). */
  damageBonusPm?: Record<AttackTypeId, Record<ArmorTypeId, number>>;
}

/** 중립 gameConstants — 자체 창작 폴백(Blizzard 기본표 미동봉, clean-room §6.2). */
export function makeNeutralGameConstants(): GameConstants {
  return { armorFactorPm: 60, strHitPointBonus: 0, agiDefenseBonusPm: 0, intManaBonusPm: 0 };
}

export interface GameBalanceConfig {
  name: string;
  maxWave: number;
  attackTypes: ReadonlyArray<AttackTypeId>;
  armorTypes: ReadonlyArray<ArmorTypeId>;
  /** Misc.txt DamageBonus 8열 → 방어타입 매핑(열 순서 자체가 데이터 — 가정 A-B1을 config로 처리). */
  armorTypeColumnOrder: ReadonlyArray<ArmorTypeId>;
  bands: ReadonlyArray<BandSpec>;
  towerLines: Record<string, TowerLineSpec>;
  statics: Record<string, StaticDefSpec>;
  roleTable: Record<FourCC, Role>;
  overrides: Record<FourCC, OverrideSpec>;
  difficultyPresets: Record<string, DifficultyPreset>;
  defaultPreset: string;
  /** 현상금 지급 주체 정책(AD-3) — 값 산출은 항상 엔진, 지급 시맨틱은 R-204/208 소비. */
  bountyMode: "engine" | "script" | "both" | "source";
  /** LIFE §3 — original map defaults to observe; scenarios may clone with enforce. */
  life: LifeConfig;
  fallback: StaticDefSpec;
  /** G-2c — 연구 techId(FourCC 문자열, w3q 원본 rawcode 그대로) → 비용표. 부재 = 연구 기능 없음(설계 §4). */
  researches?: Record<string, ResearchSpec>;
}

/** 웨이브 → 밴드(선언 순서 첫 매치). 시딩·검증용 — 런타임 resolve는 Role.band를 신뢰. */
export function matchBand(bands: ReadonlyArray<BandSpec>, wave: number): BandSpec | undefined {
  for (const b of bands) {
    const m = b.match;
    switch (m.kind) {
      case "mod":
        if (m.m > 0 && wave % m.m === m.r) return b;
        break;
      case "in":
        if (m.waves.includes(wave)) return b;
        break;
      case "range":
        if ((m.min === undefined || wave >= m.min) && (m.max === undefined || wave <= m.max)) return b;
        break;
      case "default":
        return b;
    }
  }
  return undefined;
}

function validateStaticDef(s: StaticDefSpec, label: string, armorTypes: ReadonlyArray<string>, errs: string[]): void {
  for (const [k, v] of [["hpMax", s.hpMax], ["mana", s.mana], ["armorValue", s.armorValue], ["moveSpeedU", s.moveSpeedU], ["collisionU", s.collisionU], ["goldCost", s.goldCost], ["bountyBase", s.bountyBase], ["bountySpreadPm", s.bountySpreadPm], ["regenPmPerSec", s.regenPmPerSec], ["foodUsed", s.foodUsed ?? 0]] as const) {
    if (!isSafeInt(v)) errs.push(`${label}: ${k} 비정수(${String(v)})`);
  }
  if (!armorTypes.includes(s.armorType)) errs.push(`${label}: 미지 armorType '${s.armorType}'`);
}

/** config 전체 검증 — provider 생성 시 오류 있으면 로드 거부. */
export function validateConfig(cfg: GameBalanceConfig): string[] {
  const errs: string[] = [];
  if (!isSafeInt(cfg.maxWave) || cfg.maxWave < 1) errs.push(`maxWave 부적합: ${String(cfg.maxWave)}`);
  const maxWave = isSafeInt(cfg.maxWave) ? Math.max(1, cfg.maxWave) : 1;

  const bandKeys = new Set<string>();
  for (const b of cfg.bands) {
    if (bandKeys.has(b.key)) errs.push(`밴드 키 중복: ${b.key}`);
    bandKeys.add(b.key);
    errs.push(...validateNumCurve(b.hp, maxWave, `band ${b.key}.hp`));
    errs.push(...validateNumCurve(b.armor, maxWave, `band ${b.key}.armor`));
    errs.push(...validateNumCurve(b.speed, maxWave, `band ${b.key}.speed`));
    errs.push(...validateNumCurve(b.bounty, maxWave, `band ${b.key}.bounty`));
    errs.push(...validateEnumCurve(b.armorType, `band ${b.key}.armorType`));
    for (const v of b.armorType.values) {
      if (!cfg.armorTypes.includes(v)) errs.push(`band ${b.key}: 미지 armorType '${v}'`);
    }
    if (!isSafeInt(b.bountySpreadPm) || !isSafeInt(b.targetsMask) || !isSafeInt(b.collisionU) || !isSafeInt(b.regenPmPerSec) || !isSafeInt(b.foodUsed)) {
      errs.push(`band ${b.key}: 스칼라 비정수`);
    }
  }

  for (const [key, line] of Object.entries(cfg.towerLines)) {
    if (line.key !== key) errs.push(`towerLine ${key}: key 필드 불일치`);
    const maxTier = line.cooldownTicksByTier.length;
    if (maxTier === 0) errs.push(`towerLine ${key}: cooldownTicksByTier 비어있음`);
    errs.push(...validateNumCurve(line.dmg, Math.max(1, maxTier), `towerLine ${key}.dmg`));
    if (!cfg.attackTypes.includes(line.attackType)) errs.push(`towerLine ${key}: 미지 attackType '${line.attackType}'`);
    if (!cfg.armorTypes.includes(line.armorType)) errs.push(`towerLine ${key}: 미지 armorType '${line.armorType}'`);
    for (const t of line.cooldownTicksByTier) {
      if (!isSafeInt(t) || t < 1) errs.push(`towerLine ${key}: cooldownTicks 비정수/1 미만`);
    }
    if (!isSafeInt(line.rangeBaseU) || !isSafeInt(line.rangeStepPerTierU) || !isSafeInt(line.spreadPm) || !isSafeInt(line.acquireBonusU) || !isSafeInt(line.hpMax) || !isSafeInt(line.armorValue) || !isSafeInt(line.goldCost)) {
      errs.push(`towerLine ${key}: 스칼라 비정수`);
    }
    // G-3: splashByTier — 부재 허용(스플래시 없는 라인), 존재 시 티어수 일치 + 전 필드 정수.
    if (line.splashByTier) {
      if (line.splashByTier.length !== maxTier) errs.push(`towerLine ${key}: splashByTier 길이 불일치`);
      for (const s of line.splashByTier) {
        if (!isSafeInt(s.fullU) || !isSafeInt(s.halfU) || !isSafeInt(s.quarterU)) errs.push(`towerLine ${key}: splash 비정수`);
      }
    }
    // G-4: auraByTier — 부재 허용(오라 없는 라인), 존재 시 티어수 일치 + 전 필드 정수.
    if (line.auraByTier) {
      if (line.auraByTier.length !== maxTier) errs.push(`towerLine ${key}: auraByTier 길이 불일치`);
      for (const a of line.auraByTier) {
        if (!isSafeInt(a.bonusPm) || !isSafeInt(a.radiusU)) errs.push(`towerLine ${key}: aura 비정수`);
      }
    }
  }

  for (const [key, s] of Object.entries(cfg.statics)) validateStaticDef(s, `static ${key}`, cfg.armorTypes, errs);
  validateStaticDef(cfg.fallback, "fallback", cfg.armorTypes, errs);

  for (const [id, role] of Object.entries(cfg.roleTable)) {
    switch (role.kind) {
      case "creep": {
        if (!bandKeys.has(role.band)) errs.push(`roleTable ${id}: 미지 밴드 '${role.band}'`);
        if (!isSafeInt(role.wave) || role.wave < 0 || role.wave > maxWave) errs.push(`roleTable ${id}: wave ${String(role.wave)} ∉ [0,${maxWave}]`);
        break;
      }
      case "tower": {
        const line = cfg.towerLines[role.line];
        if (!line) errs.push(`roleTable ${id}: 미지 라인 '${role.line}'`);
        else if (!isSafeInt(role.tier) || role.tier < 1 || role.tier > line.cooldownTicksByTier.length) {
          errs.push(`roleTable ${id}: tier ${String(role.tier)} 범위 밖`);
        }
        break;
      }
      case "static": {
        if (!(role.archetype in cfg.statics)) errs.push(`roleTable ${id}: 미지 아키타입 '${role.archetype}'`);
        break;
      }
    }
  }

  for (const preset of Object.values(cfg.difficultyPresets)) {
    if (!isSafeInt(preset.hpPm) || !isSafeInt(preset.bountyPm) || !isSafeInt(preset.speedAddU)) errs.push(`preset 비정수`);
  }
  if (!(cfg.defaultPreset in cfg.difficultyPresets)) errs.push(`defaultPreset '${cfg.defaultPreset}' 부재`);

  // G-2c: researches는 optional — 부재 시 스킵(연구 기능 없는 config도 유효). 있으면 전 필드 정수 + maxLevel≥1.
  const researches = cfg.researches ?? {};
  for (const [techId, spec] of Object.entries(researches)) {
    if (!isSafeInt(spec.costPerLevel) || spec.costPerLevel < 0) errs.push(`research ${techId}: costPerLevel 부적합(${String(spec.costPerLevel)})`);
    if (!isSafeInt(spec.maxLevel) || spec.maxLevel < 1) errs.push(`research ${techId}: maxLevel 부적합(${String(spec.maxLevel)})`);
    // R-1 C-1: costIncrementPerLevel — 부재 허용(증가분 없는 연구), 존재 시 음수 아닌 정수.
    if (spec.costIncrementPerLevel !== undefined && (!isSafeInt(spec.costIncrementPerLevel) || spec.costIncrementPerLevel < 0)) {
      errs.push(`research ${techId}: costIncrementPerLevel 부적합(${String(spec.costIncrementPerLevel)})`);
    }
    // R-1 C-2: requires — 부재 허용(선행조건 없는 연구), 존재 시 참조 techId가 researches에 있어야 함 + count≥1.
    if (spec.requires) {
      if (!(spec.requires.techId in researches)) errs.push(`research ${techId}: requires 미지 techId '${spec.requires.techId}'`);
      if (!isSafeInt(spec.requires.count) || spec.requires.count < 1) errs.push(`research ${techId}: requires.count 부적합(${String(spec.requires.count)})`);
    }
  }
  return errs;
}
