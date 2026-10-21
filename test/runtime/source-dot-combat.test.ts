import {it} from 'node:test';import assert from 'node:assert/strict';
import {Sim} from '../../src/sim/sim.ts';import {DefStore} from '../../src/sim/def-store.ts';import {createEntity} from '../../src/sim/unit-entity.ts';
import {installCombat} from '../../src/sim/combat-system.ts';import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {createStatusStore,applyStatus,tickStatus} from '../../src/sim/status.ts';import {rawCodeOf} from '../../src/ir/fourcc.ts';import {ALLIANCE_TYPES} from '../../src/sim/playerstate.ts';
import type {MapIR} from '../../src/ir/types.ts';
// All encounters are explicit synthetic compatibility fixtures, not natural map acquisition or native WC3 timing proof.
const venom=(damagePerSecondPm=20000,durationTicks=40)=>({kind:'venom',damagePerSecondPm,durationTicks,targetsMask:3,buffId:'Bpsd'});
const fire=(damagePerSecondPm=20000,durationTicks=40)=>({kind:'liquidFire',damagePerSecondPm,durationTicks,targetsMask:3,buffId:'Bliq'});
function ir():MapIR{return {irVersion:1,info:{name:'synthetic DOT',author:'',suggestedPlayers:'1',playableWidth:32,playableHeight:32,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source:'',nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};}
function encounter(effects:any[][],options:any={}){
 const gc=makeNeutralGameConstants(),defs=new DefStore({resolve(id){return {hpMax:1000,mana:0,armorValue:options.armor??0,armorType:'none',attack:id.startsWith('TW')?{dmgBase:options.attackDamage??1,dmgSpread:0,cooldownTicks:options.cooldown??1000,rangeU:500,acquireU:500,attackType:'normal',targetsMask:options.secondary?1:3,...(options.splash?{splash:{fullU:100,halfU:100,quarterU:100,targetsMask:3}}:{})}:null,moveSpeedU:0,collisionU:0,goldCost:0,bounty:{base:5,spreadPm:0},regenPmPerSec:0,foodUsed:0,meta:{role:id.startsWith('TW')?{kind:'tower',line:'test',tier:1}:{kind:'creep',band:'test',wave:1},source:'formula'}};}},{resolve(id){return id.startsWith('TW')?{abilities:['FX'+id.slice(2)],...(options.secondary?{secondaryAttack:{dmgBase:7,dmgSpread:0,cooldownTicks:1000,rangeU:500,acquireU:500,attackType:'normal',targetsMask:2}}:{})}:{movementType:options.flying?'fly':'foot'};}});
 const sim=new Sim(ir(),6);sim.abilityEffects={effects(abilities){const result:any[]=[];for(const [id,level]of abilities)if(level>0){const index=effects.findIndex((_list,i)=>rawCodeOf('FX'+String(i).padStart(2,'0'))===id);if(index>=0)result.push(...effects[index]!);}return result;}};
 installCombat(sim,{defStore:defs,gc,ledger:sim.ledger,bountyMode:'engine',minDamage:1});
 const towers=effects.map((_list,index)=>{const e=createEntity(defs.getDef('TW'+String(index).padStart(2,'0')),{id:index+1,owner:index,x:0,y:0,facing:0});sim.spawnUnit(e);return e;});
 const targets=Array.from({length:options.targets??1},(_,index)=>{const e=createEntity(defs.getDef('CREE'),{id:effects.length+index+1,owner:options.targetOwner??11,x:100+index*20,y:0,facing:0});sim.spawnUnit(e);return e;});
 const step=(n:number)=>{for(let i=0;i<n;i++)sim.step();};return {sim,defs,gc,towers,targets,target:targets[0]!,step};
}
it('two venom sources stack while each source refreshes one independent nonlethal budget',()=>{
 const f=encounter([[venom()],[venom()]]);f.step(20);assert.equal(f.target.hp,958);assert.deepEqual([...f.sim.status.get(f.target.id)!.keys()],[`venom:Bpsd:${f.towers[0]!.id}`,`venom:Bpsd:${f.towers[1]!.id}`]);
 const refresh=encounter([[venom()]],{cooldown:1});refresh.step(20);assert.equal(refresh.target.hp,970);assert.equal(refresh.sim.status.get(refresh.target.id)!.size,1);
});
it('venom damage stops at HP1 without killing or paying a reward',()=>{
 const f=encounter([[venom(1000000)]]);f.target.hp=10;f.step(20);assert.equal(f.target.hp,1);assert.equal(f.target.alive,true);assert.equal(f.sim.ledger.gold(0),0);assert.equal(f.sim.drainEvents().filter(e=>e.kind==='UnitDied').length,0);
});
it('a shared liquid-fire buff is latest-writer rather than a separate budget for each source',()=>{
 const f=encounter([[fire(20000)],[fire(10000)]]);f.step(20);assert.equal(f.target.hp,988);const statuses=f.sim.status.get(f.target.id)!;assert.equal(statuses.size,1);const effect:any=statuses.get('liquid:Bliq');assert.equal(effect.sourceUnitId,f.towers[1]!.id);assert.equal(effect.sourceOwner,1);assert.equal(effect.perSecondPm,10000);
});
it('same-source refresh preserves fractional damage while venom and liquid fire remain independent',()=>{
 for(const make of [venom,fire]){const f=encounter([[make(3000)]],{cooldown:1});f.step(20);assert.equal(f.target.hp,987);assert.equal(f.sim.status.get(f.target.id)!.size,1);}
 const both=encounter([[venom(3000),fire(7000)]],{cooldown:1});both.step(20);assert.equal(both.target.hp,980);assert.equal(both.sim.status.get(both.target.id)!.size,2);
});
it('removing a source ability stops new applications while the old DOT expires at its remaining TTL',()=>{
 const f=encounter([[venom(20000,6)]],{cooldown:1});f.step(1);const key=`venom:Bpsd:${f.towers[0]!.id}`;assert.equal(f.sim.status.get(f.target.id)?.get(key)?.remainingTicks,5);
 f.towers[0]!.abilities.clear();f.step(4);assert.equal(f.sim.status.get(f.target.id)?.get(key)?.remainingTicks,1);f.step(1);assert.equal(f.sim.status.get(f.target.id)?.has(key)??false,false);const hp=f.target.hp;f.step(1);assert.equal(f.target.hp,hp-1,'only the scheduled ordinary attack remains');
});
it('new on-hit DOTs guard same-owner, allied forced attacks, invulnerability, dead hits, target masks and nonpositive TTL',()=>{
 for(const options of [{targetOwner:0},{targetOwner:1,allied:true},{invulnerable:true},{deadHit:true},{wrongMask:true},{ttl:0}]){
  const effect={...venom(),...(options.wrongMask?{targetsMask:2}:{}),...(options.ttl===0?{durationTicks:0}:{})};const f=encounter([[effect]],options);
  if(options.allied){f.sim.playerState.setAlliance(0,1,ALLIANCE_TYPES.ALLIANCE_PASSIVE,true);f.towers[0]!.attackTargetId=f.target.id;}
  if(options.invulnerable)f.target.invulnerable=true;if(options.deadHit)f.target.hp=1;
  f.step(1);assert.equal(f.sim.status.get(f.target.id)?.size??0,0,JSON.stringify(options));
 }
});
it('barrage and splash do not copy the main-target DOT application, while a selected second weapon still has one main target',()=>{
 const f=encounter([[venom(),fire(),{kind:'barrage',extraTargets:1,radiusU:500,targetsMask:3}]],{targets:3,splash:true,attackDamage:10});f.step(1);
 assert.equal(f.sim.status.get(f.targets[0]!.id)!.size,2);for(const other of f.targets.slice(1))assert.equal(f.sim.status.get(other.id)?.size??0,0);
 const second=encounter([[venom()]],{secondary:true,flying:true});second.step(1);assert.equal(second.target.hp,992);assert.equal(second.sim.status.get(second.target.id)!.size,1);
});
it('liquid fire settles one killing source, one death event and one reward through the existing pipeline',()=>{
 const f=encounter([[venom(100000)],[fire(100000)]]);f.target.hp=7;f.step(20);assert.equal(f.sim.getUnit(f.target.id),undefined);const deaths=f.sim.drainEvents().filter(e=>e.kind==='UnitDied');assert.equal(deaths.length,1);assert.equal((deaths[0]as any).killerUnitId,f.towers[1]!.id);assert.equal(f.sim.ledger.gold(1),5);assert.equal(f.sim.ledger.gold(0),0);
});
it('an existing liquid-fire budget retains its source owner for settlement after the caster is removed',()=>{
 const f=encounter([[fire(10000)]]);f.target.hp=5;f.step(1);const source=f.towers[0]!;f.sim.removeUnit(source.id);f.step(20);
 const deaths=f.sim.drainEvents().filter(e=>e.kind==='UnitDied');assert.equal(deaths.length,1);assert.equal((deaths[0]as any).killerUnitId,source.id);assert.equal(f.sim.ledger.gold(0),5);
});
it('DOT floor never resurrects an already-dead target and cannot create duplicate death notifications',()=>{
 for(const floorFirst of [false,true]){const e:any={id:1,alive:true,hp:5,invulnerable:false},status=createStatusStore(),floor:any={kind:'dot',perTick:50,minHp:1,remainingTicks:2,sourceUnitId:1},lethal:any={kind:'dot',perTick:10,remainingTicks:2,sourceUnitId:2};
  const entries:any[]=floorFirst?[[floor,'venom:Bpsd:1'],[lethal,'liquid:Bliq']]:[[lethal,'liquid:Bliq'],[floor,'venom:Bpsd:1']];for(const [effect,key]of entries)applyStatus(status,1,effect,key);
  const sources:number[]=[];const deaths=tickStatus(status,new Map([[1,e]]),(_entity,effect:any)=>sources.push(effect.sourceUnitId));assert.ok(e.hp<=0);assert.equal(deaths.length,1);assert.deepEqual(sources,[2]);
 }
 const low:any={id:1,alive:true,hp:0,invulnerable:false},s=createStatusStore();applyStatus(s,1,{kind:'dot',perTick:10,minHp:1,remainingTicks:1}as any,'venom:Bpsd:1');assert.equal(tickStatus(s,new Map([[1,low]])).length,0);assert.equal(low.hp,0);
});
it('raw-HP accumulation and invulnerability are existing compatibility policies rather than an invented defense model',()=>{
 const f=encounter([[fire()]],{armor:999});f.step(20);assert.equal(f.target.hp,979,'one minimum ordinary hit plus raw20 DOT damage');
 const inv=encounter([[venom(20000,4)]]);inv.step(1);inv.target.invulnerable=true;const hp=inv.target.hp;inv.step(4);assert.equal(inv.target.hp,hp);assert.equal(inv.sim.status.get(inv.target.id)?.size??0,0,'TTL still expires while invulnerable');
});
it('the new effects consume no extra RNG, change no target decisions or base balance and reproduce equal-seed state',()=>{
 const plain=encounter([[]]),a=encounter([[venom(),fire()]]),b=encounter([[venom(),fire()]]);const attack={...a.defs.getDef('TW00').attack},gc=JSON.stringify(a.gc);
 for(const f of [plain,a,b])f.step(20);assert.equal(a.sim.rng.getState(),plain.sim.rng.getState());assert.deepEqual(a.sim.drainEvents(),plain.sim.drainEvents());assert.deepEqual(a.defs.getDef('TW00').attack,attack);assert.equal(JSON.stringify(a.gc),gc);assert.equal(a.sim.stateHash(),b.sim.stateHash());
});
