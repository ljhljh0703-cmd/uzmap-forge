import {it} from 'node:test';
import assert from 'node:assert/strict';
import * as view from '../../web/battlefield-readability.js';
import {parseJass} from '../../src/jass/parser.ts';
import {existsSync,readFileSync} from 'node:fs';
const bounds={minX:0,maxX:2304,minY:0,maxY:2944};
it('desktop field gives only the fitted board width to the canvas and keeps padding below40px at both PC sizes',()=>{
 for(const [width,height] of [[1440,764],[1280,664]]){
  const a=(view as any).desktopFieldLayout(bounds,width,height);assert.ok(a);assert.ok(a.sidebarWidth>=360);assert.ok(a.gutter<=40);assert.ok(a.boardHeight/height>=.9);assert.ok(Math.abs(a.fieldWidth+a.sidebarWidth-width)<1);assert.ok(Math.abs(a.boardHeight/a.boardWidth-(bounds.maxY-bounds.minY)/(bounds.maxX-bounds.minX))<1e-12);
 }
 assert.equal((view as any).desktopFieldLayout(bounds,900,700),null);assert.equal((view as any).desktopFieldLayout(null,1440,900),null);
});
it('source wave sizes count actual original spawn calls with the existing JASS parser, keeping other calls out',()=>{
 const src=`function mke takes nothing returns nothing
call CreateNUnitsAtLoc(1,b[Ce[1]],Player(11),x[1],0.)
call TriggerSleepAction(.1)
call CreateNUnitsAtLoc(2,b[Ce[1]],Player(11),x[1],0.)
endfunction
function MVe takes nothing returns nothing
call CreateNUnitsAtLoc(4,b[Ce[2]],Player(11),x[2],0.)
endfunction
function Sd takes nothing returns nothing
call CreateNUnitsAtLoc(5,te,Player(11),x[1],0.)
endfunction
function other takes nothing returns nothing
call CreateNUnitsAtLoc(99,b[Ce[1]],Player(11),x[1],0.)
endfunction`;
 assert.deepEqual((view as any).sourceWaveCounts(src,parseJass),{race:[3,4],classic:5});assert.deepEqual((view as any).sourceWaveCounts('',parseJass),{race:[null,null],classic:null});
});
it('next-wave facts use source round and chosen state; missing definitions never invent a movement class or life cost',()=>{
 const state={round:9,chosen:true},before=structuredClone(state);const def={movementType:'fly',pointValue:3};
 const a=(view as any).nextWaveView({state,total:50,typeId:'h00D',name:'원작 적',count:10,def,airborne:true});assert.equal(a.round,10);assert.equal(a.life,3);assert.equal(a.count,10);assert.equal(a.motion,'공중');assert.deepEqual(state,before);
 assert.equal((view as any).nextWaveView({state:{round:50,chosen:true},total:50}),null);
 const unknown=(view as any).nextWaveView({state:{round:1,chosen:false},total:50,typeId:null,count:null,def:null});assert.equal(unknown.life,null);assert.equal(unknown.motion,'확인 중');assert.equal(unknown.count,null);
});

const localSource=existsSync('fixtures/maps/GemTower_Max_7C.w3x')&&process.env.GEM_E_FIXED_SOURCE!=='1';
it((localSource?'provided original':'fixed semantic fixture')+': single-field spawn counts are ten in each mode',async()=>{let source;if(localSource){const {readScriptMap}=await import('../../src/runtime/session.ts');source=readScriptMap(new Uint8Array(readFileSync('fixtures/maps/GemTower_Max_7C.w3x')),'source').ir.script.source;}else{source=['mke','MVe','Sd'].map(name=>'function '+name+' takes nothing returns nothing\n'+Array.from({length:10},()=>"call CreateNUnitsAtLoc(1,"+(name==='Sd'?'te':'b[Ce[1]]')+",Player(11),x[1],0.)").join('\n')+'\nendfunction').join('\n');}assert.deepEqual((view as any).sourceWaveCounts(source,parseJass),{race:[10,10],classic:10});});
