/**
 * G-1(GEM_IDENTITY_MINE_DESIGN §5.1) — 트리거 특수 대미지 슬라이스 검증.
 * ① Sim.applyTriggerDamage 단위 검증(공식 재사용·ENHANCED 유형 배율 적용·수치 방어 미적용·사망 정산·killerUnitId).
 * ② VM 통합: EVENT_PLAYER_UNIT_ATTACKED 구독 → GetTriggerUnit()=피격자·GetAttacker()=공격자 →
 *    UnitDamageTargetBJ가 엔진 대미지와 "별도로" 추가 적용됨을 실측(같은 틱, 엔진 dmg만으론 죽지 않는 크립이
 *    트리거뎀까지 더해져 죽는 시나리오 — done-gate 문구 그대로).
 * ③ userData 승계 검증(§5.5 "RM-1 네이티브로 충분, 신규 엔진 코드 불요") — 합성 조합 시나리오(수기 검산).
 * 합성 JASS 소스만 사용(clean-room — 실맵 원문 인용 없음).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJass } from "../../../src/jass/parser.ts";
import { JassVm, vint, vreal } from "../../../src/jass/vm.ts";
import { Sim } from "../../../src/sim/sim.ts";
import { DefStore } from "../../../src/sim/def-store.ts";
import { installNatives } from "../../../src/jass/natives/index.ts";
import { installCombat } from "../../../src/sim/combat-system.ts";
import { createEntity } from "../../../src/sim/unit-entity.ts";
import type { GameConstants } from "../../../src/sim/balance/config.ts";
import type { DefaultsProvider, UnitDefDefaults } from "../../../src/sim/balance/provider.ts";
import { makeSyntheticIr } from "../../sim/helpers.ts";

// ── ① Sim.applyTriggerDamage 단위 검증 ──────────────────────────────────────
describe("sim/applyTriggerDamage — G-1 트리거 대미지 진입점", () => {
  const armorTarget: UnitDefDefaults = {
    hpMax: 1000,
    mana: 0,
    armorValue: 10,
    armorType: "flesh",
    attack: null,
    moveSpeedU: 0,
    collisionU: 0,
    goldCost: 0,
    bounty: { base: 0, spreadPm: 0 },
    regenPmPerSec: 0,
    meta: { role: { kind: "static", archetype: "test" }, source: "formula" },
  };
  // normal→flesh 배율 500‰(50%) — Enhanced도 유형 배율을 유지한다. 이 옛 fixture는 두 잘못된 축이 수치상 상쇄되므로 source-damage-types.test가 별도 행렬로 검증한다.
  const gc: GameConstants = { armorFactorPm: 100, strHitPointBonus: 0, agiDefenseBonusPm: 0, intManaBonusPm: 0, damageBonusPm: { normal: { flesh: 500 } } };

  function setup(): Sim {
    const sim = new Sim(makeSyntheticIr(), 1);
    const provider: DefaultsProvider = { resolve: () => armorTarget };
    sim.defStore = new DefStore(provider);
    sim.gc = gc;
    return sim;
  }

  it("ignoreArmorValue=false(일반): typeBonusPm(500‰) 적용 후 armorValue 감산 — balance/combat.ts damageAfterDefense와 동일 결과", () => {
    const sim = setup();
    const def = sim.defStore!.getDef("TARG");
    sim.spawnUnit(createEntity(def, { id: 1, owner: 12, x: 0, y: 0, facing: 0 }));
    // roll=100: typed=floor(100*500/1000)=50, dealt=floor(50*1000/(1000+100*10))=floor(50000/2000)=25
    const result = sim.applyTriggerDamage(1, 99, 100, "normal", false);
    assert.equal(result.applied, true);
    assert.equal(result.dealt, 25);
    assert.equal(sim.getUnit(1)!.hp, 1000 - 25);
  });

  it("DAMAGE_TYPE_ENHANCED: 유형 배율 유지, 수치 방어 미적용", () => {
    const sim = setup();
    const def = sim.defStore!.getDef("TARG");
    sim.spawnUnit(createEntity(def, { id: 1, owner: 12, x: 0, y: 0, facing: 0 }));
    // Source correction: 100*0.5 = 50; numeric armor is bypassed.
    const result = sim.applyTriggerDamage(1, 99, 100, "normal", true);
    assert.equal(result.dealt, 50);
    assert.ok(result.dealt < 100, "type ratio remains active even when numeric defense is bypassed");
  });

  it("사망 정산: hp<=0 → alive=false·removeUnit·UnitDied emit(killerUnitId=attackerId)", () => {
    const sim = setup();
    const def = sim.defStore!.getDef("TARG");
    sim.spawnUnit(createEntity(def, { id: 5, owner: 12, x: 0, y: 0, facing: 0 }));
    sim.getUnit(5)!.hp = 10; // 즉사시킬 만큼만 남긴다
    const result = sim.applyTriggerDamage(5, 42, 999999, "normal", true);
    assert.equal(result.died, true);
    assert.equal(sim.getUnit(5), undefined, "removeUnit으로 레지스트리에서 제거돼야 함");
    const events = sim.drainEvents();
    const died = events.filter((e) => e.kind === "UnitDied");
    assert.equal(died.length, 1);
    assert.equal((died[0] as { unitId: number }).unitId, 5);
    assert.equal((died[0] as { killerUnitId?: number }).killerUnitId, 42);
  });

  it("미주입(gc/defStore 없음) 또는 대상 부재/사망 시 안전한 no-op(applied=false)", () => {
    const bare = new Sim(makeSyntheticIr(), 1); // gc/defStore 미주입
    assert.equal(bare.applyTriggerDamage(1, null, 100, "normal", false).applied, false);

    const sim = setup();
    assert.equal(sim.applyTriggerDamage(999, null, 100, "normal", false).applied, false, "존재하지 않는 대상");
  });
});

// ── ② VM 통합: ATTACKED 이벤트 → UnitDamageTargetBJ가 엔진 대미지와 별도로 적용 ──────────────
function makeTowerCreepProvider(creepHp: number): DefaultsProvider {
  return {
    resolve(typeId): UnitDefDefaults {
      if (typeId === "TOWR") {
        return {
          hpMax: 100, mana: 0, armorValue: 0, armorType: "none",
          attack: { dmgBase: 3, dmgSpread: 0, cooldownTicks: 1, rangeU: 500, acquireU: 500, attackType: "normal", targetsMask: 3 },
          moveSpeedU: 0, collisionU: 0, goldCost: 0, bounty: { base: 0, spreadPm: 0 }, regenPmPerSec: 0,
          meta: { role: { kind: "tower", line: "test", tier: 1 }, source: "formula" },
        };
      }
      return {
        hpMax: creepHp, mana: 0, armorValue: 0, armorType: "none", attack: null,
        moveSpeedU: 0, collisionU: 0, goldCost: 0, bounty: { base: 0, spreadPm: 0 }, regenPmPerSec: 0,
        meta: { role: { kind: "creep", band: "test", wave: 1 }, source: "formula" },
      };
    },
  };
}

function setupAttacked(creepHp: number) {
  const src = [
    "globals",
    "    unit g_tower = null",
    "    unit g_creep = null",
    "    integer g_attackedCount = 0",
    "    boolean g_attackerIsTower = false",
    "    boolean g_victimIsCreep = false",
    "endglobals",
    "function OnAttacked takes nothing returns nothing",
    "    set g_attackedCount = g_attackedCount + 1",
    "    set g_attackerIsTower = (GetAttacker() == g_tower)",
    "    set g_victimIsCreep = (GetTriggerUnit() == g_creep)",
    // G-1 핵심 배선: 명중할 때마다 엔진 대미지와 별개로 트리거 대미지를 추가한다(설계 §5.1 원본 9사이트와 동형).
    "    call UnitDamageTargetBJ(GetAttacker(), GetTriggerUnit(), 4, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL)",
    "endfunction",
    "function Setup takes nothing returns nothing",
    "    local trigger t = CreateTrigger()",
    "    call TriggerRegisterPlayerUnitEventSimple(t, Player(12), 3)", // 3=EVENT_PLAYER_UNIT_ATTACKED(triggers.ts 선등록)
    "    call TriggerAddAction(t, function OnAttacked)",
    "endfunction",
    "function Spawn takes nothing returns nothing",
    "    set g_tower = CreateUnit(Player(0), 'TOWR', 0., 0., 0.)",
    "    set g_creep = CreateUnit(Player(12), 'CREE', 10., 0., 0.)",
    "endfunction",
  ].join("\n");
  const pr = parseJass(src);
  const vm = JassVm.fromParseResult(pr);
  const sim = new Sim(makeSyntheticIr(), 9);
  const defStore = new DefStore(makeTowerCreepProvider(creepHp));
  sim.defStore = defStore;
  vm.attachToSim(sim);
  const { registry } = installNatives(vm, sim);
  installCombat(sim, { defStore, gc: { armorFactorPm: 60, strHitPointBonus: 0, agiDefenseBonusPm: 0, intManaBonusPm: 0 }, ledger: sim.ledger, bountyMode: "engine", minDamage: 1 });
  return { vm, sim, registry };
}

describe("gem-identity G-1: EVENT_PLAYER_UNIT_ATTACKED → UnitDamageTargetBJ(트리거뎀, 엔진뎀과 별도)", () => {
  it("① ATTACKED가 명중마다 발화하고 GetAttacker()=타워·GetTriggerUnit()=피격 크립이다", () => {
    const { vm, sim } = setupAttacked(1000); // 죽지 않을 만큼 넉넉한 hp
    vm.callFunctionSync("Setup", []);
    vm.callFunctionSync("Spawn", []);
    sim.step();
    assert.deepEqual(vm.getGlobal("g_attackedCount"), vint(1));
    assert.deepEqual(vm.getGlobal("g_attackerIsTower"), { t: "bool", v: true });
    assert.deepEqual(vm.getGlobal("g_victimIsCreep"), { t: "bool", v: true });
  });

  it("② 트리거 대미지가 엔진 대미지와 별도로(추가로) 적용된다 — 1틱 후 hp = hpMax - 엔진dmg(3) - 트리거dmg(4)", () => {
    const { vm, sim } = setupAttacked(1000);
    vm.callFunctionSync("Setup", []);
    vm.callFunctionSync("Spawn", []);
    const creep = vm.getGlobal("g_creep") as { t: string; v: number };
    sim.step();
    const hp = sim.getUnit(creep.v)!.hp;
    assert.equal(hp, 1000 - 3 - 4, "엔진 attack(dmgBase=3) + 트리거 UnitDamageTargetBJ(4)가 각각 독립적으로 hp를 깎아야 한다");
  });

  it("③ 엔진 공격만으론 못 죽이는 크립이 트리거뎀까지 더해지면 같은 틱에 죽는다(사망은 트리거 경로가 정산)", () => {
    // hp=5: 엔진 3뎀으로는 생존(hp2), 트리거 4뎀이 더해지면 hp<=0 → 사망까지 같은 틱.
    const { vm, sim } = setupAttacked(5);
    vm.callFunctionSync("Setup", []);
    vm.callFunctionSync("Spawn", []);
    const creep = vm.getGlobal("g_creep") as { t: string; v: number };
    sim.step();
    assert.equal(sim.getUnit(creep.v), undefined, "트리거 대미지 사망 정산으로 sim에서 제거돼야 함");
    const events = sim.drainEvents();
    const died = events.filter((e) => e.kind === "UnitDied");
    assert.equal(died.length, 1, "엔진 경로(combat-pipe deathQueue)가 아닌 트리거 경로(applyTriggerDamage)의 단일 사망 정산");
    assert.equal((died[0] as { unitId: number }).unitId, creep.v);
  });
});

// ── ③ userData 승계 검증(§5.5) — 조합류 시나리오는 RM-1 기존 네이티브만으로 충분함을 합성 검산으로 확인 ──
describe("gem-identity G-1: userData 승계(§5.5 조합 — 신규 엔진 코드 불요, RM-1 네이티브로 충분)", () => {
  it("조합 시나리오(수기 검산): 두 젬의 userData(강화 스택)를 합산해 새 유닛에 승계 — SetUnitUserData/GetUnitUserData 왕복만으로 충분", () => {
    const src = [
      "globals",
      "    unit g_a = null",
      "    unit g_b = null",
      "    unit g_combined = null",
      "endglobals",
      "function Fill takes nothing returns nothing",
      "    set g_a = CreateUnit(Player(0), 'gemA', 0., 0., 0.)",
      "    set g_b = CreateUnit(Player(0), 'gemB', 0., 0., 0.)",
      "    call SetUnitUserData(g_a, 3)",
      "    call SetUnitUserData(g_b, 4)",
      "endfunction",
      // combine_keep.json의 fv[n]=GroupPickRandomUnit(...) 패턴을 흉내낸 합성본 — 실제 레시피 조건식은
      // script 소유(deny-first: 재구현 금지)라, 여기서는 "userData 합산 승계"라는 관측 가능한 결과만 검산한다.
      "function Combine takes nothing returns nothing",
      "    local integer sum = GetUnitUserData(g_a) + GetUnitUserData(g_b)",
      "    set g_combined = ReplaceUnitBJ(g_a, 'gemC')",
      "    call SetUnitUserData(g_combined, sum)",
      "endfunction",
      "function ReadCombined takes nothing returns integer",
      "    return GetUnitUserData(g_combined)",
      "endfunction",
    ].join("\n");
    const pr = parseJass(src);
    const vm = JassVm.fromParseResult(pr);
    const sim = new Sim(makeSyntheticIr(), 3);
    vm.attachToSim(sim);
    installNatives(vm, sim);
    vm.callFunctionSync("Fill", []);
    vm.callFunctionSync("Combine", []);
    assert.deepEqual(vm.callFunctionSync("ReadCombined", []), vint(7), "userData=Σ(3+4)=7이 새 유닛(ReplaceUnitBJ 신규 핸들)에 승계돼야 함");
  });
});
