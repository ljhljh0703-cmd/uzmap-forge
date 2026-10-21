import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import type {MapIR,ObjectMod} from '../../src/ir/types.ts';
import {resolveObjectFields} from '../../src/formats/objects.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {readScriptMap,createSession} from '../../src/runtime/session.ts';
import {createUnitIdentityProvider} from '../../src/runtime/unit-identity.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {Sim} from '../../src/sim/sim.ts';
import {installCombat} from '../../src/sim/combat-system.ts';
import {createEntity} from '../../src/sim/unit-entity.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import type {DefaultsProvider} from '../../src/sim/balance/provider.ts';

// Source coordinates: GemTower_Max_7C.w3u ua1g/uaen. Values are semantic
// declarations, not an embedded map/profile. Damage remains the existing provider's.
const amethystTargets = {
 h004:'air,structure',h007:'air,structure',h00H:'air,debris,item,structure,ward',
 h00N:'structure,air',h00V:'air,item,ward,debris',h02X:'structure,air,item,ward,debris',
};
const unit=(id:string,mods:ObjectMod['mods'],baseId='hgtw'):ObjectMod=>({kind:'unit',baseId,newId:id,mods});
const stock:ObjectMod[]=[{kind:'unit',baseId:'hgtw',newId:null,mods:[
 {field:'uaen',value:1},{field:'ua1g',value:'ground,air'},
 {field:'ua1b',value:1},{field:'ua1d',value:1},{field:'ua1s',value:1},
 {field:'ua1c',value:1},{field:'ua1r',value:10},{field:'ua1t',value:'pierce'},
]}];
const amethysts=Object.entries(amethystTargets).map(([id,targets])=>unit(id,[{field:'ua1g',value:targets}]));
function emptyIr():MapIR{return {irVersion:1,info:{name:'targeting regression',author:'',suggestedPlayers:'1',playableWidth:1,playableHeight:1,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source:'',nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};}
function combatScenario(id:string,defs:DefStore){
 const sim=new Sim(emptyIr(),6),gc=makeNeutralGameConstants();
 installCombat(sim,{defStore:defs,gc,ledger:sim.ledger,bountyMode:'script',minDamage:1});
 for(const [typeId,entityId,x,y] of [[id,1,0,0],['GROU',2,20,0],['FLYI',3,40,0]] as const)
  sim.spawnUnit(createEntity(defs.getDef(typeId),{id:entityId,owner:entityId===1?0:11,x,y,facing:0}));
 return sim;
}
// Existing GemTower balance for the attacker, controlled inert enemies for the
// targeting assertion. Attacker source damage deliberately differs from balance.
function combatDefs(base:DefStore,identity:ReturnType<typeof createUnitIdentityProvider>){
 const provider:DefaultsProvider={resolve(typeId){
  if(typeId!=='GROU'&&typeId!=='FLYI')return base.getDef(typeId);
  return {...base.getDef('h00D'),hpMax:1_000_000,armorValue:0,armorType:'none',attack:null,
   meta:{role:{kind:'creep',band:'test',wave:1},source:'formula'}};
 }};
 return new DefStore(provider,identity);
}
const enemyIdentity=[unit('GROU',[{field:'umvt',value:'foot'},{field:'uaen',value:0}]),unit('FLYI',[{field:'umvt',value:'fly'},{field:'uaen',value:0}])];

describe('issue #1: source primary targeting survives the balance provider',()=>{
 for(const id of Object.keys(amethystTargets))it(`${id} retains its balance and attacks flying enemies only`,()=>{
  const base=new DefStore(),before=base.getDef(id),identity=createUnitIdentityProvider(stock,[...amethysts,...enemyIdentity]);
  const defs=combatDefs(base,identity),after=defs.getDef(id);
  assert.ok(before.attack);assert.deepEqual(after.attack,{...before.attack,targetsMask:2});
  assert.equal(base.getDef(id).attack?.targetsMask,3); // original provider/cache untouched
  assert.ok(Object.isFrozen(after.attack));
  const run=()=>{const sim=combatScenario(id,defs);sim.step();
   assert.equal(sim.getUnit(2)?.hp,1_000_000,'ground enemy must be ignored');
   assert.ok(sim.getUnit(3)!.hp<1_000_000,'flying enemy must be hit');
   assert.deepEqual(sim.drainEvents().filter(e=>e.kind==='Attacked').map(e=>e.targetUnitId),[3]);return sim.stateHash();};
  assert.equal(run(),run(),'same input must remain deterministic');
 });
 it('keeps all-target and ground-only semantics, including inherited stock targets',()=>{
  const provider=new DefStore(),identity=createUnitIdentityProvider(stock,[unit('h000',[]),unit('h002',[{field:'ua1g',value:'ground,structure'}])]);
  const defs=provider.withIdentity(identity);
  assert.deepEqual(defs.getDef('h000').attack,provider.getDef('h000').attack);
  assert.deepEqual(defs.getDef('h002').attack,{...provider.getDef('h002').attack,targetsMask:1});
  assert.equal(provider.getDef('h002').attack?.targetsMask,3);
 });
 it('leaves unknown source data and absent provider attacks absent',()=>{
  const base=new DefStore(),identity=createUnitIdentityProvider(stock,[unit('h006',[{field:'ua1g',value:'air'}])]);
  assert.deepEqual(base.withIdentity(identity).getDef('h007').attack,base.getDef('h007').attack);
  assert.equal(base.getDef('h006').attack,null);
  assert.equal(base.withIdentity(identity).getDef('h006').attack,null);
 });
 it('respects both disabled weapon bits and keeps a configured second weapon',()=>{
  const second:ObjectMod['mods']=[{field:'ua2b',value:11},{field:'ua2d',value:1},{field:'ua2s',value:1},{field:'ua2c',value:2},{field:'ua2r',value:400},{field:'ua2t',value:'magic'},{field:'ua2g',value:'air'}];
  for(const enabled of [0,2,3]){
   const identity=createUnitIdentityProvider(stock,[unit('h007',[{field:'uaen',value:enabled},{field:'ua1g',value:'ground'},...second])]);
   const def=new DefStore(undefined,identity).getDef('h007');
   if(enabled&1)assert.equal(def.attack?.targetsMask,1);else assert.equal(def.attack,null);
   if(enabled&2){assert.equal(def.secondaryAttack?.targetsMask,2);assert.equal(def.secondaryAttack?.dmgBase,12);}else assert.equal(def.secondaryAttack,undefined);
  }
 });
});

const mapPath=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url),profilePath=new URL('../../fixtures/stock/unit-abilities.json',import.meta.url);
it('local original map/profile: every Amethyst variant attacks air, never ground',{skip:!existsSync(mapPath)||!existsSync(profilePath)},()=>{
 const {ir}=readScriptMap(new Uint8Array(readFileSync(mapPath)),'GemTower_Max_7C.w3x');
 const profile=parseUnitAbilityProfile(JSON.parse(readFileSync(profilePath,'utf8'))),base=new DefStore();
 const identity=createUnitIdentityProvider(profile.units,[...ir.objectMods,...enemyIdentity]);
 const defs=combatDefs(base,identity);
 for(const id of Object.keys(amethystTargets)){
  const fields=resolveObjectFields('unit',id,profile.units,ir.objectMods),value=(key:string)=>fields.find(m=>m.field===key)?.value;
  assert.equal(value('uaen'),1);assert.equal(value('ua1g'),amethystTargets[id as keyof typeof amethystTargets]);
  assert.deepEqual(defs.getDef(id).attack,{...base.getDef(id).attack,targetsMask:2});
  const sim=combatScenario(id,defs);sim.step();
  assert.equal(sim.getUnit(2)?.hp,1_000_000);assert.ok(sim.getUnit(3)!.hp<1_000_000);
 }
});

