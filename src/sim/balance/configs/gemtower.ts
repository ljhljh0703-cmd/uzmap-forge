/**
 * GemTower_Max_7C 시드 config — R-202b B2 (게임별 데이터, 코드 0 리터럴).
 * 출처: 실맵 그라운딩+리핏(docs/BALANCE_ENGINE_DESIGN.md §2·§3, 프로브 2026-07-09).
 * 원작 diff는 시드/기준으로만 사용(DV-004) — 아래 곡선 파라미터는 authored 수치표가 아니라
 * 정수 점화식 공간에서 재피팅한 계수다(캘리브레이션 게이트: test/sim/balance/calibration.real-map.test.ts).
 * 밸런스 패치 = 이 파일의 파라미터 수정(엔진 코드 변경 0, 설계 §7).
 *
 * 구조(실측 §2.2·2.3):
 *   - 크립 50웨이브 = 밴드 4종: boss(명시 리스트) > flying(4의 배수) > hell(35+) > ground(기본).
 *     겹침(20·40)은 하이브리드 — 20은 hp·이속 override, 40은 flying 밴드가 흡수(설계 §3.3).
 *   - 타워 = 8라인(색=형태) × 4티어(배율). 최하급 4종·특수 유닛은 statics/overrides.
 *   - 티어0 최하급·특수 조합 보석(h02S/h02T 등)의 전수 수용은 R-401 census 후(설계 A-B7).
 */
import type { GameBalanceConfig } from "../config.ts";
import { stockDefault } from "./stock-defaults.ts";

/** 방어타입 로테이션(웨이브 1..50, authored 순환 — 카운터플레이 설계 데이터). 공백 4곳(9·21·25·34)은
 *  원작이 기본값을 상속(clean-room상 불명)해 'none'으로 채움 — 관측 가능한 의도적 이탈(설계 §2.2). */
const ARMOR_ROTATION = [
  "normal", "small", "medium", "none", "fort", "hero", "none", "none", "none", "none",
  "normal", "none", "small", "medium", "hero", "none", "fort", "none", "hero", "none",
  "none", "small", "medium", "none", "none", "fort", "hero", "none", "none", "divine",
  "small", "none", "medium", "none", "medium", "none", "none", "fort", "hero", "none",
  "divine", "divine", "divine", "none", "divine", "divine", "divine", "none", "divine", "divine",
] as const;

// G-2a(DISPATCH_SONNET_G2_CORE §2 자체값 — 원장 공백, RETURN.md 표 참조):
//   A-G6: waves_full.json의 attack.cd(전 웨이브 1)는 초/틱 단위 명시가 JSON에 없다 — WC3 관례(uacd는 통상
//     초 단위 실수)로 "초"로 해석해 secondsToTicks(1)=20(DT=1/20)을 리터럴로 박는다(config는 순수 리터럴 —
//     함수호출 금지 조항 준수, 계산은 여기 주석에서 1회만 수행).
//   A-G7: 광산 근접 사거리(rangeU/acquireU) — 원장에 크립 공격 사거리 필드가 없어 자체값(짧은 근접 melee).
//   A-G8: attackType — 원장 공백, 중립 자체값("normal").
const MINE_ATTACK_COOLDOWN_TICKS = 20; // A-G6
const MINE_ATTACK_RANGE_U = 64; // A-G7
const MINE_ATTACK_ACQUIRE_U = 96; // A-G7
const MINE_ATTACK_TYPE = "normal"; // A-G8

// L-3(DISPATCH_SONNET_L3_STOCK_DEFAULTS §1/§2 A-G12) — hgtw/hctw 스톡 range·attackType. 원장이
// 필드 부재(=스톡 상속)로 관측한 유닛에서만 쓴다(원장 우선 — 있으면 이 값 대신 그 값). 단일 격리
// 지점은 configs/stock-defaults.ts(정정은 그 파일만 수정) — 여기서는 조회 결과에 이름만 붙여
// override 항목들이 재사용한다(계산 없음, 리터럴 상수 재사용 — MINE_ATTACK_* 선례와 동일 패턴).
const STOCK_HGTW_RANGE_U = stockDefault("hgtw", "range")!;
const STOCK_HGTW_ATKTYPE = stockDefault("hgtw", "attackType")!;
const STOCK_HGTW_ACQUIRE_U = STOCK_HGTW_RANGE_U + 80; // rangeU+80 관례(전 towerLines acquireBonusU:80·h000~h004 선례와 동일 상수)
const STOCK_HCTW_RANGE_U = stockDefault("hctw", "range")!;
const STOCK_HCTW_ATKTYPE = stockDefault("hctw", "attackType")!;
const STOCK_HCTW_ACQUIRE_U = STOCK_HCTW_RANGE_U + 80; // 위와 동일 관례

// DISPATCH_SONNET_G3_G6 §2 G-3(GEM_IDENTITY_MINE_DESIGN §5.2) — 루비 4티어 스플래시 실측(§2.3),
// docs/dissection/towers_full.json grid[h00C/h00M/h00R/h00T].splash와 대조 완료(정확 일치, 2026-07-19).
// 비단조 원시 표(fullU 150→200→160→200) — 곡선으로 리핏하지 않는다(§3③ "실측표를 곡선으로 왜곡 금지").
const RUBY_SPLASH_BY_TIER = [
  { fullU: 150, halfU: 175, quarterU: 200 }, // T1(h00C)
  { fullU: 200, halfU: 225, quarterU: 230 }, // T2(h00M)
  { fullU: 160, halfU: 175, quarterU: 200 }, // T3(h00R)
  { fullU: 200, halfU: 220, quarterU: 240 }, // T4(h00T)
] as const;

// DISPATCH_SONNET_G3_G6 §2 G-4(GEM_IDENTITY_MINE_DESIGN §5.3) — 오팔 공속 오라, abilities_census.json
// S003/S004/S002/S009(base SCae, name "오팔 어빌리티 2/3/4/5" — 어빌리티 번호 순서가 그대로 티어 순서와
// 일치, Oae2 lv1 실측: 0.15/0.20/0.25/0.30) — bonusPm = Oae2×1000. radiusU=900은 원장 공백(원작 aare
// 필드가 census에 0으로 관측 — base 상속 여부 clean-room 불명) 자체값(A-G2, R-405 튜닝 항목).
const OPAL_AURA_RADIUS_U = 900; // A-G2
const OPAL_AURA_BY_TIER = [
  { kind: "attackSpeed", bonusPm: 150, radiusU: OPAL_AURA_RADIUS_U }, // T1 — S003 Oae2 lv1=0.15
  { kind: "attackSpeed", bonusPm: 200, radiusU: OPAL_AURA_RADIUS_U }, // T2 — S004 Oae2 lv1=0.20
  { kind: "attackSpeed", bonusPm: 250, radiusU: OPAL_AURA_RADIUS_U }, // T3 — S002 Oae2 lv1=0.25
  { kind: "attackSpeed", bonusPm: 300, radiusU: OPAL_AURA_RADIUS_U }, // T4 — S009 Oae2 lv1=0.30
] as const;

