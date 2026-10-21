import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const actions=await import(new URL('../../web/gem-actions.js',import.meta.url).href);
const {listRunRecords,saveRunRecord}=await import(new URL('../../web/run-storage.js',import.meta.url).href);

const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
function declaration(name:string){const body=source.match(new RegExp('^(?:async )?function '+name+'\\([^\\n]*\\{[\\s\\S]*?\\n\\}','m'))?.[0];assert.ok(body,`actual ${name} function`);return body;}
function memoryStorage(){const data=new Map<string,string>();return {data,get length(){return data.size;},key(i:number){return [...data.keys()][i]??null;},getItem(k:string){return data.get(k)??null;},setItem(k:string,v:string){data.set(k,v);}};}
const build='a'.repeat(16);
const trace=(seed:number)=>({format:'uzmap-ui-input-v1',runId:'saved-run-0001',mode:'race',build,seed,tick:0,stateHash:'01234567',sourceVersion:null,actions:[]});

it('startup honors explicit zero and uint32 seeds; absent or malformed seeds request browser entropy',()=>{
 const lines=source.match(/^(?:const|let) sessionSeed = [^\n]+/m)?.[0];assert.ok(lines);
 let entropyCalls=0;const entropy={getRandomValues(out:Uint32Array){entropyCalls++;out[0]=99;return out;}};
 for(const [raw,expected] of [['0',0],['6',6],['4294967295',0xffffffff],[null,99],['bad',99],['4294967296',99]]){
  const context:any={...actions,sessionQuery:new URLSearchParams(raw===null?'':`seed=${raw}`),crypto:entropy};
  vm.runInNewContext(lines+'\nglobalThis.actual=sessionSeed;',context);assert.equal(context.actual,expected);
 }
 assert.equal(entropyCalls,3,'explicit URL seeds must not consume browser entropy');
});

it('new-game and play-again buttons request fresh entropy rather than replaying the explicit initial seed',async()=>{
 const callbacks=source.match(/^(?:\$\("reset"\)\.onclick = |if \(goRestart\) goRestart\.onclick = )[^\n]+/gm);assert.equal(callbacks?.length,2);
 for(const callback of callbacks!){
  let entropyCalls=0;const requested:number[]=[],reset:any={},goRestart:any={};
  const context:any={...actions,sessionSeed:6,world:{seed:6},restoring:false,goRestart,$:()=>reset,crypto:{getRandomValues(out:Uint32Array){entropyCalls++;out[0]=6;return out;}},loadFromUrl:async(seed:number)=>{requested.push(seed);context.sessionSeed=seed;return true;}};
  vm.runInNewContext(callback,context);await (callback.startsWith('if')?goRestart:reset).onclick();
  assert.equal(entropyCalls,1);assert.equal(requested.length,1);assert.notEqual(requested[0],6);assert.ok(requested[0]!>=0&&requested[0]!<=0xffffffff);
 }
});

it('same-build saved games can resume across a new-game seed, while other versions and classic remain protected',()=>{
 const store=memoryStorage();saveRunRecord(store,trace(7),1);saveRunRecord(store,{...trace(8),runId:'other-run-0001',build:'b'.repeat(16)},2);saveRunRecord(store,{...trace(9),runId:'classic-run-0001',mode:'classic'},3);
 const saved=listRunRecords(store,build,6);assert.equal(saved.find((r:any)=>r.trace?.seed===7)?.compatible,true);assert.equal(saved.find((r:any)=>r.trace?.seed===8)?.compatible,false);assert.equal(saved.find((r:any)=>r.trace?.seed===9)?.compatible,false);
});

