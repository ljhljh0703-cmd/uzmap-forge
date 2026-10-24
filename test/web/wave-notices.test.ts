import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as notices from '../../web/wave-notices.js';
import {sourceWaveCounts,nextWaveView} from '../../web/battlefield-readability.js';
import {creepVisualPresentation} from '../../web/play-ui.js';
import {readScriptMap,createSession} from '../../src/runtime/session.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {parseMiscConstants} from '../../src/formats/misc.ts';
import {parseJass} from '../../src/jass/parser.ts';
import {createGemTowerSourceDefs} from '../../src/runtime/maps/gemtower.ts';
import {GEMTOWER_BALANCE as cfg,GEMTOWER_SOLO_SLOTS} from '../../src/sim/balance/configs/gemtower.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {vint,vbool,vhandle} from '../../src/jass/vm.ts';
import {fourCC} from '../../src/ir/fourcc.ts';
import {makeSyntheticIr} from '../sim/helpers.ts';
const create=(options:any)=>{assert.equal(typeof (notices as any).createWaveWarnings,'function');return (notices as any).createWaveWarnings(options);};
function waves({air=1,bosses=[10,15,20,25,30]}:{air?:number,bosses?:number[]}={}){
 const models=Array.from({length:50},(_,index)=>Object.freeze({round:index+1,motion:index+1===air?'공중':'지상',band:bosses.includes(index+1)?'boss':'ground',life:1,name:'적 '+(index+1),typeId:'h00D',count:10}));
 return{models,waveAt:(n:number)=>models[n-1]??null};
}

test('first source air wave1 warns once in initial preparation with an honest this-wave label and live air count',()=>{
 const source=waves(),before=JSON.stringify(source.models),w=create({...source,airCount:()=>3});
 assert.equal(w.observe({round:1,prepared:false}),null);
 assert.deepEqual(w.observe({round:1,prepared:true}),{kind:'air',targetWave:1,text:'이번 웨이브 공중 · 공중은 미로를 무시해요 · 공중을 칠 수 있는 보석 3개'});
 for(let i=0;i<20;i++)assert.equal(w.observe({round:1,prepared:true}),null);
 assert.equal(JSON.stringify(source.models),before);
});

test('boss warning is two rounds early in preparation, with no warning caused by combat or duplicate render',()=>{
 const w=create(waves({air:4}));assert.equal(w.observe({round:8,prepared:false}),null);
 assert.deepEqual(w.observe({round:8,prepared:true}),{kind:'boss',targetWave:10,text:'2웨이브 뒤 보스 · 공격력 높은 보석을 길 가까이'});
 assert.equal(w.observe({round:8,prepared:true}),null);assert.equal(w.observe({round:9,prepared:true}),null);
});

test('only the first authored airborne type warns; later air waves do not restart the notice',()=>{
 const source=waves({air:4}),air=source.models[3],w=create({...source,airCount:()=>2});
 const result=w.observe({round:2,prepared:true});assert.equal(result?.kind,'air');assert.equal(result?.targetWave,4);assert.match(result?.text,/2웨이브 뒤 공중/);assert.match(result?.text,/보석 2개/);
 assert.equal(w.observe({round:2,prepared:true}),null);
 assert.equal(w.observe({round:4,prepared:true}),null);assert.equal(source.models[3],air);
});

test('suppressed replay consumes warning opportunities without making them play after restore',()=>{
 const w=create(waves());assert.equal(w.observe({round:1,prepared:true,suppressed:true}),null);
 assert.equal(w.observe({round:1,prepared:true}),null);
 assert.equal(w.observe({round:8,prepared:true,suppressed:true}),null);
 for(let i=0;i<5;i++)assert.equal(w.observe({round:8,prepared:true}),null);
 assert.equal(w.observe({round:13,prepared:true})?.targetWave,15);
 assert.equal(w.observe({round:8,prepared:true}),null,'backward historical observations cannot replay the past');
});

test('a run emits at most boss count plus one; each world owns a fresh warning history',()=>{
 const source=waves(),a=create(source),seen:any[]=[];
 for(let round=1;round<=50;round++)for(let repeat=0;repeat<3;repeat++){
  const item=a.observe({round,prepared:true});if(item)seen.push(item);
  assert.equal(a.observe({round,prepared:false}),null);
 }
 assert.deepEqual(seen.map(item=>[item.kind,item.targetWave]),[['air',1],['boss',10],['boss',15],['boss',20],['boss',25],['boss',30]]);
 assert.equal(create(source).observe({round:1,prepared:true})?.kind,'air');
});

test('simultaneous boss and first-air opportunity has one boss-priority response, never a second response on the same preparation',()=>{
 const w=create(waves({air:10}));assert.equal(w.observe({round:8,prepared:true})?.kind,'boss');
 assert.equal(w.observe({round:8,prepared:true}),null);assert.equal(w.observe({round:9,prepared:true}),null);
});

