import {it} from 'node:test';import assert from 'node:assert/strict';
import {createSession} from '../../../src/runtime/session.ts';import {DefStore} from '../../../src/sim/def-store.ts';import {makeNeutralGameConstants} from '../../../src/sim/balance/config.ts';
import {JassVm,vhandle,vint,vreal} from '../../../src/jass/vm.ts';import {parseJass} from '../../../src/jass/parser.ts';import {registerUnitNatives} from '../../../src/jass/natives/units.ts';import {rawCodeOf} from '../../../src/ir/fourcc.ts';import type {MapIR} from '../../../src/ir/types.ts';
// Controlled native fixtures, not Race/Easy damage or acquisition evidence. The source-like full gem/rock case uses current caller values only.
function boot(options:any={}){
 const oldType=options.oldType??'OLD1',newType=options.newType??'NEW1',base=new DefStore();
 const ir:MapIR={irVersion:1,info:{name:'replacement fixture',author:'',suggestedPlayers:'1',playableWidth:32,playableHeight:32,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source:`function main takes nothing returns nothing\ncall CreateUnit(Player(0),'${oldType}',10.,20.,35.)\nendfunction`,nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};
 const defStore=new DefStore({resolve(id){return {...base.getDef('h000'),attack:null,armorValue:0,moveSpeedU:100,hpMax:id===oldType?(options.oldHpMax??100):(options.newHpMax??200),mana:id==='CUR1'?300:id===oldType?(options.oldMana??100):(options.newMana??200)};}});
 const w=createSession(ir,{seed:6,defStore,gc:makeNeutralGameConstants(),bountyMode:'script'}),old=[...w.sim.entities.values()][0]!;
 const state=(id:number,key:number)=>w.vm.callFunctionSync('GetUnitState',[vhandle(id),vint(key)]);
 const set=(id:number,key:number,value:number)=>w.vm.callFunctionSync('SetUnitState',[vhandle(id),vint(key),vreal(value)]);
 const replace=(method:number|undefined=1)=>{const args=[vhandle(old.id),vint(rawCodeOf(newType)),...(method===undefined?[]:[vint(method)])],result=w.vm.callFunctionSync('ReplaceUnitBJ',args);assert.equal(result.t,'handle');return result.v as number;};
 return {...w,old,newType,state,set,replace};
}
it('source-active relative method copies current life/mana ratios instead of creation-time state',()=>{
 const f=boot();f.sim.applyTriggerDamage(f.old.id,null,75,'normal');f.set(f.old.id,2,10);
 assert.equal(f.old.hp,25);assert.equal(f.vm.handles.get(f.old.id)!.data.hp,100,'the live HP authority intentionally differs from the old handle mirror');
 const id=f.replace(),next=f.sim.getUnit(id)!;assert.equal(next.hp,50);assert.equal(next.mana,20);assert.equal(f.sim.getUnit(f.old.id),undefined);assert.deepEqual(f.vm.getGlobal('bj_lastReplacedUnit'),vhandle(id));
});
it('relative mana is left at new factory default if either old or new maximum mana is zero',()=>{
 const oldZero=boot({oldMana:0});oldZero.set(oldZero.old.id,2,10);assert.equal(oldZero.sim.getUnit(oldZero.replace())!.mana,200,'old MAX_MANA0 must skip ratio rather than writing0');
 const newZero=boot({newMana:0});newZero.set(newZero.old.id,2,10);assert.equal(newZero.sim.getUnit(newZero.replace())!.mana,0);
});
it('maximum mana getter preserves explicit overrides including zero before caller current-type fallback',()=>{
 const f=boot();assert.deepEqual(f.state(f.old.id,3),vreal(100));
 f.old.typeId='CUR1';assert.deepEqual(f.state(f.old.id,3),vreal(300),'read current live type rather than creation-time type');
 f.set(f.old.id,3,50);assert.deepEqual(f.state(f.old.id,3),vreal(50));f.set(f.old.id,2,10);assert.equal(f.sim.getUnit(f.replace())!.mana,40);
 const zero=boot();zero.set(zero.old.id,3,0);assert.deepEqual(zero.state(zero.old.id,3),vreal(0));zero.set(zero.old.id,2,10);assert.equal(zero.sim.getUnit(zero.replace())!.mana,200);
});
it('ordinary movement, current owner/facing and non-death removal survive the relative replacement',()=>{
 const f=boot();assert.equal(f.sim.issueMoveOrder(0,f.old.id,110,20),true);for(let i=0;i<10;i++)f.sim.step();assert.equal(f.old.x,60);
 f.vm.callFunctionSync('SetUnitOwner',[vhandle(f.old.id),f.vm.callFunctionSync('Player',[vint(2)]),{t:'bool',v:false}]);f.vm.callFunctionSync('SetUnitFacing',[vhandle(f.old.id),vreal(70)]);
 f.set(f.old.id,0,25);const id=f.replace(),next=f.sim.getUnit(id)!;assert.notEqual(id,f.old.id);assert.deepEqual([next.x,next.y,next.owner,next.facing,next.hp],[60,20,2,70,50]);
 assert.equal(f.vm.handles.get(f.old.id)!.data.alive,false);const events=f.sim.drainEvents();assert.equal(events.filter(e=>e.kind==='UnitDied'||e.kind==='ConstructFinished').length,0,'replacement is not a construction or old-unit death');
});
it('maximum method and all source-unused methods preserve existing factory behavior',()=>{
 for(const method of [3,0,2,99]){const f=boot();f.set(f.old.id,0,25);f.set(f.old.id,2,10);const next=f.sim.getUnit(f.replace(method))!;assert.equal(next.hp,200);assert.equal(next.mana,200);}
});
it('the current full-health mana-zero source-like gem to rock path stays unchanged',()=>{
 const f=boot({oldType:'h000',newType:'h00G',newHpMax:1,oldMana:0,newMana:0}),id=f.replace(),next=f.sim.getUnit(id)!;assert.equal(next.typeId,'h00G');assert.equal(next.hp,1);assert.equal(next.mana,0);assert.equal(f.sim.drainEvents().filter(e=>e.kind==='UnitDied').length,0);
});
it('relative results reuse existing integer setter quantization and its exactly-once zero-life settlement',()=>{
 const f=boot({newHpMax:1});f.set(f.old.id,0,1);const id=f.replace();assert.equal(f.sim.getUnit(id),undefined);assert.deepEqual(f.state(id,0),vreal(0));assert.equal(f.vm.handles.get(id)!.data.alive,false);
 const deaths=f.sim.drainEvents().filter(e=>e.kind==='UnitDied');assert.equal(deaths.length,1);assert.equal((deaths[0]as any).unitId,id);assert.equal(f.sim.ledger.gold(0),0);
 const mana=boot({oldMana:3,newMana:5});mana.set(mana.old.id,2,1);assert.equal(mana.sim.getUnit(mana.replace())!.mana,2,'reuse current Math.round mana setter policy');
});
it('null/missing units and isolated VM callers remain safe without a new mana or Sim model',()=>{
 const f=boot(),before=f.sim.entities.size;for(const arg of [vhandle(null),vhandle(999999)])assert.deepEqual(f.vm.callFunctionSync('ReplaceUnitBJ',[arg,vint(rawCodeOf('NEW1')),vint(1)]),vhandle(null));assert.equal(f.sim.entities.size,before);
 const vm=JassVm.fromParseResult(parseJass(''));registerUnitNatives(vm);const old=vm.callFunctionSync('CreateUnit',[vhandle(null),vint(rawCodeOf('OLD1')),vreal(5),vreal(6),vreal(10)]);const next=vm.callFunctionSync('ReplaceUnitBJ',[old,vint(rawCodeOf('NEW1')),vint(1)]);assert.equal(next.t,'handle');assert.deepEqual(vm.callFunctionSync('GetUnitState',[next,vint(0)]),vreal(1));assert.deepEqual(vm.callFunctionSync('GetUnitState',[next,vint(3)]),vreal(0));
});
it('equal caller states and native actions retain equal hashes without extra RNG',()=>{
 const run=()=>{const f=boot();f.set(f.old.id,0,25);f.set(f.old.id,2,10);const rng=f.sim.rng.getState();f.replace();assert.equal(f.sim.rng.getState(),rng);return f.sim.stateHash();};assert.equal(run(),run());
});
