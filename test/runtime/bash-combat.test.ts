import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../../src/runtime/session.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {makeSyntheticIr} from '../sim/helpers.ts';
import {combatStep} from '../../src/sim/combat-pipe.ts';
import {Rng} from '../../src/sim/rng.ts';
import {applyStatus,isStunned} from '../../src/sim/status.ts';
import {rawCodeOf} from '../../src/ir/fourcc.ts';
import {vhandle,vint,vreal} from '../../src/jass/vm.ts';
import type {CombatAbilityEffect} from '../../src/sim/ability-effects.ts';

// These are controlled compatibility fixtures, not Warcraft parameter or natural-play proof.
type EffectSource=Record<string,(level:number)=>CombatAbilityEffect>;
const bash=(chancePm=1000,multiplierPm=2000,durationTicks=4,targetsMask=3):CombatAbilityEffect=>({kind:'bash',chancePm,multiplierPm,durationTicks,heroDurationTicks:durationTicks,targetsMask});
const critical=(chancePm=1000,multiplierPm=2000):CombatAbilityEffect=>({kind:'critical',chancePm,multiplierPm});
const barrage:CombatAbilityEffect={kind:'barrage',extraTargets:1,radiusU:600,targetsMask:3};
function game({effects={},grants=Object.keys(effects),hp=1000,seed=6,cooldown=100,targets=1,splash=false,mobile=false,targetOwner=11,allied=false,invulnerable=false,targetMovement,bountyMode='engine'}:
 {effects?:EffectSource;grants?:string[];hp?:number;seed?:number;cooldown?:number;targets?:number;splash?:boolean;mobile?:boolean;targetOwner?:number;allied?:boolean;invulnerable?:boolean;targetMovement?:'foot'|'fly';bountyMode?:'engine'|'script'}={}){
 const ir=makeSyntheticIr();
 ir.objectMods=[{kind:'unit',baseId:'BASE',newId:'TOWR',mods:[{field:'uabi',value:grants.join(',')}]}];
 ir.script.source=`globals
unit caster=null
unit victim=null
integer deaths=0
integer killer=-1
endglobals
function Died takes nothing returns nothing
set deaths=deaths+1
set killer=GetPlayerId(GetOwningPlayer(GetKillingUnit()))
call AdjustPlayerStateBJ(7,Player(0),PLAYER_STATE_RESOURCE_GOLD)
endfunction
function main takes nothing returns nothing
local trigger t=CreateTrigger()
call TriggerRegisterAnyUnitEventBJ(t,EVENT_PLAYER_UNIT_DEATH)
call TriggerAddAction(t,function Died)
set caster=CreateUnit(Player(0),'TOWR',0.,0.,0.)
set victim=CreateUnit(Player(${targetOwner}),'TRGT',100.,0.,0.)
${Array.from({length:targets-1},(_,i)=>`call CreateUnit(Player(${targetOwner}),'TRGT',${150+i*50}.,0.,0.)`).join('\n')}
${mobile?"call CreateUnit(Player(0),'MINE',150.,0.,0.)":''}
${allied?`call SetPlayerAlliance(Player(0),Player(${targetOwner}),ALLIANCE_PASSIVE,true)`:''}
${invulnerable?'call SetUnitInvulnerable(victim,true)':''}
endfunction`;
 const attack={dmgBase:10,dmgSpread:0,cooldownTicks:cooldown,rangeU:600,acquireU:600,attackType:'normal',targetsMask:3,...(splash?{splash:{fullU:500,halfU:500,quarterU:500}}:{})};
 const ds=new DefStore({resolve:(id:string)=>({movementType:id==='TRGT'?targetMovement:undefined,hpMax:id==='TRGT'?hp:1000,mana:0,armorValue:0,armorType:'none',attack:id==='TOWR'?attack:mobile&&id==='TRGT'?{...attack,dmgBase:5,cooldownTicks:0}:null,moveSpeedU:mobile&&id==='TRGT'?100:0,collisionU:0,goldCost:0,bounty:{base:id==='TRGT'?5:0,spreadPm:0},regenPmPerSec:0,foodUsed:0,meta:{role:id==='TOWR'?{kind:'tower',line:'test',tier:1}:id==='MINE'?{kind:'static',archetype:'mine'}:{kind:'creep',band:'test',wave:1},source:'formula'}})} as any);
 const w=createSession(ir,{seed,defStore:ds,stockUnits:[{kind:'unit',baseId:'BASE',newId:null,mods:[]}],gc:makeNeutralGameConstants(),bountyMode});
 w.sim.abilityEffects={effects(abilities){const out:CombatAbilityEffect[]=[];for(const [id,level]of abilities)if(level>0){const source=effects[Object.keys(effects).find(key=>rawCodeOf(key)===id)??''];if(source)out.push(source(level));}return out;}};
 return {...w,tower:[...w.sim.entities.values()].find(e=>e.typeId==='TOWR')!,victims:[...w.sim.entities.values()].filter(e=>e.typeId==='TRGT'),mine:[...w.sim.entities.values()].find(e=>e.typeId==='MINE')};
}
function pulse(w:ReturnType<typeof game>){w.sim.step();return w.sim.drainEvents();}
function rngAfterBase(seed=6){const r=new Rng(seed);r.int(0,0);return r.getState();}
function grant(w:ReturnType<typeof game>,name:string,level:number){w.vm.callFunctionSync('SetUnitAbilityLevel',[vhandle(w.tower.id),vint(rawCodeOf(name)),vint(level)]);}