it('snapshots record the world seed even while a different URL seed is still active',()=>{
 const snapshot=source.match(/^function runSnapshot\([^\n]+$/m)?.[0];assert.ok(snapshot);
 const context:any={sessionSeed:6,contentBuild:build,cam:{},gemTowerPlayerState:()=>({}),w:{seed:77,runId:'saved-run-0001',sim:{tickCount:0,stateHash:()=> '01234567'},inputLog:[]}};
 vm.runInNewContext(snapshot+'\nglobalThis.actual=runSnapshot(w);',context);assert.equal(context.actual.seed,77);
});

function restoration({mismatch=false,cancel=false}={}){
 const original={seed:6,runId:'original-run001'},saved=trace(77),loaded:any[]=[];let commits=0,paints=0;const nodes:any=new Proxy({}, {get(target:any,key:string){return target[key]??= {disabled:false,textContent:'',style:{},focus(){}};}});
 const context:any={world:original,sessionSeed:6,restoring:false,restoreCancelled:false,playing:true,contentBuild:build,validateInputReplay:actions.validateInputReplay,restoredRunId:(t:any)=>t.runId,$:(id:string)=>nodes[id],captureRunView:()=>({world:original}),restoreRunView:(before:any)=>{context.world=before.world;},renderControls(){},performance:{now:()=>0},frameClock:{reset(){}},setDrawer(){},flash(){},gemTowerPlayerState:()=>({}),textTags:[],goldTags:[],attackFx:[],render(){paints++;},commitSessionSeed:(seed:number)=>{assert.equal(context.world.sim.stateHash(),saved.stateHash,'publish only a verified replay');context.sessionSeed=seed;commits++;}};
 context.loadFromUrl=async(seed:number,options:any)=>{loaded.push({seed,options});assert.equal(context.sessionSeed,6,'URL seed stays unchanged during candidate boot');assert.equal(commits,0);context.world={seed,sim:{tickCount:0,stateHash:()=>mismatch?'fedcba98':'01234567',getUnit:()=>undefined},sourceVersion:null,runtimeCrashes:[],inputLog:[]};if(cancel)context.restoreCancelled=true;return true;};
 vm.runInNewContext(declaration('restoreRun'),context);
 return {context,saved,original,loaded,stats:()=>({commits,paints})};
}
it('strict restore boots the saved seed and publishes it only after validation succeeds',async()=>{
 const f=restoration();await f.context.restoreRun(f.saved);assert.equal(f.loaded.length,1);assert.equal(f.loaded[0].seed,77);assert.equal(f.loaded[0].options?.publishSeed,false);assert.equal(f.context.sessionSeed,77);assert.equal(f.context.world.runId,f.saved.runId);assert.equal(f.stats().commits,1);
});
it('mismatched and cancelled restores retain the old world and URL seed',async()=>{
 for(const options of [{mismatch:true},{cancel:true}]){const f=restoration(options);await f.context.restoreRun(f.saved);assert.equal(f.loaded.length,1);assert.equal(f.context.world,f.original);assert.equal(f.context.sessionSeed,6);assert.equal(f.stats().commits,0);}
});

it('publishing a verified seed keeps unrelated query fields and the URL fragment',()=>{
 const replaced:any[]=[],context:any={sessionSeed:6,URL,location:{href:'https://example.test/web/?seed=6&review=fixed#game'},history:{state:{preserve:true},replaceState(...args:any[]){replaced.push(args);}}};
 vm.runInNewContext(declaration('commitSessionSeed'),context);context.commitSessionSeed(77);assert.equal(context.sessionSeed,77);assert.equal(replaced.length,1);assert.equal(replaced[0][0],context.history.state);assert.equal(String(replaced[0][2]),'https://example.test/web/?seed=77&review=fixed#game');
});

it('actual loader passes each chosen seed to boot and withholds URL publication for a restore candidate',async()=>{
 const nodes:any=new Proxy({}, {get(target:any,key:string){return target[key]??= {textContent:'',dataset:{},style:{},hidden:true};}}),bootSeeds:number[]=[],published:number[]=[];
 const context:any={sessionSeed:6,selectedSource:{mapBytes:new ArrayBuffer(0),stockProfile:{}},localSourceMode:true,runtimeFailed:false,document:{documentElement:{dataset:{}}},setMsg(){},extractGemPresentation:()=>({}),frameClock:{reset(){}},drag:{on:false},$:(id:string)=>nodes[id],resize(){},boot:(_bytes:any,_names:any,_profile:any,seed:number)=>{bootSeeds.push(seed);return {seed,sim:{ledger:{gold:()=>10}}};},world:null,Map,renderChatHelp(){},render(){},commitSessionSeed:(seed:number)=>{published.push(seed);context.sessionSeed=seed;},console};
 vm.runInNewContext(declaration('loadFromUrl'),context);
 assert.equal(await context.loadFromUrl(),true);assert.equal(context.world.seed,6);assert.deepEqual(published,[6]);
 assert.equal(await context.loadFromUrl(77,{publishSeed:false}),true);assert.equal(context.world.seed,77);assert.deepEqual(published,[6]);assert.equal(context.sessionSeed,6);
 assert.equal(await context.loadFromUrl(88),true);assert.equal(context.world.seed,88);assert.deepEqual(published,[6,88]);assert.equal(context.sessionSeed,88);assert.deepEqual(bootSeeds,[6,77,88]);
});

it('repeated explicit seeds retain the existing deterministic RNG sequence without consuming more browser entropy',async()=>{
 const {Rng}=await import('../../src/sim/rng.ts');
 let draws=0;const entropy={getRandomValues(out:Uint32Array){draws++;out[0]=0xffffffff;return out;}};
 const fresh=(actions as any).freshSessionSeed(0xffffffff,entropy);assert.equal(fresh,0,'fresh-seed collision handling wraps within uint32');assert.equal(draws,1);
 const sample=(seed:number)=>{const rng=new Rng(seed);return Array.from({length:10},()=>rng.next());};
 assert.deepEqual(sample(actions.parseSessionSeed('6')),sample(actions.parseSessionSeed('6')));assert.notDeepEqual(sample(6),sample(fresh));assert.equal(draws,1);
});
