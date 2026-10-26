import {it} from 'node:test';import assert from 'node:assert/strict';
import {createSession} from '../../src/runtime/session.ts';import {DefStore} from '../../src/sim/def-store.ts';import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';import {vint,vstring} from '../../src/jass/vm.ts';import type {MapIR} from '../../src/ir/types.ts';
const source=`globals
sound s=null
sound Br=null
sound array VA
integer array Ce
integer count=0
endglobals
function A takes nothing returns nothing
local integer i=1
call PlaySoundBJ(VA[Ce[i]])
call TriggerSleepAction(.1)
call PlaySoundBJ(Br)
endfunction
function B takes nothing returns nothing
call PlaySoundBJ(s)
endfunction
function RandomSound takes nothing returns nothing
call PlaySoundBJ(VA[GetRandomInt(1,50)])
endfunction
function main takes nothing returns nothing
local integer i=0
loop
exitwhen i>=96
set s=CreateSound("local-not-loaded.wav",false,false,false,10,10,"")
set i=i+1
endloop
set VA[40]=s
set Br=s
set Ce[1]=40
endfunction`;
function boot(script=source){const ir:MapIR={irVersion:1,info:{name:'sound observer fixture',author:'',suggestedPlayers:'1',playableWidth:1,playableHeight:1,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source:script,nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};const w=createSession(ir,{seed:6,defStore:new DefStore(),gc:makeNeutralGameConstants(),bountyMode:'script'});w.vm.drainEvents();w.sim.drainEvents();return w;}
it('observes the actual caller and safe array reference at original TSA timing after the presentation call becomes an explicit omission',()=>{const w=boot(),seen:any[]=[];assert.equal(typeof w.vm.observeSoundCalls,'function');const stop=w.vm.observeSoundCalls(call=>seen.push(call));const handles=w.vm.handles.size,hash=w.sim.stateHash();w.vm.spawnThread('A',[]);assert.equal(seen.length,1);assert.equal(seen[0].caller,'A');assert.deepEqual(seen[0].reference,{symbol:'VA',index:40});assert.equal(seen[0].tick,0);assert.equal(seen[0].line,10);assert.ok(seen[0].sequence>0);assert.deepEqual(w.vm.drainEvents(),[]);w.sim.step();assert.equal(seen.length,1);w.sim.step();assert.equal(seen.length,2);assert.equal(seen[1].tick,2);assert.deepEqual(seen[1].reference,{symbol:'Br',index:null});assert.equal(w.vm.handles.size,handles);assert.equal(w.vm.getGlobal('s').t,'int');assert.equal(w.vm.getGlobal('s').v,0);stop();w.vm.callFunctionSync('B',[]);assert.equal(seen.length,2);assert.equal(w.vm.handles.size,handles);});
it('does not reevaluate a side-effecting argument index or change RNG/state versus an unobserved execution',()=>{const a=boot(),b=boot(),seen:any[]=[];a.vm.observeSoundCalls(call=>seen.push(call));a.vm.callFunctionSync('RandomSound',[]);b.vm.callFunctionSync('RandomSound',[]);assert.equal(a.sim.rng.getState(),b.sim.rng.getState());assert.equal(a.sim.stateHash(),b.sim.stateHash());assert.equal(a.vm.handles.size,b.vm.handles.size);assert.deepEqual(a.vm.drainEvents(),b.vm.drainEvents());assert.equal(seen.length,1);assert.deepEqual(seen[0].reference,{symbol:'VA',index:null});});
it('listener errors and attempted mutation cannot change native output, globals, diagnostic order or later listeners',()=>{const w=boot(),seen:any[]=[];w.vm.registerNative('PlaySoundBJ',()=>vint(7));w.vm.observeSoundCalls(call=>{(call as any).reference.index=999;});w.vm.observeSoundCalls(()=>{throw Error('audio unavailable');});w.vm.observeSoundCalls(call=>seen.push(call));const before={hash:w.sim.stateHash(),rng:w.sim.rng.getState(),handles:w.vm.handles.size};assert.doesNotThrow(()=>w.vm.callFunctionSync('B',[]));assert.equal(seen.length,1);assert.equal(Object.isFrozen(seen[0]),true);assert.equal(Object.isFrozen(seen[0].reference),true);assert.equal(seen[0].reference.index,null);assert.deepEqual({hash:w.sim.stateHash(),rng:w.sim.rng.getState(),handles:w.vm.handles.size},before);assert.deepEqual(w.vm.drainEvents(),[]);assert.deepEqual(w.vm.callFunctionSync('PlaySoundBJ',[]),vint(7),'direct native return stays original');});
it('a user-defined PlaySoundBJ still executes and nested callbacks retain their own original caller',()=>{const w=boot(source.replace('function B takes','function PlaySoundBJ takes sound which returns nothing\nset count=count+1\nendfunction\nfunction B takes')),seen:any[]=[];w.vm.observeSoundCalls(call=>seen.push(call));w.vm.callFunctionSync('B',[]);assert.equal(w.vm.getGlobal('count').v,1);assert.equal(seen[0].caller,'B');assert.deepEqual(w.vm.drainEvents(),[]);});
it('event metadata is copied from existing player/unit handles and remains attached to the right sleeping thread',()=>{const w=boot(),events:any[]=[],p0=w.vm.callFunctionSync('Player',[vint(0)]),p1=w.vm.callFunctionSync('Player',[vint(1)]),unit=w.vm.callFunctionSync('CreateUnit',[p0,{t:'int',v:0x68303030},{t:'real',v:0},{t:'real',v:0},{t:'real',v:0}]);w.vm.drainEvents();w.vm.observeSoundCalls(call=>events.push(call));const count=w.vm.handles.size;w.vm.spawnThread('A',[],{player:p0,unit});w.vm.spawnThread('B',[],{player:p1});assert.deepEqual(events.map(e=>[e.caller,e.playerId,e.sourceUnitId]),[['A',0,unit.v],['B',1,undefined]]);w.sim.step();w.sim.step();assert.deepEqual(events.map(e=>e.playerId),[0,1,0]);assert.equal(events[2].sourceUnitId,unit.v);assert.equal(w.vm.handles.size,count);w.vm.spawnThread('B',[],{player:unit,unit:p0});assert.equal(Object.hasOwn(events.at(-1),'playerId'),false);assert.equal(Object.hasOwn(events.at(-1),'sourceUnitId'),false);});
it('an observed expression call keeps the registered native return value and evaluates its argument once',()=>{const w=boot(source.replace('function main takes','function Value takes nothing returns integer\nreturn PlaySoundBJ(s)\nendfunction\nfunction main takes')),events:any[]=[];let calls=0;w.vm.registerNative('PlaySoundBJ',(_ctx,args)=>{calls++;assert.deepEqual(args,[vint(0)]);return vint(9);});w.vm.observeSoundCalls(event=>events.push(event));assert.deepEqual(w.vm.callFunctionSync('Value',[]),vint(9));assert.equal(calls,1);assert.equal(events.length,1);assert.equal(events[0].caller,'Value');assert.deepEqual(w.vm.drainEvents(),[]);});
