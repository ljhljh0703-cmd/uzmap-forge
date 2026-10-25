import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../../web/first-run-guide.js';
const key='uzmap.ui.gemtower.tutorial.v1';
function fixture(initial:Record<string,string>={},options:any={}){
 const data=new Map(Object.entries(initial)),calls:any[]=[];
 const storage={getItem(id:string){calls.push(['get',id]);return data.get(id)??null;},setItem(id:string,value:string){calls.push(['set',id,value]);data.set(id,value);}};
 const guide=module.createFirstRunGuide({storage:()=>storage,...options});
 const input:any={ready:true,fresh:true,own:true,restoring:false,prepared:true,buildCount:0,choiceConfirmed:false,combatSeen:false,firstWaveEnded:false,round:1,life:15,gold:10,researchLevel:0,researchCost:20};
 const observe=(patch:any={})=>{Object.assign(input,patch);return guide.observe(input);};
 return{guide,input,observe,data,calls};
}
function toLife(f:ReturnType<typeof fixture>){assert.equal(f.observe()?.step,1);assert.equal(f.observe({buildCount:1}),null);assert.equal(f.observe({buildCount:5})?.step,2);assert.equal(f.observe({choiceConfirmed:true}),null);assert.equal(f.observe({prepared:false,combatSeen:true})?.step,3);}