it('local original Uranium keeps its second weapon and fire; Heaven retains support abilities',{skip:!existsSync(mapPath)||!existsSync(profilePath)},()=>{
 const {ir:original}=readScriptMap(new Uint8Array(readFileSync(mapPath)),'GemTower_Max_7C.w3x');
 const profile=parseUnitAbilityProfile(JSON.parse(readFileSync(profilePath,'utf8'))),base=new DefStore();
 for(const id of ['h02N','h04S']){
  const ir=emptyIr();ir.objectMods=[...original.objectMods,...enemyIdentity];
  ir.script.source=`function main takes nothing returns nothing
call CreateUnit(Player(0),'${id}',0.,0.,0.)
call CreateUnit(Player(11),'GROU',20.,0.,0.)
endfunction`;
  const identity=createUnitIdentityProvider(profile.units,ir.objectMods);
  const {sim,defStore}=createSession(ir,{seed:6,defStore:combatDefs(base,identity),stockUnits:profile.units,stockAbilities:profile.abilities,gc:makeNeutralGameConstants(),bountyMode:'script'});
  const tower=[...sim.entities.values()].find(e=>e.typeId===id)!,target=[...sim.entities.values()].find(e=>e.typeId==='GROU')!;
  assert.equal(defStore.getDef(id).attack,null);assert.ok(defStore.getDef(id).secondaryAttack);
  // Hold the enabled second weapon on cooldown to measure the fire path alone.
  tower.cooldownLeft=1000;
  const effects=sim.abilityEffects!.effects(tower.abilities);
  assert.ok(effects.some(e=>e.kind==='immolation'&&e.damagePerSecondPm===200000&&e.radiusU===500));
  assert.ok(effects.some(e=>e.kind==='enemySlowAura'&&e.slowPm===800));
  for(let tick=0;tick<20;tick++)sim.step();
  assert.equal(target.hp,999800);assert.ok(!sim.drainEvents().some(e=>e.kind==='Attacked'));
 }
 const heaven=base.withIdentity(createUnitIdentityProvider(profile.units,original.objectMods)).getDef('h01Q');
 assert.equal(heaven.attack,null);assert.deepEqual(heaven.abilities,['A05L','A088']);
});
