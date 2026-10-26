import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {MapIR} from '../../src/ir/types.ts';
import {createSession,readScriptMap} from '../../src/runtime/session.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {vhandle,vint} from '../../src/jass/vm.ts';

function irFor(source:string):MapIR{return {irVersion:1,info:{name:'attack event regression',author:'',suggestedPlayers:'1',playableWidth:32,playableHeight:32,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source,nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};}
const base=new DefStore();
function boot(actions='',registration='',callbacks=''){
 const ir=irFor(`globals
unit attacker=null
unit victim=null
unit otherVictim=null
integer globalHits=0
integer elevenHits=0
integer oneHits=0
integer individualHits=0
integer playerSeen=-1
unit unitSeen=null
unit attackerSeen=null
endglobals
function GlobalHit takes nothing returns nothing
set globalHits=globalHits+1
set playerSeen=GetPlayerId(GetTriggerPlayer())
set unitSeen=GetTriggerUnit()
set attackerSeen=GetAttacker()
endfunction
${callbacks}
function ElevenHit takes nothing returns nothing
set elevenHits=elevenHits+1
${actions}
endfunction
function OneHit takes nothing returns nothing
set oneHits=oneHits+1
endfunction
function IndividualHit takes nothing returns nothing
set individualHits=individualHits+1
endfunction
function main takes nothing returns nothing
local trigger all=CreateTrigger()
local trigger eleven=CreateTrigger()
local trigger one=CreateTrigger()
local trigger individual=CreateTrigger()
set attacker=CreateUnit(Player(0),'h00R',0.,0.,0.)
set victim=CreateUnit(Player(11),'h01K',50.,0.,0.)
set otherVictim=CreateUnit(Player(1),'h01K',100.,0.,0.)
call TriggerRegisterAnyUnitEventBJ(all,EVENT_PLAYER_UNIT_ATTACKED)
call TriggerAddAction(all,function GlobalHit)
call TriggerRegisterPlayerUnitEventSimple(eleven,Player(11),EVENT_PLAYER_UNIT_ATTACKED)
call TriggerAddAction(eleven,function ElevenHit)
call TriggerRegisterPlayerUnitEventSimple(one,Player(1),EVENT_PLAYER_UNIT_ATTACKED)
call TriggerAddAction(one,function OneHit)
${registration}
endfunction`);
 return createSession(ir,{seed:6,defStore:new DefStore({resolve(id){return {...base.getDef(id),moveSpeedU:0,attack:null};}}),gc:makeNeutralGameConstants(),bountyMode:'script'});
}
function emitAttack(w:ReturnType<typeof boot>,name='victim'){
 w.sim.emit({kind:'Attacked',attackerUnitId:w.vm.getGlobal('attacker').v as number,targetUnitId:w.vm.getGlobal(name).v as number});w.sim.step();
}

it('player attack events filter by victim owner while all-player events receive the full event context',()=>{
 const w=boot();emitAttack(w);
 assert.equal(w.vm.getGlobal('globalHits').v,1);assert.equal(w.vm.getGlobal('elevenHits').v,1);assert.equal(w.vm.getGlobal('oneHits').v,0);
 assert.equal(w.vm.getGlobal('playerSeen').v,11);assert.equal(w.vm.getGlobal('unitSeen').v,w.vm.getGlobal('victim').v);assert.equal(w.vm.getGlobal('attackerSeen').v,w.vm.getGlobal('attacker').v);
 emitAttack(w,'otherVictim');assert.equal(w.vm.getGlobal('globalHits').v,2);assert.equal(w.vm.getGlobal('elevenHits').v,1);assert.equal(w.vm.getGlobal('oneHits').v,1);assert.equal(w.vm.getGlobal('playerSeen').v,1);
});

it('a lethal weapon hit still supplies the victim owner after common settlement removes the entity',()=>{
 const w=boot();const victim=w.vm.getGlobal('victim').v as number;
 w.sim.emit({kind:'Attacked',attackerUnitId:w.vm.getGlobal('attacker').v as number,targetUnitId:victim});
 w.vm.callFunctionSync('KillUnit',[vhandle(victim)]);assert.equal(w.sim.getUnit(victim),undefined);w.sim.step();
 assert.equal(w.vm.getGlobal('globalHits').v,1);assert.equal(w.vm.getGlobal('elevenHits').v,1);assert.equal(w.vm.getGlobal('oneHits').v,0);assert.equal(w.vm.getGlobal('playerSeen').v,11);
});

it('one dispatch snapshots its victim owner before any subscriber changes unit ownership',()=>{
 const w=boot('',`call TriggerAddAction(all,function Reassign)`);
 // Register a source action after the ordinary global observer but before player-specific subscription dispatch.
 w.vm.registerNative('Reassign',ctx=>{w.vm.callFunctionSync('SetUnitOwner',[ctx.threadMeta.unit!,w.vm.callFunctionSync('Player',[vint(1)]),{t:'bool',v:false}]);return vint(0);});
 emitAttack(w);assert.equal(w.sim.getUnit(w.vm.getGlobal('victim').v as number)!.owner,1);
 assert.equal(w.vm.getGlobal('elevenHits').v,1);assert.equal(w.vm.getGlobal('oneHits').v,0);
});

it('a sleeping action retains its attack player context across a second event',()=>{
 const w=boot(`call TriggerSleepAction(.1)
set playerSeen=GetPlayerId(GetTriggerPlayer())
set unitSeen=GetTriggerUnit()
set attackerSeen=GetAttacker()`);
 emitAttack(w);emitAttack(w,'otherVictim');w.sim.step();
 assert.equal(w.vm.getGlobal('playerSeen').v,11);assert.equal(w.vm.getGlobal('unitSeen').v,w.vm.getGlobal('victim').v);assert.equal(w.vm.getGlobal('attackerSeen').v,w.vm.getGlobal('attacker').v);
 assert.equal(w.vm.getGlobal('elevenHits').v,1);assert.equal(w.vm.getGlobal('oneHits').v,1);
});

it('unsupported individual-unit attack registration never receives player attack events or becomes a death subscription',()=>{
 const w=boot('',`call TriggerRegisterUnitEvent(individual,victim,EVENT_UNIT_ATTACKED)
call TriggerAddAction(individual,function IndividualHit)`);emitAttack(w);w.vm.callFunctionSync('KillUnit',[w.vm.getGlobal('victim')]);w.sim.step();
 assert.equal(w.vm.getGlobal('individualHits').v,0);assert.ok(w.vm.drainEvents().some(e=>e.kind==='UnimplementedNative'&&e.name==='TriggerRegisterUnitEvent:unsupported-event'));
});

it('the local original registers seven victim-Player11 attack handlers, including source slate behavior',t=>{
 const map=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url);if(!fs.existsSync(map)){t.skip('user-local original map required');return;}
 const {ir}=readScriptMap(new Uint8Array(fs.readFileSync(map)),'local');
 assert.equal([...ir.script.source.matchAll(/TriggerRegisterPlayerUnitEventSimple\(\w+,Player\(\$B\),EVENT_PLAYER_UNIT_ATTACKED\)/g)].length,7);
 assert.ok(ir.script.source.includes('SetUnitMoveSpeed(GetTriggerUnit(),(GetUnitDefaultMoveSpeed(GetTriggerUnit())*.85))'));
});