test('missing or unresolved models never invent the first air wave or a boss',()=>{
 const source=waves({air:4}),w=create({waveAt:(n:number)=>n===1?null:source.waveAt(n)});
 assert.equal(w.observe({round:2,prepared:true}),null,'unknown earlier wave prevents calling wave4 the first airborne wave');
 const noData=create({waveAt:()=>null});for(const round of [1,8,13,48,50])assert.equal(noData.observe({round,prepared:true}),null);
 const unknownMotion=create({waveAt:(n:number)=>n===1?{...source.waveAt(n),motion:'확인 중'}:source.waveAt(n)});
 assert.equal(unknownMotion.observe({round:2,prepared:true}),null);
});

test('invalid rounds and end-of-run boundaries are silent without poisoning the first real observation',()=>{
 const w=create(waves());for(const round of [0,-1,1.5,NaN,Infinity,51])assert.equal(w.observe({round,prepared:true}),null);
 assert.equal(w.observe({round:1,prepared:true})?.targetWave,1);
 assert.equal(w.observe({round:50,prepared:true}),null);
});

test('the observer neither mutates source models nor treats late earlier rounds as new preparation',()=>{
 const source=waves(),before=JSON.stringify(source.models),w=create(source);
 assert.equal(w.observe({round:9,prepared:false}),null);assert.equal(w.observe({round:1,prepared:true}),null);assert.equal(w.observe({round:8,prepared:true}),null);
 assert.equal(JSON.stringify(source.models),before);
});

test('unknown air-count data is labelled as unknown rather than leaking NaN or inventing an available tower',()=>{
 for(const count of [NaN,-1,1.5,Infinity]){
  const w=create({...waves(),airCount:()=>count}),result=w.observe({round:1,prepared:true});assert.equal(result?.kind,'air');assert.doesNotMatch(result?.text,/NaN|undefined|Infinity/);assert.match(result?.text,/수 확인 중/);
 }
});

