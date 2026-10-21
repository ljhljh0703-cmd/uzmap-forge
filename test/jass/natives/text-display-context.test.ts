import {it} from 'node:test';import assert from 'node:assert/strict';
import {createSession} from '../../../src/runtime/session.ts';import {DefStore} from '../../../src/sim/def-store.ts';import {makeNeutralGameConstants} from '../../../src/sim/balance/config.ts';
import {vhandle,vint,vstring} from '../../../src/jass/vm.ts';import type {MapIR} from '../../../src/ir/types.ts';
// Synthetic metadata/bridge fixtures only. These are not original-map spins, payouts or natural gambling outcomes.
const source=`globals
force recipients=null
unit producer=null
unit other=null
endglobals
function Report takes nothing returns nothing
call DisplayTextToForce(recipients,"plain")
endfunction
function Delayed takes nothing returns nothing
call DisplayTextToForce(recipients,"before")
call TriggerSleepAction(.1)
call DisplayTextToForce(recipients,"after")
endfunction
function main takes nothing returns nothing
set recipients=CreateForce()
call ForceAddPlayer(recipients,Player(2))
call ForceAddPlayer(recipients,Player(0))
set producer=CreateUnit(Player(0),'TOW1',0.,0.,0.)
set other=CreateUnit(Player(1),'TOW2',0.,0.,0.)
endfunction`;
function boot(script=source,training=false){
 const ir:MapIR={irVersion:1,info:{name:'text context fixture',author:'',suggestedPlayers:'1',playableWidth:32,playableHeight:32,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source:script,nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};
 const base=new DefStore(),defStore=training?new DefStore({resolve(id){return {...base.getDef('h000'),attack:null,sourceGoldCost:0,sourceLumberCost:0,sourceFoodCost:0,techRequirements:[],buildTimeTicks:1,trainingOptions:id==='SHOP'?['COIN']:[]};}}):new DefStore();
 const w=createSession(ir,{seed:3,defStore,gc:makeNeutralGameConstants(),bountyMode:'script'});w.vm.drainEvents();w.sim.drainEvents();return w;
}
const textEvents=(w:ReturnType<typeof boot>)=>w.vm.drainEvents().filter(e=>e.kind==='TextDisplayed') as any[];
it('valid force recipients are insertion-order snapshots and an empty valid force is explicit',()=>{
 const w=boot(),force=w.vm.getGlobal('recipients');w.vm.callFunctionSync('Report',[]);const event=textEvents(w)[0];assert.deepEqual(event,{kind:'TextDisplayed',text:'plain',playerIds:[2,0]});
 w.vm.callFunctionSync('ForceClear',[force]);assert.deepEqual(event.playerIds,[2,0],'clearing the live force must not rewrite the previous event');
 w.vm.callFunctionSync('Report',[]);const empty=textEvents(w)[0];assert.deepEqual(empty.playerIds,[]);assert.equal(Object.hasOwn(empty,'playerIds'),true);
});
it('invalid, wrong-kind and missing forces retain generic text without inventing recipients',()=>{
 const w=boot(),group=w.vm.callFunctionSync('CreateGroup',[]);
 for(const force of [vhandle(null),vhandle(999999),group,vint(5)]){w.vm.callFunctionSync('DisplayTextToForce',[force,vstring('legacy')]);assert.deepEqual(textEvents(w),[{kind:'TextDisplayed',text:'legacy'}]);}
 w.vm.callFunctionSync('DisplayTextToForce',[vhandle(null),vint(7)]);assert.deepEqual(textEvents(w),[{kind:'TextDisplayed',text:''}]);
});
it('only actual unit handles in the current thread metadata supply a source unit',()=>{
 const w=boot(),id=w.vm.getGlobal('producer');w.vm.spawnThread('Report',[],{unit:id});assert.equal(textEvents(w)[0].sourceUnitId,id.v);
 const wrong=[{}, {unit:vint(id.v as number)}, {unit:vhandle(null)}, {unit:vhandle(999999)}, {unit:w.vm.getGlobal('recipients')}, {unit:w.vm.callFunctionSync('Player',[vint(0)])}];
 for(const meta of wrong){w.vm.spawnThread('Report',[],meta);const event=textEvents(w)[0];assert.equal(Object.hasOwn(event,'sourceUnitId'),false);assert.deepEqual(event.playerIds,[2,0]);}
});
it('a sleeping action keeps its own unit source across another thread without changing recipient semantics',()=>{
 const w=boot(),producer=w.vm.getGlobal('producer'),other=w.vm.getGlobal('other');w.vm.spawnThread('Delayed',[],{unit:producer});assert.deepEqual(textEvents(w).map(e=>[e.text,e.sourceUnitId,e.playerIds]),[['before',producer.v,[2,0]]]);
 w.vm.spawnThread('Report',[],{unit:other});assert.equal(textEvents(w)[0].sourceUnitId,other.v);w.sim.step();assert.deepEqual(textEvents(w),[]);w.sim.step();assert.deepEqual(textEvents(w).map(e=>[e.text,e.sourceUnitId,e.playerIds]),[['after',producer.v,[2,0]]]);
});
it('the existing training-finish bridge identifies the producer rather than the trained child',()=>{
 const w=boot(`globals
force recipients=null
unit producer=null
endglobals
function Finished takes nothing returns nothing
call DisplayTextToForce(recipients,"settled")
endfunction
function main takes nothing returns nothing
local trigger t=CreateTrigger()
set recipients=CreateForce()
call ForceAddPlayer(recipients,Player(0))
set producer=CreateUnit(Player(0),'SHOP',0.,0.,0.)
call TriggerRegisterUnitEvent(t,producer,EVENT_UNIT_TRAIN_FINISH)
call TriggerAddAction(t,function Finished)
endfunction`,true),id=w.vm.getGlobal('producer').v as number;
 assert.equal(w.sim.issueTrainUnit(0,id,'COIN'),true);w.sim.step();w.sim.step();const finished=w.sim.drainEvents().find(e=>e.kind==='TrainingFinished');assert.ok(finished);const event=textEvents(w).find(e=>e.text==='settled');assert.ok(event);assert.equal(event.sourceUnitId,id);assert.notEqual(event.sourceUnitId,finished.unitId);assert.deepEqual(event.playerIds,[0]);
});
it('text observation allocates no handles and changes no economy, RNG, scheduling time or state hash',()=>{
 const w=boot(),hash=w.sim.stateHash(),rng=w.sim.rng.getState(),tick=w.sim.tickCount,handles=w.vm.handles.size,ledger=JSON.stringify(w.sim.ledger.bySource());
 for(let i=0;i<3;i++)w.vm.callFunctionSync('Report',[]);assert.equal(textEvents(w).length,3);assert.equal(w.sim.stateHash(),hash);assert.equal(w.sim.rng.getState(),rng);assert.equal(w.sim.tickCount,tick);assert.equal(w.vm.handles.size,handles);assert.equal(JSON.stringify(w.sim.ledger.bySource()),ledger);
});