it('nested force callbacks retain the original player attack context instead of the enumerated player',()=>{
 const w=boot(`local force members=CreateForce()
call ForceAddPlayer(members,Player(1))
call ForForce(members,function NestedRead)
call DestroyForce(members)`,'',`function NestedRead takes nothing returns nothing
set individualHits=individualHits+1
set playerSeen=GetPlayerId(GetTriggerPlayer())
set unitSeen=GetTriggerUnit()
set attackerSeen=GetAttacker()
endfunction`);emitAttack(w);
 assert.equal(w.vm.getGlobal('individualHits').v,1);assert.equal(w.vm.getGlobal('playerSeen').v,11);
 assert.equal(w.vm.getGlobal('unitSeen').v,w.vm.getGlobal('victim').v);assert.equal(w.vm.getGlobal('attackerSeen').v,w.vm.getGlobal('attacker').v);
});

it('attack-start event damage remains zero and does not activate a damage-event-only branch',()=>{const w=boot('if GetEventDamage()>0. then\nset oneHits=oneHits+1000\nendif');emitAttack(w);assert.equal(w.vm.getGlobal('elevenHits').v,1);assert.equal(w.vm.getGlobal('oneHits').v,0);assert.equal(w.vm.drainEvents().some(e=>e.kind==='UnimplementedNative'&&e.name==='GetEventDamage'),false);});