// Fixed semantic fixtures contain scalar source facts, not an original map or
// copied Warcraft file. This path runs rather than skips on clean CI.
const expected=[
 [1,'h00D','fly',1],[2,'h00Z','foot',1],[3,'h010','foot',1],[4,'h011','fly',2],
 [5,'h012','foot',2],[6,'h013','foot',2],[7,'h01C','foot',2],[8,'h01D','fly',3],
 [9,'h01E','foot',3],[10,'h01F','foot',3],[11,'h01G','foot',3],[12,'h01H','fly',4],
 [20,'h01R','fly',6],[35,'h03K','foot',9],[40,'h02F','fly',20]
] as const;
const mapPath='fixtures/maps/GemTower_Max_7C.w3x',profilePath='fixtures/stock/unit-abilities.json';
const supplied=process.env.GEM_G5_FIXED_SOURCE!=='1'&&fs.existsSync(mapPath)&&fs.existsSync(profilePath);
let loaded:any,profile:any;
if(supplied){loaded=readScriptMap(new Uint8Array(fs.readFileSync(mapPath)),'GemTower_Max_7C.w3x');profile=parseUnitAbilityProfile(JSON.parse(fs.readFileSync(profilePath,'utf8')));}
else{
 const ir=makeSyntheticIr();ir.objectMods=expected.map(([,id,movementType,life])=>({kind:'unit',baseId:'hfoo',newId:id,mods:[{field:'unam',value:'고정 의미 표본 '+id},{field:'umvt',value:movementType},{field:'upoi',value:life},{field:'uabi',value:''}]}));
 const declarations='globals\ninteger Be=2\ninteger a=1\ninteger te=0\ninteger array b\ninteger array Ce\nboolean array n\nendglobals\n';
 const functions=['mke','MVe','Sd'].map((name,index)=>'function '+name+' takes nothing returns nothing\n'+Array.from({length:10},()=>`call CreateUnit(Player(11),${name==='Sd'?'te':`b[Ce[${index===1?2:1}]]`},0.,0.,0.)`).join('\n')+'\nendfunction').join('\n');
 // Keep spawn counting semantically separate: sourceWaveCounts counts explicit
 // CreateNUnitsAtLoc, and the actual fixture VM executes that existing native.
 ir.script.source=declarations+functions.replace(/CreateUnit\(Player\(11\),([^,]+),0\.,0\.,0\.\)/g,'CreateNUnitsAtLoc(1,$1,Player(11),Location(0.,0.),0.)')+'\nfunction main takes nothing returns nothing\n'+expected.map(([wave,id])=>`set b[${wave}]='${id}'`).join('\n')+'\nendfunction';
 loaded={ir,archive:null};profile={units:[{kind:'unit',baseId:'hfoo',newId:null,mods:[{field:'uabi',value:''}]}],abilities:[],pathingTextures:{}};
}
const counts=sourceWaveCounts(loaded.ir.script.source,parseJass),spawnEvidence:any[]=[];
function controlledSpawn(wave:number,mode:'race-p0'|'race-p1'|'classic'){
 const s=createSession(loaded.ir,{seed:6,defStore:supplied?createGemTowerSourceDefs(profile.units,loaded.ir.objectMods).defStore:new DefStore(),stockUnits:profile.units,stockAbilities:profile.abilities,playerSlots:GEMTOWER_SOLO_SLOTS,gc:supplied?parseMiscConstants(loaded.archive.read('war3mapMisc.txt'),cfg.armorTypeColumnOrder,profile.gameplayConstants):makeNeutralGameConstants(),bountyMode:cfg.bountyMode,life:cfg.life,researchConfig:cfg.researches});
 s.vm.drainEvents();s.sim.drainEvents();const player=mode==='race-p1'?1:0,index=player+1;
 // TEST ONLY: invoke an original spawn function at a selected source stage.
 // These are control inputs, not a natural-play claim or product commands.
 s.vm.setGlobal('Be',vint(mode==='classic'?1:2));s.vm.setGlobalIndexed('Ce',index,vint(wave));s.vm.setGlobalIndexed('n',index,vbool(true));
 if(mode==='classic'){s.vm.setGlobal('a',vint(wave));s.vm.setGlobal('te',s.vm.getGlobalIndexed('b',wave));}
 const raw=s.vm.getGlobalIndexed('b',wave);assert.equal(raw.t,'int');const typeId=fourCC((raw as any).v),def=s.defStore.getDef(typeId),visual=creepVisualPresentation(cfg.roleTable[typeId],def),model=nextWaveView({state:{round:wave,chosen:false},total:50,typeId,name:def.name,count:mode==='classic'?counts.classic:counts.race[player],def,airborne:visual.airborne});
 const base=new Set(s.sim.entities.keys()),seen=new Map<number,any>(),errors:any[]=[];
 const observe=()=>{for(const e of s.sim.entities.values())if(e.owner===11&&!base.has(e.id)&&!seen.has(e.id)){
  const actual=s.defStore.getDef(e.typeId),before=s.sim.stateHash(),point=s.vm.callFunctionSync('GetUnitPointValue',[vhandle(e.id)]);
  const after=s.sim.stateHash();assert.equal(after,before,'read-only native/view observations do not change gameplay');
  seen.set(e.id,{id:e.id,typeId:e.typeId,movementType:actual.movementType,pointValue:point.t==='int'?point.v:null});
 }};
 const action=mode==='classic'?'Sd':mode==='race-p1'?'MVe':'mke';s.vm.spawnThread(action,[]);observe();
 for(let tick=0;tick<500;tick++){s.sim.step();observe();errors.push(...s.vm.drainEvents().filter(event=>event.kind==='ThreadCrashed'));s.sim.drainEvents();}
 const row={proof:supplied?'controlled provided-original spawn function':'controlled fixed semantic fixture; not original-map proof',wave,mode,sourceFunction:action,controlGlobals:mode==='classic'?['Be','Ce[player]','n[player]','a','te']:['Be','Ce[player]','n[player]'],model,actual:[...seen.values()],crashes:errors};spawnEvidence.push(row);
 assert.equal(errors.length,0);assert.equal(seen.size,model?.count);assert.equal(model?.count,10);
 for(const actual of seen.values()){assert.equal(actual.typeId,typeId);assert.equal(actual.movementType==='fly',model?.motion==='공중');assert.equal(actual.pointValue,model?.life);}
 return row;
}
for(const [wave,id,movementType,life]of expected)test(`${supplied?'provided original':'fixed semantic fixture'}: controlled wave${wave} spawns match source preview type, count, flight and native point value`,()=>{
 const row=controlledSpawn(wave,'race-p0');assert.equal(row.model?.typeId,id);assert.equal(row.model?.motion,movementType==='fly'?'공중':'지상');assert.equal(row.model?.life,life);
});
for(const mode of ['race-p1','classic'] as const)test(`${supplied?'provided original':'fixed semantic fixture'}: controlled ${mode} wave40 also matches its own actual spawn count`,()=>{controlledSpawn(40,mode);});
after(()=>{
 const target=process.env.G5_SPAWN_EVIDENCE;if(!target)return;
 const expectedTarget=path.resolve('artifacts/g-first-run/G5-source-spawn.json');assert.equal(path.resolve(target),expectedTarget,'evidence only writes to the assigned G5 artifact');
 fs.mkdirSync(path.dirname(expectedTarget),{recursive:true});fs.writeFileSync(expectedTarget,JSON.stringify({state:'provisional',gate:'gate_pending',source:supplied?'provided original':'fixed semantic fixture',naturalPlay:false,sourceCounts:counts,samples:spawnEvidence},null,2)+'\n');
});