describe('G1 nonblocking source-observed first-run guide',()=>{
 it('follows the four source-confirmed stages and writes one separate UI visit marker',()=>{
  const f=fixture();toLife(f);assert.equal(f.observe({firstWaveEnded:true,round:2,prepared:true,gold:27})?.step,4);
  assert.equal(f.observe({researchLevel:1,gold:7}),null);assert.equal(f.guide.snapshot(),null);
  assert.deepEqual(f.calls,[['get',key],['set',key,'seen']]);assert.deepEqual([...f.data.keys()],[key]);
 });
 it('consumes the visit at automatic entry so a reload midway shows no automatic guide',()=>{
  const f=fixture();assert.equal(f.observe()?.step,1);const next=fixture(Object.fromEntries(f.data));assert.equal(next.observe(),null);assert.equal(next.calls.filter(row=>row[0]==='set').length,0);
  for(const value of ['seen','unknown-version',''])assert.equal(fixture({[key]:value}).observe(),null);
 });
 it('starts only a ready fresh own first-round empty preparation, not a source selection or an old game',()=>{
  for(const patch of [{ready:false},{prepared:false},{buildCount:1},{round:2},{own:false},{fresh:false},{restoring:true},{restoredView:true}]){
   const f=fixture();assert.equal(f.observe(patch),null,JSON.stringify(patch));assert.equal(f.calls.length,0);
  }
  const f=fixture();assert.equal(f.observe({ready:false}),null);assert.equal(f.observe({ready:true})?.step,1);
 });
 it('does not advance on attempted construction or a failed choice without observed source progress',()=>{
  const f=fixture();assert.equal(f.observe()?.step,1);
  for(let i=0;i<5;i++)assert.equal(f.observe({pendingBuilds:5,placementPreview:true,buildCount:0})?.step,1);
  assert.equal(f.observe({buildCount:1}),null);assert.equal(f.observe({buildCount:4}),null);assert.equal(f.observe({buildCount:5})?.step,2);
  assert.equal(f.observe({choiceConfirmed:false})?.step,2);assert.equal(f.observe({choiceConfirmed:true}),null);
 });
 it('shows life help at the first combat and consumes it on an actual life decrease, including after buying more life',()=>{
  const f=fixture();toLife(f);assert.equal(f.observe({life:17})?.step,3);assert.equal(f.observe({life:16}),null);
  assert.equal(f.observe({round:2,prepared:true,gold:20})?.step,4);
 });
 it('also consumes the first life explanation when a clean first wave ends without any life loss',()=>{
  for(const ended of [{firstWaveEnded:true},{round:2}]){
   const f=fixture();toLife(f);assert.equal(f.observe({...ended,gold:27}),null);assert.equal(f.observe({prepared:true})?.step,4);
  }
 });
 it('latches source affordability during combat, waits for preparation, and still requires the current real price',()=>{
  const f=fixture();toLife(f);assert.equal(f.observe({gold:27})?.step,3);assert.equal(f.observe({firstWaveEnded:true,round:2,gold:7}),null);
  assert.equal(f.observe({prepared:true}),null);assert.equal(f.observe({gold:20})?.step,4);
  assert.equal(f.observe({prepared:false}),null);assert.equal(f.observe({prepared:true,gold:19}),null);assert.equal(f.observe({gold:20})?.step,4);
 });
 it('reads the supplied research cost and never invents a 20-gold permission or treats invalid prices as affordable',()=>{
  const f=fixture();f.input.researchCost=30;toLife(f);assert.equal(f.observe({firstWaveEnded:true,round:2,prepared:true,gold:29}),null);assert.equal(f.observe({gold:30})?.step,4);
  for(const cost of [undefined,NaN,Infinity,-1])assert.equal(f.observe({researchCost:cost,gold:100}),null);
 });
 it('consumes the research lesson after the same original research is bought from either existing UI entry point',()=>{
  for(const when of ['before-combat','during-combat','while-shown']){
   const f=fixture();f.observe();f.observe({buildCount:5});f.observe({choiceConfirmed:true});
   if(when==='before-combat')f.observe({researchLevel:1,gold:7});
   f.observe({prepared:false,combatSeen:true});if(when==='during-combat')f.observe({researchLevel:1,gold:7});
   const shown=f.observe({firstWaveEnded:true,round:2,prepared:true,gold:27});assert.equal(shown?.step??null,when==='while-shown'?4:null);
   if(when==='while-shown')assert.equal(f.observe({researchLevel:1,gold:7}),null);
   assert.equal(f.observe({researchLevel:1,gold:500}),null);
  }
 });
 it('suppresses automatic observation and rendering during restore or other-field viewing',()=>{
  const f=fixture();assert.equal(f.observe()?.step,1);
  assert.equal(f.observe({restoring:true,buildCount:5,choiceConfirmed:true,combatSeen:true,gold:50}),null);
  assert.equal(f.observe({restoring:false,buildCount:0,choiceConfirmed:false,combatSeen:false,gold:10})?.step,1);
  assert.equal(f.observe({own:false,buildCount:5}),null);assert.equal(f.observe({own:true,buildCount:0})?.step,1);
  assert.equal(f.observe({fresh:false,buildCount:5,round:1}),null);assert.equal(f.observe({fresh:false,round:2,prepared:true,gold:500}),null);
 });
 it('skip closes both manual and automatic cards for this visit without touching game progress',()=>{
  for(const stage of [1,2,3,4]){
   const f=fixture();f.observe();if(stage>1)f.observe({buildCount:5});if(stage>2){f.observe({choiceConfirmed:true});f.observe({prepared:false,combatSeen:true});}if(stage>3)f.observe({firstWaveEnded:true,round:2,prepared:true,gold:20});
   f.guide.openManual();assert.equal(f.guide.skip(),null);assert.equal(f.guide.snapshot(),null);assert.equal(f.observe(),null);
  }
 });
 it('off never reads or writes storage but still allows four manual reading cards',()=>{
  let accesses=0;const f=fixture({}, {off:true,storage:()=>{accesses++;throw Error('must not access');}});assert.equal(f.observe(),null);
  for(let step=1,card=f.guide.openManual();step<=4;step++,card=f.guide.next()){assert.equal(card?.step,step);assert.equal(card?.manual,true);}
  assert.equal(f.guide.snapshot(),null);assert.equal(f.observe(),null);assert.equal(accesses,0);
 });
 it('fails open on storage getter, getItem and setItem errors while manual reading remains available',()=>{
  const factories=[()=>{throw Error('getter blocked');},()=>({getItem(){throw Error('read blocked');},setItem(){throw Error('should not write');}}),()=>({getItem(){return null;},setItem(){throw Error('write blocked');}})];
  for(const storage of factories){const f=fixture({}, {storage});assert.doesNotThrow(()=>f.observe());assert.equal(f.observe(),null);assert.equal(f.guide.openManual()?.step,1);assert.equal(f.guide.next()?.step,2);assert.equal(f.guide.skip(),null);assert.equal(f.observe(),null);}
 });
 it('manual reading has four fixed texts, ends automatic display after all are read and never resets source observations',()=>{
  const f=fixture();f.observe();f.observe({buildCount:5});const before=structuredClone(f.input),first=f.guide.openManual();assert.equal(first?.manual,true);
  for(let step=2;step<=4;step++)assert.equal(f.guide.next()?.step,step);assert.equal(f.guide.next(),null);assert.deepEqual(f.input,before);assert.equal(f.observe(),null);
  assert.equal(f.guide.openManual()?.step,1);assert.equal(f.guide.skip(),null);assert.equal(f.observe(),null);
 });
 it('uses exactly the approved short copy and anchors, and returns detached models without changing frozen source snapshots',()=>{
  const f=fixture({}, {off:true}),expected=[['build','빈칸을 눌러 보석을 놓아요\n길 위에 놓으면 적이 돌아가요'],['hand','1개를 남기면 나머지는 바위가 돼요\n같은 보석 2개는 조합해 강화해요'],['life','광산에 도착한 적은 생명을 줄여요'],['research','골드로 다음 보석의 등급을 올려요']];
  for(let index=0,card=f.guide.openManual();index<4;index++,card=f.guide.next()){
   assert.deepEqual(card,{step:index+1,anchor:expected[index][0],text:expected[index][1],manual:true});const copy=f.guide.snapshot();copy.text='caller changed';assert.equal(f.guide.snapshot()?.text,expected[index][1]);
  }
  const g=fixture(),input=Object.freeze({...g.input,run:{rng:6,actions:Object.freeze([])}}),before=JSON.stringify(input);for(let i=0;i<40;i++)g.guide.observe(input);assert.equal(JSON.stringify(input),before);assert.equal(g.calls.length,2);
 });
});

it('first-view guide helpers share one implementation while previous module URLs preserve their APIs',async()=>{const guide=await import('../../web/first-run-guide.js'),wave=await import('../../web/wave-notices.js'),help=await import('../../web/source-help.js'),ui=await import('../../web/first-run-ui.js');for(const [api,old] of [['createWaveWarnings',wave],['createEnemyEncounters',wave],['sourceButtonHelp',help],['researchShortcutModel',ui],['mountResearchShortcut',ui],['mountFirstRunGuide',ui]] as const)assert.equal((guide as any)[api],(old as any)[api]);});