const ARMOR_LINEAR = { kind: "linear", basePm: -7500, slopePm: 2320, clamp: { min: 0 } } as const;
const SPEED_FAST = { kind: "linear", basePm: 225500, slopePm: 7360, clamp: { min: 0, max: 522 } } as const;
const SPEED_FLYING = { kind: "linear", basePm: 209000, slopePm: 3350, clamp: { min: 0, max: 522 } } as const;
const BOUNTY_NORMAL = { kind: "linear", basePm: -51250, slopePm: 4050, clamp: { min: 0 } } as const;
const BOUNTY_BOSS = { kind: "linear", basePm: -48490, slopePm: 4860, clamp: { min: 0 } } as const;
const ROTATION = { kind: "cycle", values: ARMOR_ROTATION, fromX: 1 } as const;

export const GEMTOWER_BALANCE: GameBalanceConfig = {
  name: "gemtower-max-7c",
  maxWave: 60,
  attackTypes: ["normal", "pierce", "siege", "magic", "chaos", "hero", "spells"],
  armorTypes: ["none", "small", "medium", "large", "fort", "normal", "hero", "divine"],
  // A-B1(잠정, 신뢰 낮음 — R-405 대면 검증): Misc.txt DamageBonus 8열 → 방어타입. 열 순서 오류는 이 배열 수정으로 끝.
  armorTypeColumnOrder: ["small", "medium", "large", "fort", "normal", "hero", "divine", "none"],

  bands: [
    {
      key: "boss", // 하드코어 보스(실측: 명시 5웨이브 — 35+의 5배수는 hell 소속)
      match: { kind: "in", waves: [10, 15, 20, 25, 30] },
      hp: { kind: "expRec", segments: [{ fromX: 10, base: 3781, growthPm: 1245 }] },
      armor: ARMOR_LINEAR,
      armorType: ROTATION,
      speed: SPEED_FAST,
      bounty: BOUNTY_BOSS,
      bountySpreadPm: 0,
      targetsMask: 1,
      collisionU: 16,
      regenPmPerSec: 0,
      foodUsed: 1,
    },
    {
      key: "flying", // 4의 배수 — 자체 이속 시리즈(느림) + hell 구간(36+) 별도 세그먼트
      match: { kind: "mod", m: 4, r: 0 },
      hp: {
        kind: "expRec",
        segments: [
          { fromX: 4, base: 159, growthPm: 1215 },
          { fromX: 36, base: 927486, growthPm: 1170 },
        ],
      },
      armor: ARMOR_LINEAR,
      armorType: ROTATION,
      speed: SPEED_FLYING,
      bounty: BOUNTY_NORMAL,
      bountySpreadPm: 0,
      targetsMask: 2,
      collisionU: 16,
      regenPmPerSec: 0,
      foodUsed: 1,
    },
    {
      key: "hell", // 35+ 전면 하드코어 체제(실측 §2.2 — 이름·HP 규모 전환점)
      match: { kind: "range", min: 35 },
      hp: { kind: "expRec", segments: [{ fromX: 35, base: 776082, growthPm: 1185 }] },
      armor: ARMOR_LINEAR,
      armorType: ROTATION,
      speed: SPEED_FAST,
      bounty: BOUNTY_BOSS,
      bountySpreadPm: 0,
      targetsMask: 1,
      collisionU: 16,
      regenPmPerSec: 0,
      foodUsed: 1,
    },
    {
      key: "ground", // 기본 — 로그-오목 실측이라 3구간(설계 §3.3 리핏)
      match: { kind: "default" },
      hp: {
        kind: "expRec",
        segments: [
          { fromX: 1, base: 13, growthPm: 1695 },
          { fromX: 5, base: 201, growthPm: 1300 },
          { fromX: 15, base: 2646, growthPm: 1065 },
        ],
      },
      armor: ARMOR_LINEAR,
      armorType: ROTATION,
      speed: SPEED_FAST,
      bounty: BOUNTY_NORMAL,
      bountySpreadPm: 0,
      targetsMask: 1,
      collisionU: 16,
      regenPmPerSec: 0,
      foodUsed: 1,
    },
  ],

  // 8라인: 색=형태(사거리 밴드·틱 쿨다운·공격타입·산포), dmg=티어 점화식(x=tier, B0 리핏 0/4 fail).
  // cd는 정수 틱(DT=1/20 — 실측 {6,16,20,30,36}틱 무손실, 설계 §2.3). 자수정=pierce는 A-B9 추론,
  // 루비 티어1~3 cd(원작 미기재=기본 상속, clean-room 불명)는 자체 창작 30틱(A-B8 — R-405 튜닝 항목).
  towerLines: {
    amethyst: { key: "amethyst", attackType: "pierce", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 37, growthPm: 1610 }] }, spreadPm: 230, rangeBaseU: 820, rangeStepPerTierU: 20, cooldownTicksByTier: [20, 20, 20, 16], acquireBonusU: 80, targetsMask: 3, goldCost: 0 },
    aquamarine: { key: "aquamarine", attackType: "magic", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 29, growthPm: 1500 }] }, spreadPm: 160, rangeBaseU: 320, rangeStepPerTierU: 20, cooldownTicksByTier: [6, 6, 6, 6], acquireBonusU: 80, targetsMask: 3, goldCost: 0 },
    diamond: { key: "diamond", attackType: "normal", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 31, growthPm: 1615 }] }, spreadPm: 110, rangeBaseU: 620, rangeStepPerTierU: 20, cooldownTicksByTier: [36, 36, 36, 16], acquireBonusU: 80, targetsMask: 3, goldCost: 0 },
    emerald: { key: "emerald", attackType: "siege", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 31, growthPm: 1485 }] }, spreadPm: 160, rangeBaseU: 520, rangeStepPerTierU: 20, cooldownTicksByTier: [20, 20, 20, 16], acquireBonusU: 80, targetsMask: 3, goldCost: 0 },
    opal: { key: "opal", attackType: "magic", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 29, growthPm: 1500 }] }, spreadPm: 20, rangeBaseU: 720, rangeStepPerTierU: 20, cooldownTicksByTier: [20, 20, 20, 16], acquireBonusU: 80, targetsMask: 3, goldCost: 0, auraByTier: OPAL_AURA_BY_TIER },
    sapphire: { key: "sapphire", attackType: "spells", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 31, growthPm: 1485 }] }, spreadPm: 150, rangeBaseU: 570, rangeStepPerTierU: 20, cooldownTicksByTier: [30, 30, 30, 16], acquireBonusU: 80, targetsMask: 3, goldCost: 0 },
    ruby: { key: "ruby", attackType: "hero", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 36, growthPm: 1500 }] }, spreadPm: 120, rangeBaseU: 820, rangeStepPerTierU: 20, cooldownTicksByTier: [30, 30, 30, 16], acquireBonusU: 80, targetsMask: 3, goldCost: 0, splashByTier: RUBY_SPLASH_BY_TIER },
    topaz: { key: "topaz", attackType: "chaos", armorType: "fort", armorValue: 0, hpMax: 100, dmg: { kind: "expRec", segments: [{ fromX: 1, base: 20, growthPm: 1800 }] }, spreadPm: 30, rangeBaseU: 420, rangeStepPerTierU: 20, cooldownTicksByTier: [20, 20, 20, 16], acquireBonusU: 80, targetsMask: 3, goldCost: 0 },
  },

  // 곡선 밖 유닛(실측 §2.3 특수 유닛). 값은 시드 — 원작 authored 관측치 기반 창작 선택.
  statics: {
    builder: { hpMax: 5000000, mana: 0, armorValue: 0, armorType: "none", attack: null, moveSpeedU: 522, collisionU: 16, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    spawnedBuilding: { hpMax: 100, mana: 0, armorValue: 0, armorType: "fort", attack: null, moveSpeedU: 0, collisionU: 0, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    marker: { hpMax: 100, mana: 0, armorValue: 0, armorType: "none", attack: null, moveSpeedU: 0, collisionU: 0, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    dummy: { hpMax: 2, mana: 0, armorValue: 0, armorType: "none", attack: null, moveSpeedU: 0, collisionU: 0, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    tester: { hpMax: 5000000, mana: 0, armorValue: 0, armorType: "hero", attack: null, moveSpeedU: 522, collisionU: 16, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0, heroAttrs: { str: 100, agi: 1, int: 10 } },
    eventBoss: { hpMax: 150000, mana: 0, armorValue: 0, armorType: "hero", attack: null, moveSpeedU: 522, collisionU: 16, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    specialCreep: { hpMax: 120, mana: 0, armorValue: 0, armorType: "none", attack: null, moveSpeedU: 400, collisionU: 16, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    lowestGem: { hpMax: 100, mana: 0, armorValue: 0, armorType: "fort", attack: { dmgBase: 11, dmgSpread: 3, cooldownTicks: 20, rangeU: 600, acquireU: 680, attackType: "normal", targetsMask: 3 }, moveSpeedU: 0, collisionU: 0, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    // G-2(GEM_IDENTITY_MINE_DESIGN §2.1/§3.1) — 광산(h01V, hbla 리모델). hp=100 실측(special_units.json).
    // armorValue/armorType은 base(hbla) 상속치가 dissection 데이터에 없어(clean-room 공백) 자체값 0/none —
    // attack=null(광산 자신은 비공격, 크립이 이 유닛을 때리는 쪽 — §3.1 step2, G-2 슬라이스에서 배선 예정).
    mine: { hpMax: 100, mana: 0, armorValue: 0, armorType: "none", attack: null, moveSpeedU: 0, collisionU: 0, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
    // R-3 W-2(DISPATCH_SONNET_R3_WIRING §2) — docs/dissection/gems_special.json classification:"gem" 특수
    // named 젬(uupt 조합 그래프, 8라인 티어 타워와 별개) 공통 baseline. dmgBase가 유닛마다 전부 달라
    // 공유 attack이 없다(lowestGem과 차이점) — 등재 19종 전원이 overrides에서 자체 attack을 제공하므로
    // baseline attack은 null(마커/더미류와 동일 패턴, 실사용 안 됨).
    specialGem: { hpMax: 100, mana: 0, armorValue: 0, armorType: "fort", attack: null, moveSpeedU: 0, collisionU: 0, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
  },

  // 시딩 산출물(오프라인 프로브 → 작가 검수 대상, 설계 §4.1). 크립 50 + 타워 32 + 특수 13.
  roleTable: {
    // ---- 크립: b[1..50] (웨이브 테이블 실측) ----
    h00D: { kind: "creep", band: "ground", wave: 1 },
    h00Z: { kind: "creep", band: "ground", wave: 2 },
    h010: { kind: "creep", band: "ground", wave: 3 },
    h011: { kind: "creep", band: "flying", wave: 4 },
    h012: { kind: "creep", band: "ground", wave: 5 },
    h013: { kind: "creep", band: "ground", wave: 6 },
    h01C: { kind: "creep", band: "ground", wave: 7 },
    h01D: { kind: "creep", band: "flying", wave: 8 },
    h01E: { kind: "creep", band: "ground", wave: 9 },
    h01F: { kind: "creep", band: "boss", wave: 10 },
    h01G: { kind: "creep", band: "ground", wave: 11 },
    h01H: { kind: "creep", band: "flying", wave: 12 },
    h01I: { kind: "creep", band: "ground", wave: 13 },
    h01J: { kind: "creep", band: "ground", wave: 14 },
    h01K: { kind: "creep", band: "boss", wave: 15 },
    h01L: { kind: "creep", band: "flying", wave: 16 },
    h02I: { kind: "creep", band: "ground", wave: 17 },
    h037: { kind: "creep", band: "ground", wave: 18 },
    h038: { kind: "creep", band: "ground", wave: 19 },
    h01R: { kind: "creep", band: "boss", wave: 20 },
    h039: { kind: "creep", band: "ground", wave: 21 },
    h03A: { kind: "creep", band: "ground", wave: 22 },
    h03B: { kind: "creep", band: "ground", wave: 23 },
    h01X: { kind: "creep", band: "flying", wave: 24 },
    h03C: { kind: "creep", band: "boss", wave: 25 },
    h03D: { kind: "creep", band: "ground", wave: 26 },
    h03E: { kind: "creep", band: "ground", wave: 27 },
    h021: { kind: "creep", band: "flying", wave: 28 },
    h03F: { kind: "creep", band: "ground", wave: 29 },
    h03G: { kind: "creep", band: "boss", wave: 30 },
    h03H: { kind: "creep", band: "ground", wave: 31 },
    h025: { kind: "creep", band: "flying", wave: 32 },
    h03I: { kind: "creep", band: "ground", wave: 33 },
    h03J: { kind: "creep", band: "ground", wave: 34 },
    h03K: { kind: "creep", band: "hell", wave: 35 },
    h02B: { kind: "creep", band: "flying", wave: 36 },
    h03L: { kind: "creep", band: "hell", wave: 37 },
    h03M: { kind: "creep", band: "hell", wave: 38 },
    h03N: { kind: "creep", band: "hell", wave: 39 },
    h02F: { kind: "creep", band: "flying", wave: 40 },
    h03O: { kind: "creep", band: "hell", wave: 41 },
    h03P: { kind: "creep", band: "hell", wave: 42 },
    h04K: { kind: "creep", band: "hell", wave: 43 },
    h04I: { kind: "creep", band: "flying", wave: 44 },
    h04L: { kind: "creep", band: "hell", wave: 45 },
    h04M: { kind: "creep", band: "hell", wave: 46 },
    h04N: { kind: "creep", band: "hell", wave: 47 },
    h04J: { kind: "creep", band: "flying", wave: 48 },
    h04O: { kind: "creep", band: "hell", wave: 49 },
    h04P: { kind: "creep", band: "hell", wave: 50 },
    // ---- 타워: mv[1..32] = 8색 × 4티어 (실측) ----
    h007: { kind: "tower", line: "amethyst", tier: 1 },
    h03S: { kind: "tower", line: "aquamarine", tier: 1 },
    h008: { kind: "tower", line: "diamond", tier: 1 },
    h009: { kind: "tower", line: "emerald", tier: 1 },
    h00A: { kind: "tower", line: "opal", tier: 1 },
    h00B: { kind: "tower", line: "sapphire", tier: 1 },
    h00C: { kind: "tower", line: "ruby", tier: 1 },
    e001: { kind: "tower", line: "topaz", tier: 1 },
    h00H: { kind: "tower", line: "amethyst", tier: 2 },
    h03R: { kind: "tower", line: "aquamarine", tier: 2 },
    h00I: { kind: "tower", line: "diamond", tier: 2 },
    h00J: { kind: "tower", line: "emerald", tier: 2 },
    h00K: { kind: "tower", line: "opal", tier: 2 },
    h00L: { kind: "tower", line: "sapphire", tier: 2 },
    h00M: { kind: "tower", line: "ruby", tier: 2 },
    e002: { kind: "tower", line: "topaz", tier: 2 },
    h00N: { kind: "tower", line: "amethyst", tier: 3 },
    h03U: { kind: "tower", line: "aquamarine", tier: 3 },
    h00O: { kind: "tower", line: "diamond", tier: 3 },
    h00S: { kind: "tower", line: "emerald", tier: 3 },
    h00P: { kind: "tower", line: "opal", tier: 3 },
    h00Q: { kind: "tower", line: "sapphire", tier: 3 },
    h00R: { kind: "tower", line: "ruby", tier: 3 },
    e003: { kind: "tower", line: "topaz", tier: 3 },
    h00V: { kind: "tower", line: "amethyst", tier: 4 },
    h03V: { kind: "tower", line: "aquamarine", tier: 4 },
    h00Y: { kind: "tower", line: "diamond", tier: 4 },
    h00U: { kind: "tower", line: "emerald", tier: 4 },
    h00X: { kind: "tower", line: "opal", tier: 4 },
    h00W: { kind: "tower", line: "sapphire", tier: 4 },
    h00T: { kind: "tower", line: "ruby", tier: 4 },
    e004: { kind: "tower", line: "topaz", tier: 4 },
    // ---- 특수(실측 §2.3): 빌더·생산건물·마커·더미·테스터·이벤트 보스·최하급 보석 ----
    u000: { kind: "static", archetype: "builder" },
    h006: { kind: "static", archetype: "spawnedBuilding" },
    n00B: { kind: "static", archetype: "marker" },
    n00D: { kind: "static", archetype: "marker" },
    h02E: { kind: "static", archetype: "dummy" },
    H036: { kind: "static", archetype: "tester" },
    H04B: { kind: "static", archetype: "tester" },
    h04Q: { kind: "static", archetype: "eventBoss" },
    h045: { kind: "static", archetype: "specialCreep" },
    h000: { kind: "static", archetype: "lowestGem" },
    h002: { kind: "static", archetype: "lowestGem" },
    h003: { kind: "static", archetype: "lowestGem" },
    h004: { kind: "static", archetype: "lowestGem" },
    // G-2: 광산 — 배치(CreateUnit 8기)·연구 호스트(ures=R000,R001)·크립 공격 대상화는 실맵 스크립트/G-2
    // 슬라이스가 소유(§3.1) — 여기서는 Def(hp100 등)만 정본화한다.
    h01V: { kind: "static", archetype: "mine" },
    // ---- R-3 W-2 + L-3b: gems_special.json classification:"gem" 28종 전원(R-3 19종 + L-3b 9종).
    // L-3b 9종(h01S/h028/h02J/h02Q/h050=atkType 원장 부재, h02K/h02R/h02W/h03Z=range 원장 부재)은
    // R-3 당시 발명 금지 원칙상 보류됐으나, L-3가 stock-defaults.ts(A-G12, hgtw/hctw 스톡값)로 그
    // 결손을 메워 이번 슬라이스에서 등재를 마감한다(overrides 쪽 attackType/rangeU 필드 참조) —
    // utility/unknown 7종과는 별개로 여전히 스코프 밖.
    h01P: { kind: "static", archetype: "specialGem" },
    h024: { kind: "static", archetype: "specialGem" },
    h026: { kind: "static", archetype: "specialGem" },
    h02A: { kind: "static", archetype: "specialGem" },
    h02D: { kind: "static", archetype: "specialGem" },
    h02L: { kind: "static", archetype: "specialGem" },
    h02N: { kind: "static", archetype: "specialGem" },
    h02O: { kind: "static", archetype: "specialGem" },
    h02P: { kind: "static", archetype: "specialGem" },
    h02V: { kind: "static", archetype: "specialGem" },
    h033: { kind: "static", archetype: "specialGem" },
    h03Y: { kind: "static", archetype: "specialGem" },
    h04S: { kind: "static", archetype: "specialGem" },
    h04T: { kind: "static", archetype: "specialGem" },
    h04W: { kind: "static", archetype: "specialGem" },
    h04Y: { kind: "static", archetype: "specialGem" },
    h051: { kind: "static", archetype: "specialGem" },
    h052: { kind: "static", archetype: "specialGem" },
    n00H: { kind: "static", archetype: "specialGem" },
    // 2026-10-16: source-granted A00R normal path yields h03X; h01B was another missing result.
    // Explicit special overrides are the existing D-6 extension, not a global stat-mode switch.
    h03X: { kind: "static", archetype: "specialGem" },
    h01A: {kind:"static",archetype:"specialGem"},
    n009: {kind:"static",archetype:"specialGem"},
    n00E: {kind:"static",archetype:"specialGem"},
    h016: { kind: "static", archetype: "specialGem" }, // source uaen=0: Star Ruby uses A00H permanent immolation, not a fabricated normal attack.
    h01B: { kind: "static", archetype: "specialGem" },
    // ---- L-3b: R-3 DEFERRED 9종 등재 마감(위 주석 참조 — atkType/range 스톡 폴백은 overrides에서). ----
    h01S: { kind: "static", archetype: "specialGem" },
    h028: { kind: "static", archetype: "specialGem" },
    h02J: { kind: "static", archetype: "specialGem" },
    h02K: { kind: "static", archetype: "specialGem" },
    h02Q: { kind: "static", archetype: "specialGem" },
    h02R: { kind: "static", archetype: "specialGem" },
    h02W: { kind: "static", archetype: "specialGem" },
    h03Z: { kind: "static", archetype: "specialGem" },
    h050: { kind: "static", archetype: "specialGem" },
    // ---- L-3c: towers_full.json beyondGrid 23종 중 미등재 18종(h000/h002/h003/h004=lowestGem·h006=
    // spawnedBuilding은 이미 등재됨) — tier0 8라인 + 퍼펙트(5티어) 8라인 + 특수 named 2종. 전 필드가
    // 원장에 있는 항목은 그대로, 원장 공백 3종(h02X atkType·h02Z/h032 range, 전부 hgtw 스톡)만
    // overrides에서 stockDefault 폴백을 쓴다.
    // ③Gate 마감 2026-07-20(오케스트레이터): h005(최하급 루비, hctw)는 cd 결손으로 L-3가 보류했으나,
    // Blizzard 공식 건물 상세 페이지에서 hctw Cooldown=2.5s 1차 출처를 확보해 stock-defaults.ts에
    // cooldownSec을 확장 → 결손이 해소되어 등재한다(추측 아님, 출처는 stock-defaults.ts 헤더).
    // h00G(base=hgtw이지만 이름 "바위"·공격 필드 전무 — 젬/타워 분류 불명확)는 **여전히 보류** —
    // G-2a 오분류 사고(타워가 아군 사살) 재발 방지가 등재 편의보다 우선(RETURN_L3.md §⑧).
    h005: { kind: "static", archetype: "specialGem" },
    h001: { kind: "static", archetype: "specialGem" },
    e000: { kind: "static", archetype: "specialGem" },
    h03T: { kind: "static", archetype: "specialGem" },
    h02S: { kind: "static", archetype: "specialGem" },
    h02T: { kind: "static", archetype: "specialGem" },
    h02X: { kind: "static", archetype: "specialGem" },
    h02Y: { kind: "static", archetype: "specialGem" },
    h02Z: { kind: "static", archetype: "specialGem" },
    h030: { kind: "static", archetype: "specialGem" },
    h031: { kind: "static", archetype: "specialGem" },
    h032: { kind: "static", archetype: "specialGem" },
    e005: { kind: "static", archetype: "specialGem" },
    e006: { kind: "static", archetype: "specialGem" },
    h04A: { kind: "static", archetype: "specialGem" },
    h03W: { kind: "static", archetype: "specialGem" },
    h01Q: { kind: "static", archetype: "specialGem" },
  },

  // 곡선 이탈 보정(설계 §3.3·A-B7): 하이브리드 20 · 비단조 quirk 49/50 · 테스터 B · 최하급 4종 개별화.
  // G-2a(DISPATCH_SONNET_G2_CORE §2) 추가: 크립 50종 전원에 광산 공격용 attack 시딩 — waves_full.json
  // 실측(attack.base — 곡선 아닌 웨이브별 원시 표, 45웨이브=49 / 5웨이브=5: 7·14·21·35·42). h01R/h04O/h04P는
  // 기존 hp 오버라이드 항목에 attack만 병합(중복 키 방지). cooldownTicks/rangeU/acquireU/attackType은
  // MINE_ATTACK_* 자체값(A-G6~A-G8, 위 상수 선언부 참조) 공통 적용.
  overrides: {
    // Local 1.28.5.7680 source: w3u h03X/h01B + inherited UnitWeapons.slk dice1=1.
    // UnitWeapons.slk SHA-256: 03c9cbc02d703cf5f8b5b1ed4da789ffcf733aff44f8e2f70b7937e4de613b33.
    // side1=1 makes damage constant (raw bonus 21/170 + one die => 22/171).
    // Caller-local w3u deltas + inherited hctw dice1=1 (UnitWeapons SHA above).
    // h01A keeps artillery splash; instant n009 has no splash despite dormant radius fields.
    h01A: {attack:{dmgBase:46,dmgSpread:1,cooldownTicks:30,rangeU:600,acquireU:600,attackType:"spells",targetsMask:3,splash:{fullU:249,halfU:250,quarterU:251,targetsMask:1}}},
    n009: {attack:{dmgBase:100,dmgSpread:0,cooldownTicks:30,rangeU:300,acquireU:300,attackType:"magic",targetsMask:3}},
    n00E: {attack:{dmgBase:100,dmgSpread:0,cooldownTicks:16,rangeU:600,acquireU:600,attackType:"hero",targetsMask:3}},
    h03X: { attack: { dmgBase: 22, dmgSpread: 0, cooldownTicks: 20, rangeU: 500, acquireU: 500, attackType: "siege", targetsMask: 3 } },
    h01B: { goldCost: 400, attack: { dmgBase: 171, dmgSpread: 0, cooldownTicks: 20, rangeU: 800, acquireU: 800, attackType: "pierce", targetsMask: 3 } },
    h01R: { hpMax: 7500, moveSpeedU: 280, attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } }, // wave 20: 보스 이름·현상금 + 비행 저속(하이브리드) + G-2a 광산공격
    h04O: { hpMax: 3000000, attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } }, // wave 49: 원작 비단조 스파이크(직전보다 낮음) + G-2a
    h04P: { hpMax: 4400000, attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } }, // wave 50: 최종 웨이브 완만화(원작 authored) + G-2a
    H04B: { hpMax: 7000000 },
    h000: { attack: { dmgBase: 15, dmgSpread: 0, cooldownTicks: 36, rangeU: 600, acquireU: 680, attackType: "normal", targetsMask: 3 } },
    h002: { attack: { dmgBase: 6, dmgSpread: 4, cooldownTicks: 20, rangeU: 500, acquireU: 580, attackType: "siege", targetsMask: 3 } },
    h003: { attack: { dmgBase: 5, dmgSpread: 1, cooldownTicks: 20, rangeU: 700, acquireU: 780, attackType: "magic", targetsMask: 3 } },
    h004: { attack: { dmgBase: 17, dmgSpread: 6, cooldownTicks: 20, rangeU: 800, acquireU: 880, attackType: "pierce", targetsMask: 3 } },
    // ---- G-2a: 크립 50종 광산 공격 시딩(waves_full.json attack.base 실측, h01R/h04O/h04P는 위에서 병합됨) ----
    h00D: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h00Z: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h010: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h011: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h012: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h013: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01C: { attack: { dmgBase: 5, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01D: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01E: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01F: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01G: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01H: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01I: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01J: { attack: { dmgBase: 5, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01K: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01L: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h02I: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h037: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h038: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h039: { attack: { dmgBase: 5, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03A: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03B: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h01X: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03C: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03D: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03E: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h021: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03F: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03G: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03H: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h025: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03I: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03J: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03K: { attack: { dmgBase: 5, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h02B: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03L: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03M: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03N: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h02F: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03O: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h03P: { attack: { dmgBase: 5, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h04K: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h04I: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h04L: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h04M: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h04N: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    h04J: { attack: { dmgBase: 49, dmgSpread: 0, cooldownTicks: MINE_ATTACK_COOLDOWN_TICKS, rangeU: MINE_ATTACK_RANGE_U, acquireU: MINE_ATTACK_ACQUIRE_U, attackType: MINE_ATTACK_TYPE, targetsMask: 3 } },
    // ---- R-3 W-2: 특수 named 젬 19종 attack/hp/gold(원장 gems_special.json 그대로, 발명 0) ----
    // cd(초)→cooldownTicks: secondsToTicks(=round(초/DT), DT=1/20) 1회 수동 계산(config 순수 리터럴
    // 규율, A-G6 선례와 동일 — config에 함수호출 금지). dmgSpread=원장 "sides" 값 그대로(h000~h004
    // lowestGem 선례와 동일 매핑 — "dice" 필드는 이 엔진 AttackSpec에 대응 필드가 없어 그 선례처럼 미사용).
    // acquireU=원장 acquireRange 실측치(h02A/h033/n00H만 보유) 우선, 없으면 rangeU+80(전 towerLines의
    // acquireBonusU:80·h000~h004 전원과 동일한 기존 상수 재사용 — 새 값 발명 아님).
    h01P: { goldCost: 2500, attack: { dmgBase: 4499, dmgSpread: 1, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: "spells", targetsMask: 3, splash: { fullU: 0, halfU: 0, quarterU: 0 } } },
    h024: { goldCost: 1100, attack: { dmgBase: 880, dmgSpread: 1, cooldownTicks: 20, rangeU: 900, acquireU: 980, attackType: "magic", targetsMask: 3 } },
    h026: { goldCost: 450, attack: { dmgBase: 518, dmgSpread: 1, cooldownTicks: 16, rangeU: 900, acquireU: 980, attackType: "spells", targetsMask: 3, splash: { fullU: 600, halfU: 600, quarterU: 600 } } },
    h02A: { goldCost: 2400, attack: { dmgBase: 4999, dmgSpread: 1, cooldownTicks: 16, rangeU: 1200, acquireU: 1000, attackType: "spells", targetsMask: 3, splash: { fullU: 1199, halfU: 1200, quarterU: 1200 } } },
    h02D: { goldCost: 1200, attack: { dmgBase: 549, dmgSpread: 1, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: "magic", targetsMask: 3 } },
    h02L: { goldCost: 25, attack: { dmgBase: 134, dmgSpread: 1, cooldownTicks: 16, rangeU: 600, acquireU: 680, attackType: "magic", targetsMask: 3 } },
    h02N: { goldCost: 350, attack: { dmgBase: 149, dmgSpread: 1, cooldownTicks: 4, rangeU: 550, acquireU: 630, attackType: "magic", targetsMask: 3 } },
    h02O: { goldCost: 25, attack: { dmgBase: 102, dmgSpread: 1, cooldownTicks: 26, rangeU: 700, acquireU: 780, attackType: "spells", targetsMask: 3, splash: { fullU: 249, halfU: 250, quarterU: 251 } } },
    h02P: { goldCost: 1200, attack: { dmgBase: 2999, dmgSpread: 1, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: "normal", targetsMask: 3 } },
    h02V: { goldCost: 700, attack: { dmgBase: 699, dmgSpread: 51, cooldownTicks: 16, rangeU: 800, acquireU: 880, attackType: "siege", targetsMask: 3 } },
    h033: { goldCost: 150, attack: { dmgBase: 230, dmgSpread: 1, cooldownTicks: 20, rangeU: 700, acquireU: 700, attackType: "spells", targetsMask: 3, splash: { fullU: 300, halfU: 300, quarterU: 300 } } },
    // splash 원장 half/qtr=null(부분 관측, full=400만 실측) — 완전한 SplashSpec 구성 불가해 발명 대신 splash 미부여.
    h03Y: { goldCost: 25, attack: { dmgBase: 48, dmgSpread: 1, cooldownTicks: 20, rangeU: 600, acquireU: 680, attackType: "siege", targetsMask: 3 } },
    h04S: { goldCost: 1500, hpMax: 1000, attack: { dmgBase: 705, dmgSpread: 1, cooldownTicks: 14, rangeU: 800, acquireU: 880, attackType: "chaos", targetsMask: 3 } },
    h04T: { goldCost: 2500, hpMax: 1000, attack: { dmgBase: 4499, dmgSpread: 1, cooldownTicks: 7, rangeU: 1000, acquireU: 1080, attackType: "chaos", targetsMask: 3, splash: { fullU: 499, halfU: 500, quarterU: 500 } } },
    h04W: { goldCost: 1800, attack: { dmgBase: 1499, dmgSpread: 51, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: "siege", targetsMask: 3 } },
    h04Y: { goldCost: 900, attack: { dmgBase: 999, dmgSpread: 1, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: "magic", targetsMask: 3 } },
    h051: { goldCost: 300, attack: { dmgBase: 550, dmgSpread: 1, cooldownTicks: 20, rangeU: 800, acquireU: 880, attackType: "normal", targetsMask: 3 } },
    h052: { goldCost: 1100, attack: { dmgBase: 999, dmgSpread: 1, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: "spells", targetsMask: 3, splash: { fullU: 999, halfU: 1000, quarterU: 1000 } } },
    n00H: { goldCost: 3500, hpMax: 1000, attack: { dmgBase: 5999, dmgSpread: 1, cooldownTicks: 10, rangeU: 1000, acquireU: 1400, attackType: "spells", targetsMask: 3 } },
    // ---- L-3b: R-3 DEFERRED 9종 등재 마감. attackType/rangeU 중 원장에 없는 필드만 STOCK_H*
    // 상수(A-G12, configs/stock-defaults.ts 단일 격리 지점) 폴백 — 나머지 필드는 원장 그대로(발명 0).
    h01S: { goldCost: 2600, attack: { dmgBase: 3999, dmgSpread: 1, cooldownTicks: 14, rangeU: 1500, acquireU: 1580, attackType: STOCK_HGTW_ATKTYPE, targetsMask: 3, splash: { fullU: 700, halfU: 700, quarterU: 700 } } },
    h028: { goldCost: 450, attack: { dmgBase: 243, dmgSpread: 1, cooldownTicks: 16, rangeU: 750, acquireU: 830, attackType: STOCK_HCTW_ATKTYPE, targetsMask: 3, splash: { fullU: 0, halfU: 0, quarterU: 0 } } },
    h02J: { goldCost: 300, attack: { dmgBase: 280, dmgSpread: 51, cooldownTicks: 14, rangeU: 850, acquireU: 930, attackType: STOCK_HGTW_ATKTYPE, targetsMask: 3 } },
    h02K: { goldCost: 450, attack: { dmgBase: 201, dmgSpread: 1, cooldownTicks: 20, rangeU: STOCK_HGTW_RANGE_U, acquireU: STOCK_HGTW_ACQUIRE_U, attackType: "magic", targetsMask: 3 } },
    h02Q: { goldCost: 600, attack: { dmgBase: 875, dmgSpread: 1, cooldownTicks: 14, rangeU: 1000, acquireU: 1080, attackType: STOCK_HGTW_ATKTYPE, targetsMask: 3 } },
    h02R: { goldCost: 300, attack: { dmgBase: 230, dmgSpread: 1, cooldownTicks: 20, rangeU: STOCK_HCTW_RANGE_U, acquireU: STOCK_HCTW_ACQUIRE_U, attackType: "spells", targetsMask: 3, splash: { fullU: 399, halfU: 400, quarterU: 401 } } },
    h02W: { goldCost: 150, attack: { dmgBase: 383, dmgSpread: 1, cooldownTicks: 20, rangeU: STOCK_HCTW_RANGE_U, acquireU: STOCK_HCTW_ACQUIRE_U, attackType: "pierce", targetsMask: 3, splash: { fullU: 0, halfU: 0, quarterU: 0 } } },
    // splash 원장 full=99만 실측, half/qtr=null(부분 관측) — h033 선례와 동일하게 완전한 SplashSpec 불가해 splash 미부여.
    h03Z: { goldCost: 150, attack: { dmgBase: 108, dmgSpread: 1, cooldownTicks: 20, rangeU: STOCK_HGTW_RANGE_U, acquireU: STOCK_HGTW_ACQUIRE_U, attackType: "siege", targetsMask: 3 } },
    h050: { goldCost: 1500, attack: { dmgBase: 1292, dmgSpread: 1, cooldownTicks: 14, rangeU: 900, acquireU: 980, attackType: STOCK_HGTW_ATKTYPE, targetsMask: 3 } },
    // ---- L-3c: towers_full.json beyondGrid 18종(tier0 8라인 + 퍼펙트 8라인 + 특수 named 2종).
    // h02X만 atkType 원장 공백(STOCK_HGTW_ATKTYPE 폴백), h02Z/h032만 range 원장 공백(STOCK_HGTW_*
    // 폴백) — 나머지 필드·유닛은 towers_full.json beyondGrid 값 그대로(발명 0).
    // h005(최하급 루비, hctw) — 원장 실측: dmgBase(ua1b)=24 · dmgSpread(ua1s)=2 · attackType(ua1t)=hero ·
    // splash(ua1f/ua1h/ua1q)=150/175/200 · hp=100. 결손 2필드만 stock-defaults(hctw): rangeU=800,
    // cooldownTicks=50(=2.5s ÷ DT 1/20). acquireU는 프로젝트 관례 rangeU+80.
    h005: { attack: { dmgBase: 24, dmgSpread: 2, cooldownTicks: 50, rangeU: 800, acquireU: 880, attackType: "hero", targetsMask: 3, splash: { fullU: 150, halfU: 175, quarterU: 200 } } },
    h001: { attack: { dmgBase: 7, dmgSpread: 4, cooldownTicks: 30, rangeU: 550, acquireU: 630, attackType: "spells", targetsMask: 3 } },
    e000: { attack: { dmgBase: 9, dmgSpread: 1, cooldownTicks: 20, rangeU: 400, acquireU: 480, attackType: "chaos", targetsMask: 3 } },
    h03T: { attack: { dmgBase: 12, dmgSpread: 3, cooldownTicks: 6, rangeU: 300, acquireU: 380, attackType: "magic", targetsMask: 3 } },
    h02S: { goldCost: 2500, attack: { dmgBase: 1199, dmgSpread: 1, cooldownTicks: 10, rangeU: 900, acquireU: 980, attackType: "hero", targetsMask: 3, splash: { fullU: 0, halfU: 0, quarterU: 0 } } },
    h02T: { goldCost: 1500, attack: { dmgBase: 499, dmgSpread: 1, cooldownTicks: 14, rangeU: 1000, acquireU: 1080, attackType: "hero", targetsMask: 3, splash: { fullU: 0, halfU: 0, quarterU: 0 } } },
    h02X: { attack: { dmgBase: 440, dmgSpread: 1, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: STOCK_HGTW_ATKTYPE, targetsMask: 3 } },
    h02Y: { attack: { dmgBase: 420, dmgSpread: 1, cooldownTicks: 16, rangeU: 1000, acquireU: 1080, attackType: "hero", targetsMask: 3, splash: { fullU: 0, halfU: 0, quarterU: 0 } } },
    h02Z: { attack: { dmgBase: 360, dmgSpread: 1, cooldownTicks: 16, rangeU: STOCK_HGTW_RANGE_U, acquireU: STOCK_HGTW_ACQUIRE_U, attackType: "spells", targetsMask: 3 } },
    h030: { attack: { dmgBase: 200, dmgSpread: 1, cooldownTicks: 10, rangeU: 900, acquireU: 980, attackType: "magic", targetsMask: 3 } },
    h031: { attack: { dmgBase: 380, dmgSpread: 1, cooldownTicks: 16, rangeU: 800, acquireU: 880, attackType: "normal", targetsMask: 3 } },
    h032: { attack: { dmgBase: 240, dmgSpread: 1, cooldownTicks: 16, rangeU: STOCK_HGTW_RANGE_U, acquireU: STOCK_HGTW_ACQUIRE_U, attackType: "siege", targetsMask: 3 } },
    e005: { attack: { dmgBase: 200, dmgSpread: 1, cooldownTicks: 16, rangeU: 600, acquireU: 680, attackType: "chaos", targetsMask: 3 } },
    e006: { goldCost: 200, attack: { dmgBase: 149, dmgSpread: 1, cooldownTicks: 16, rangeU: 500, acquireU: 580, attackType: "hero", targetsMask: 3 } },
    h04A: { goldCost: 1000, hpMax: 1000, attack: { dmgBase: 799, dmgSpread: 1, cooldownTicks: 26, rangeU: 900, acquireU: 980, attackType: "spells", targetsMask: 3, splash: { fullU: 1000, halfU: 1000, quarterU: 1000 } } },
    h03W: { attack: { dmgBase: 300, dmgSpread: 1, cooldownTicks: 4, rangeU: 500, acquireU: 580, attackType: "magic", targetsMask: 3 } },
    h01Q: { goldCost: 777, attack: { dmgBase: 300, dmgSpread: 1, cooldownTicks: 30, rangeU: 300, acquireU: 380, attackType: "magic", targetsMask: 3, splash: { fullU: 300, halfU: 300, quarterU: 300 } } },
  },

  difficultyPresets: {
    easy: { hpPm: 700, bountyPm: 1200, speedAddU: -20 },
    normal: { hpPm: 1000, bountyPm: 1000, speedAddU: 0 },
    hard: { hpPm: 1300, bountyPm: 900, speedAddU: 15 },
  },
  defaultPreset: "normal",
  // 2026-10-19 user-approved AD-E1 correction: source explicitly enables native bounty.
  // wee's dR branch handles treasure bosses, not ordinary per-creep gold.
  bountyMode: "source", // AD-E1(2026-07-13) — 실맵 wee/dR가 지급하므로 엔진 이중지급 금지.
  life: {
    mode: "observe",
    lifeMode: "individual",
    startingLives: 5,
    survivalTimeoutTicks: null,
    creepOwners: [11],
    // MOVEMENT §2.2: 64x64 gate rects, lane registration order P1..P8.
    leakGateRects: [
      { id: "Do", playerId: 0, minX: -288, minY: 4448, maxX: -224, maxY: 4512 },
      { id: "fo", playerId: 1, minX: 224, minY: 4448, maxX: 288, maxY: 4512 },
      { id: "Fo", playerId: 2, minX: 4704, minY: -32, maxX: 4768, maxY: 32 },
      { id: "go", playerId: 3, minX: 4704, minY: -544, maxX: 4768, maxY: -480 },
      { id: "Go", playerId: 4, minX: 224, minY: -5024, maxX: 288, maxY: -4960 },
      { id: "ho", playerId: 5, minX: -288, minY: -5024, maxX: -224, maxY: -4960 },
      { id: "Ho", playerId: 6, minX: -4768, minY: -544, maxX: -4704, maxY: -480 },
      { id: "jo", playerId: 7, minX: -4768, minY: -32, maxX: -4704, maxY: 32 },
    ],
  },
  fallback: { hpMax: 1, mana: 0, armorValue: 0, armorType: "none", attack: null, moveSpeedU: 0, collisionU: 0, goldCost: 0, bountyBase: 0, bountySpreadPm: 0, regenPmPerSec: 0 },
  // G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c, A-G1) — w3q 실측 base(레벨1 골드 비용).
  // R000 보석 질 향상(호스트 h01V) · R001 찬스 확률 향상(호스트 h01V) · R002 천국의 보석(호스트 h01Q).
  // R-1(DISPATCH_SONNET_R1_RESEARCH_FIX §2, docs/dissection/upgrades.json misalignmentFindings) 교정:
  //   C-1: R000 gglm=30은 맵에 명시. R001은 baseRhac의 1.28 UpgradeData.goldmod=25를 상속한다.
  //        이전 구현은 w3q 변경분 부재를0으로 오해했다(P19 원작/stock 교차 대조, 2026-10-19).
  //        R002는 baseRhan의 goldmod=0 상속. 기존 researchCostForLevel 경로만 사용한다.
  //   C-2: R001만 w3q "greq"=R000/"grqc"=8(전 레벨 공통) 실측 — requires로 표현. R000/R002는 greq 필드
  //        부재(테크트리 의존성 없음).
  researches: {
    R000: { costPerLevel: 20, maxLevel: 8, costIncrementPerLevel: 30 },
    R001: { costPerLevel: 50, maxLevel: 5, costIncrementPerLevel: 25, requires: { techId: "R000", count: 8 } },
    R002: { costPerLevel: 500, maxLevel: 2 },
  },
};

/** Local single-player host: source config declares eight human lanes; NPC controllers remain map-owned. */
export const GEMTOWER_SOLO_SLOTS = Array.from({length: 8}, (_, playerId) => ({playerId, state: playerId === 0 ? 1 : 0}));
