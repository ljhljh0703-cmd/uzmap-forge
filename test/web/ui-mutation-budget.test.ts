import {it} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const helpers=await import('../../web/dom-state.js').catch(()=>({}));
const source=fs.readFileSync('web/main.js','utf8');
it('actual control and field renderers perform zero DOM writes for 120 identical frames, then update a changed field',()=>{
 let writes=0;const nodes=new Map();const bag=()=>new Proxy({}, {set(o,k,v){writes++;o[k]=v;return true;}});
 function node(id){if(nodes.has(id))return nodes.get(id);const attrs=new Map(),n:any={dataset:bag(),style:bag(),selectedOptions:[],value:'1',setAttribute(k,v){writes++;attrs.set(k,String(v));},getAttribute:k=>attrs.get(k)??null,querySelector:()=>node(id+'-span'),closest:()=>node(id+'-parent')};for(const key of ['hidden','disabled','inert','textContent','tabIndex','title']){let value=key==='textContent'||key==='title'?'':key==='tabIndex'?0:false;Object.defineProperty(n,key,{get:()=>value,set:v=>{writes++;value=v;}});}nodes.set(id,n);return n;}
 const context:any={...helpers,$:node,runtimeFailed:false,restoring:false,restoreCancelled:false,playing:true,RESEARCH_IDS:[],performance:{now:()=>1000},document:{hidden:false,querySelectorAll:()=>[]},gemTowerPlayerState:()=>({life:15,round:1}),lifeLossFeedback:()=>null,selectionStageHint:()=> '빈칸에 보석 건설',gemTowerPlayerGemIds:()=>[],lifeHud:{emit(){}}};
 for(const name of ['renderControls','renderFieldView'])vm.runInNewContext(source.match(new RegExp('function '+name+'\\([^]*?\\n}'))![0],context);
 const w:any={viewPlayerId:0,selectedGemId:null,pendingBuilds:[],modeDialog:{clicked:true},sim:{playerState:{getSlotState:()=>1},ledger:{gold:()=>10}}};
 const render=()=>{context.renderControls(w);context.renderFieldView(w);};render();writes=0;for(let i=0;i<120;i++)render();assert.equal(writes,0,'unchanged frames must not set reflected DOM state');w.viewPlayerId=1;render();assert.ok(writes>0);assert.equal(node('gameApp').dataset.field,'other');assert.equal(node('spectatorBanner').hidden,false);assert.equal(node('hudGold').textContent,'10');
});