describe('bounded Bash primary-hit compatibility',()=>{
 it('zero chance leaves ordinary damage, RNG, cooldown and no-stun behavior unchanged',()=>{
  const off=game({effects:{BASH:()=>bash(0)}}),base=game();const a=pulse(off),b=pulse(base);
  assert.equal(off.victims[0]!.hp,990);assert.equal(off.sim.status.size,0);assert.equal(off.sim.rng.getState(),base.sim.rng.getState());assert.equal(off.tower.cooldownLeft,base.tower.cooldownLeft);assert.deepEqual(a,b);
 });
 it('100 percent Bash changes only primary damage and creates the existing expiring stun without a probability draw',()=>{
  const w=game({effects:{BASH:()=>bash()}});pulse(w);
  assert.equal(w.victims[0]!.hp,980);assert.equal(w.sim.status.get(w.victims[0]!.id)?.get('stun')?.remainingTicks,3);
  assert.equal(w.sim.rng.getState(),rngAfterBase());assert.equal(w.tower.cooldownLeft,100);
 });
 it('a resolver-normalized neutral multiplier still stuns without creating bonus damage',()=>{
  const w=game({effects:{BASH:()=>bash(1000,1000)}});pulse(w);assert.equal(w.victims[0]!.hp,990);assert.equal(isStunned(w.sim.status,w.victims[0]!.id),true);
 });
 it('seeded chance follows the existing critical RNG policy and is repeatable',()=>{
  const run=()=>{const w=game({effects:{BASH:()=>bash(350,2000,2)},hp:10000,cooldown:1}),damage:number[]=[];let previous=w.victims[0]!.hp;
   for(let i=0;i<20;i++){const events=pulse(w);if(events.some(e=>e.kind==='Attacked'&&e.attackerUnitId===w.tower.id)){damage.push(previous-w.victims[0]!.hp);previous=w.victims[0]!.hp;}}
   return {damage,hash:w.sim.stateHash(),rng:w.sim.rng.getState()};};
  const expected:number[]=[],rng=new Rng(6);for(let i=0;i<10;i++){rng.int(0,0);expected.push(rng.int(1,1000)<=350?20:10);}
  const a=run();assert.deepEqual(a.damage,expected);assert.equal(a.rng,rng.getState());assert.deepEqual(run(),a);assert.ok(expected.includes(10)&&expected.includes(20));
 });
 it('grant order determines existing chance consumption for Bash and critical without a separate RNG',()=>{
  for(const grants of [['BASH','CRIT'],['CRIT','BASH']]){
   const w=game({grants,effects:{BASH:()=>bash(500,4000,4),CRIT:()=>critical(500,2000)}});
   const reference=new Rng(6);reference.int(0,0);const procs=new Map<string,boolean>();for(const id of grants)procs.set(id,reference.int(1,1000)<=500);
   pulse(w);assert.equal(w.victims[0]!.hp,1000-10*Math.max(procs.get('BASH')?4:1,procs.get('CRIT')?2:1));
   assert.equal(isStunned(w.sim.status,w.victims[0]!.id),procs.get('BASH'));assert.equal(w.sim.rng.getState(),reference.getState());
  }
 });
 it('multiple successful Bash effects keep strongest primary damage but the existing last stun replacement',()=>{
  for(const grants of [['B001','CRIT','B002'],['B002','CRIT','B001']]){
   const w=game({grants,effects:{B001:()=>bash(1000,4000,10),B002:()=>bash(1000,2000,30),CRIT:()=>critical(1000,3000)},targets:3,splash:true});
   pulse(w);assert.deepEqual(w.victims.map(e=>e.hp),[960,970,970]);assert.equal(w.sim.status.get(w.victims[0]!.id)?.get('stun')?.remainingTicks,grants.at(-1)==='B002'?29:9);
   assert.ok(w.victims.slice(1).every(e=>!isStunned(w.sim.status,e.id)));assert.equal(w.sim.rng.getState(),rngAfterBase());
  }
 });
 it('Bash bonuses never spread through barrage or splash and do not suppress existing barrage',()=>{
  const w=game({effects:{BASH:()=>bash(1000,3000),BARR:()=>barrage},targets:3,splash:true});pulse(w);
  assert.deepEqual(w.victims.map(e=>e.hp),[970,980,990]);assert.ok(w.victims.slice(1).every(e=>!isStunned(w.sim.status,e.id)));assert.equal(w.sim.rng.getState(),rngAfterBase());
 });
 it('critical keeps its existing barrage suppression and splash multiplier even when Bash is stronger',()=>{
  const w=game({effects:{BASH:()=>bash(1000,4000),CRIT:()=>critical(1000,2000),BARR:()=>barrage},targets:3,splash:true});pulse(w);
  assert.deepEqual(w.victims.map(e=>e.hp),[960,980,980]);assert.ok(w.victims.slice(1).every(e=>!isStunned(w.sim.status,e.id)));
 });
 it('Bash mask mismatch never procs or draws chance after an otherwise valid ordinary hit',()=>{
  for(const [mask,targetMovement]of [[2,'foot'],[1,'fly'],[0,'foot']] as const){
   const w=game({effects:{BASH:()=>bash(500,4000,4,mask)},targetMovement});pulse(w);assert.equal(w.victims[0]!.hp,990);assert.equal(w.sim.status.size,0);assert.equal(w.sim.rng.getState(),rngAfterBase());
  }
  const valid=game({effects:{BASH:()=>bash(1000,2000,4,2)},targetMovement:'fly'});pulse(valid);assert.equal(valid.victims[0]!.hp,980);assert.equal(isStunned(valid.sim.status,valid.victims[0]!.id),true);
 });
 it('invalid primary targets are rejected before any Bash roll or status',()=>{
  for(const options of [{targetOwner:0},{allied:true},{invulnerable:true}]){
   const w=game({...options,effects:{BASH:()=>bash(500)}}),before=w.sim.rng.getState();const events=pulse(w);
   assert.equal(w.victims[0]!.hp,1000);assert.equal(w.sim.status.size,0);assert.equal(w.sim.rng.getState(),before);assert.ok(!events.some(e=>e.kind==='Attacked'));
  }
 });
 it('removed or absent grants do not proc and current synthetic level descriptors are read at hit time',()=>{
  const w=game({effects:{BASH:level=>bash(1000,level===1?2000:3000,level===1?4:6)}});grant(w,'BASH',2);pulse(w);
  assert.equal(w.victims[0]!.hp,970);assert.equal(w.sim.status.get(w.victims[0]!.id)?.get('stun')?.remainingTicks,5);
  const removed=game({effects:{BASH:()=>bash()}});removed.vm.callFunctionSync('UnitRemoveAbility',[vhandle(removed.tower.id),vint(rawCodeOf('BASH'))]);grant(removed,'BASH',2);pulse(removed);
  assert.equal(removed.tower.abilities.has(rawCodeOf('BASH')),false);assert.equal(removed.victims[0]!.hp,990);assert.equal(removed.sim.status.size,0);
 });
 it('produced stun uses existing movement and mine-fire consumers, then expires without altering them',()=>{
  const w=game({effects:{BASH:()=>bash()},mobile:true});assert.equal(w.sim.issueMoveOrder(11,w.victims[0]!.id,1000,0),true);pulse(w);
  const stoppedAt=w.victims[0]!.x;assert.ok(stoppedAt>100,'movement phase precedes the first landed Bash');assert.equal(w.mine!.hp,1000);
  w.vm.callFunctionSync('UnitRemoveAbility',[vhandle(w.tower.id),vint(rawCodeOf('BASH'))]);
  for(let i=0;i<3;i++){pulse(w);assert.equal(w.victims[0]!.x,stoppedAt);assert.equal(w.mine!.hp,1000);}
  const events=pulse(w);assert.ok(w.victims[0]!.x>stoppedAt);assert.equal(w.mine!.hp,995);assert.ok(events.some(e=>e.kind==='Attacked'&&e.attackerUnitId===w.victims[0]!.id));
 });
 it('a lethal primary Bash reuses one death/bounty settlement and leaves no stun on the dead target',()=>{
  const w=game({effects:{BASH:()=>bash()},hp:15}),target=w.victims[0]!;
  combatStep({towers:[{entity:w.tower,def:w.defStore.getDef('TOWR'),state:{targetId:null}}],creeps:[{entity:target,def:w.defStore.getDef('TRGT'),pathProgress:1,targetsMask:3}],abilityEffects:w.sim.abilityEffects,status:w.sim.status,rng:w.sim.rng,gc:makeNeutralGameConstants(),ledger:w.sim.ledger,bountyMode:'engine',minDamage:1,emit:event=>w.sim.emit(event as any),settleDeath:(id,killer,owner)=>{w.sim.settleUnitDeath(id,killer,owner);}});
  const events=w.sim.drainEvents();assert.equal(w.sim.getUnit(target.id),undefined);assert.equal(w.sim.status.has(target.id),false);assert.equal(events.filter(e=>e.kind==='UnitDied'&&e.unitId===target.id).length,1);assert.equal(w.sim.ledger.bySource().bounty.in,5);
  w.sim.step();w.sim.step();assert.equal(w.vm.getGlobal('deaths').v,1);assert.equal(w.vm.getGlobal('killer').v,0);assert.equal(w.sim.ledger.bySource().bounty.in,5);assert.equal(w.sim.ledger.bySource().script.in,7);
 });
 it('a second tower keeps its overkill base attack but never rolls Bash against a primary already at zero HP',()=>{
  for(const bountyMode of ['script','engine'] as const){
   const w=game({effects:{B001:()=>bash(1000),B002:()=>bash(500)},grants:['B001'],hp:15,bountyMode}),target=w.victims[0]!;
   const player=w.vm.callFunctionSync('Player',[vint(0)]);
   const secondHandle=w.vm.callFunctionSync('CreateUnit',[player,vint(rawCodeOf('TOWR')),vreal(0),vreal(0),vreal(0)]);
   w.vm.callFunctionSync('UnitRemoveAbility',[secondHandle,vint(rawCodeOf('B001'))]);
   w.vm.callFunctionSync('UnitAddAbility',[secondHandle,vint(rawCodeOf('B002'))]);
   const second=w.sim.getUnit(secondHandle.v as number)!;
   const reference=new Rng(6);reference.int(0,0);reference.int(0,0);if(bountyMode==='engine')reference.int(0,0);
   const events=pulse(w);
   assert.equal(events.filter(e=>e.kind==='Attacked').length,2,'preserve both existing overkill base attack attempts');
   assert.equal(w.tower.cooldownLeft,100);assert.equal(second.cooldownLeft,100);
   assert.equal(w.sim.rng.getState(),reference.getState(),'consume two base rolls and only the existing optional bounty roll');
   assert.equal(w.sim.getUnit(target.id),undefined);assert.equal(w.sim.status.has(target.id),false);
   assert.equal(events.filter(e=>e.kind==='UnitDied'&&e.unitId===target.id).length,1);
   assert.equal(w.vm.getGlobal('deaths').v,1);assert.equal(w.vm.getGlobal('killer').v,0);
   assert.equal(w.sim.ledger.bySource().bounty.in,bountyMode==='engine'?5:0);assert.equal(w.sim.ledger.bySource().script.in,7);
  }
 });
 it('no Bash grant keeps ordinary critical, splash, cooldown and RNG behavior',()=>{
  const w=game({effects:{CRIT:()=>critical(1000,2000),BARR:()=>barrage},targets:3,splash:true});pulse(w);
  assert.deepEqual(w.victims.map(e=>e.hp),[980,980,980]);assert.equal(w.sim.status.size,0);assert.equal(w.tower.cooldownLeft,100);assert.equal(w.sim.rng.getState(),rngAfterBase());
 });
});
