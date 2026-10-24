import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as notices from '../../web/wave-notices.js';
const bounds=Object.freeze({minX:-100,minY:0,maxX:100,maxY:200});
const entity=(typeId:string,extra:any={})=>Object.freeze({id:1,typeId,alive:true,owner:11,x:0,y:100,...extra});
function fixture(extra:any={}){
 let time=100;assert.equal(typeof (notices as any).createEnemyEncounters,'function');
 const view=(notices as any).createEnemyEncounters({now:()=>time,...extra});
 return{view,time:(value:number)=>{time=value;},observe:(entities:any[],options:any={})=>view.observe({entities,bounds,...options})};
}

test('ten real enemies of one type activate one card and repeated observations never restart its TTL',()=>{
 const f=fixture(),enemies=Object.freeze(Array.from({length:10},(_,index)=>entity('h00D',{id:index+1}))),before=JSON.stringify(enemies);
 assert.deepEqual(f.observe(enemies as any),{typeId:'h00D',until:1600});
 f.time(800);assert.equal(f.observe(enemies as any),null);assert.deepEqual(f.view.snapshot(),{typeId:'h00D',until:1600});
 assert.equal(JSON.stringify(enemies),before);
});

test('the card lasts1500 wall-clock milliseconds, independently of simulation ticks and repeated rendering',()=>{
 const f=fixture();f.observe([entity('h00D')]);
 for(let tick=0;tick<1000;tick++)assert.equal(f.observe([entity('h00D',{tick})]),null);
 f.time(1599);assert.ok(f.view.snapshot());f.time(1600);assert.equal(f.view.snapshot(),null);
 f.time(2000);assert.equal(f.observe([entity('h00D')]),null,'returning same type does not start another card');
});

test('dead, foreign-owner, outside-field and preview-only models never consume an encounter',()=>{
 const f=fixture();
 for(const bad of [{alive:false},{owner:0},{owner:10},{x:101},{x:-101},{y:-1},{y:201},{x:NaN}])assert.equal(f.observe([entity('h00D',bad)]),null);
 assert.equal(f.observe([{typeId:'h00D',round:1,motion:'공중',band:'flying',name:'미리보기'}]),null);
 assert.equal(f.view.snapshot(),null);assert.equal(f.observe([entity('h00D')])?.typeId,'h00D');
});

test('own source bounds include their edges; another field cannot prevent a later own-field first encounter',()=>{
 for(const [x,y]of [[-100,0],[100,200]]){const f=fixture();assert.equal(f.observe([entity('h00D',{x,y})])?.typeId,'h00D');}
 const f=fixture();assert.equal(f.observe([entity('h00D',{x:2000,y:100})]),null);
 assert.equal(f.observe([entity('h00D')])?.typeId,'h00D');
});

test('suppressed restore consumes real types, clears pending visuals and never replays history afterward',()=>{
 const f=fixture();f.observe([entity('h00D'),entity('h00Z')]);
 assert.equal(f.observe([entity('h010')],{suppressed:true}),null);assert.equal(f.view.snapshot(),null);
 f.time(10000);assert.equal(f.observe([entity('h00D'),entity('h00Z'),entity('h010')]),null);assert.equal(f.view.snapshot(),null);
 assert.equal(f.observe([entity('h011')])?.typeId,'h011','new actual type after restore still receives one card');
});

test('FIFO has one active card and at most three pending distinct types, with dropped overflow consumed as history',()=>{
 const f=fixture();assert.equal(f.observe(['h001','h002','h003','h004','h005','h002'].map(type=>entity(type)))?.typeId,'h001');
 for(const [at,id]of [[1600,'h002'],[3100,'h003'],[4600,'h004']] as const){f.time(at);assert.equal(f.view.snapshot()?.typeId,id);}
 f.time(6100);assert.equal(f.view.snapshot(),null);
 assert.equal(f.observe([entity('h005')]),null,'overflow must not become a stale late card');
});

test('observe can advance an expired queued card exactly once and snapshot returns the active copy',()=>{
 const f=fixture();f.observe([entity('h001'),entity('h002')]);f.time(1600);
 assert.deepEqual(f.observe([entity('h002')]),{typeId:'h002',until:3100});assert.equal(f.observe([entity('h002')]),null);
 const copy=f.view.snapshot();copy.typeId='changed';copy.until=0;assert.deepEqual(f.view.snapshot(),{typeId:'h002',until:3100});
});

test('clear removes active and queued cards but preserves every observed type; a fresh world starts fresh',()=>{
 const f=fixture();f.observe([entity('h001'),entity('h002')]);f.view.clear();assert.equal(f.view.snapshot(),null);
 assert.equal(f.observe([entity('h001'),entity('h002')]),null);f.time(5000);assert.equal(f.view.snapshot(),null);
 assert.equal(f.observe([entity('h003')])?.typeId,'h003');assert.equal(fixture().observe([entity('h001')])?.typeId,'h001');
});

test('late wall-clock updates give the next queued type a complete visible duration, without replaying expired cards instantly',()=>{
 const f=fixture();f.observe([entity('h001'),entity('h002')]);f.time(10000);
 assert.deepEqual(f.view.snapshot(),{typeId:'h002',until:11500});f.time(11499);assert.ok(f.view.snapshot());f.time(11500);assert.equal(f.view.snapshot(),null);
});

test('missing geometry, empty type and non-real model data stay quiet without damaging later valid input',()=>{
 const f=fixture();assert.equal(f.observe([entity('h001')],{bounds:null}),null);assert.equal(f.observe([entity('')]),null);
 assert.equal(f.view.observe({entities:[],bounds}),null);assert.equal(f.observe([entity('h001')])?.typeId,'h001');
});
