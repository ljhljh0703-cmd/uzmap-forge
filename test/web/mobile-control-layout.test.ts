import {it} from 'node:test';
import assert from 'node:assert/strict';
import {mountResearchShortcut,mountFirstRunGuide} from '../../web/first-run-ui.js';
import {mountNextWave,formatNextWaveLine} from '../../web/battlefield-readability.js';
function fixture(){
 const nodes:any[]=[];
 function element(tag='div'){
  const classes=new Set();const e:any={tagName:tag.toUpperCase(),id:'',hidden:false,open:false,disabled:false,dataset:{},style:{},attrs:{},children:[],parentNode:null,textContent:'',title:'',
   classList:{add:(x:string)=>classes.add(x),remove:(x:string)=>classes.delete(x)},
   append(...items:any[]){for(const n of items){n.remove();n.parentNode=this;this.children.push(n);}},
   prepend(n:any){this.insertBefore(n,this.children[0]??null);},
   insertBefore(n:any,b:any){n.remove();n.parentNode=this;const i=this.children.indexOf(b);if(i<0)this.children.push(n);else this.children.splice(i,0,n);},
   remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}},
   setAttribute(k:string,v:string){this.attrs[k]=v;},getClientRects:()=>[{}],getContext:()=>({clearRect(){}})};
  nodes.push(e);return e;
 }
 const host=element();host.id='bottomPanel';const phase=element();phase.id='playPhase';const legend=element();phase.append(legend);
 const tray=element();tray.id='roundTray';const none=element();none.id='gemNone';const panel=element();panel.id='gemPanel';host.append(tray,none,panel);
 const life=element();life.id='hudLife';
 const doc:any={createElement:element,getElementById:(id:string)=>nodes.find(n=>n.id===id),querySelector:(s:string)=>s==='.phasebar'?phase:s==='#hudLife'?life:null};
 return {doc,host,phase,panel,tray,life};
}
it('the original selected controls precede research and wave details without cloning their nodes',()=>{
 const f=fixture(),original=f.panel;mountResearchShortcut(f.doc);mountNextWave(f.doc,()=>false);
 const ids=f.host.children.map((e:any)=>e.id);assert.ok(ids.indexOf('gemPanel')<ids.indexOf('researchShortcut'));
 assert.ok(ids.indexOf('researchShortcut')<ids.indexOf('nextWavePreview'));assert.equal(f.doc.getElementById('gemPanel'),original);
});
it('first-run help occupies the phase strip and never pushes the five slots or selected commands below the panel',()=>{
 const f=fixture(),before=[...f.host.children],guide=mountFirstRunGuide(f.doc);guide.render({step:3,text:'광산에 도착한 적은 생명을 줄여요',anchor:'life',manual:false});
 assert.equal(f.doc.getElementById('firstRunGuide').parentNode,f.phase);assert.deepEqual(f.host.children,before);assert.equal(f.phase.dataset.guideActive,'true');
 assert.equal(f.life.classList, f.doc.getElementById('hudLife').classList);guide.render(null);assert.equal(f.phase.dataset.guideActive,'false');
});
it('the phone wave line retains supplied source names and losses with compact units rather than an orphaned decrease phrase',()=>{
 const model={round:11,name:'11. 늑대인간 리키안',motion:'지상',count:10,life:3,band:'ground'};
 const line=formatNextWaveLine(model);assert.ok(line.includes(model.name));assert.ok(line.includes('10마리'));assert.ok(line.includes('-3/마리'));assert.ok(!line.includes('도착 = 생명'));assert.ok(!line.includes('감소'));
 const unknown=formatNextWaveLine({round:1,name:'원작 적',count:null,motion:'확인 중',life:null});assert.ok(!unknown.includes('-0'));assert.ok(unknown.includes('확인'));assert.equal(formatNextWaveLine(null),'');
});

it('wave disclosures obey visibility before signature caching, and preserve complete accessible loss information',()=>{
 const f=fixture(),view=mountNextWave(f.doc,()=>false),model={round:20,name:'20. 원작 보스',count:10,motion:'공중',life:6,band:'boss',typeId:'h00D'};
 view.render(model,{visible:true});const card=f.doc.getElementById('nextWavePreview'),phone=f.doc.getElementById('phoneWavePreview');
 assert.equal(card.hidden,false);assert.match(phone.attrs['aria-label'],/한 마리가 광산에 도착하면 생명 6 감소/);
 view.render(model,{visible:false});assert.equal(card.hidden,true);assert.equal(phone.hidden,true);view.render(model,{visible:true});assert.equal(card.hidden,false);
});
it('the short research caption keeps the full accessible price and stage and uses only the existing purchase callback',()=>{
 const f=fixture();const calls:any[]=[];const view=mountResearchShortcut(f.doc,{purchase:(id:any)=>calls.push(id)});
 const model={techId:'R000',label:'보석 등급 올리기 · 20골드 (0/8)',explanation:'다음 보석 등급',level:0,maxLevel:8,cost:20,disabled:true,reason:'골드 10 부족'};
 view.render(model);const button=f.doc.getElementById('quickResearch');assert.equal(button.textContent,'보석 등급 · 20골드');assert.equal(button.attrs['aria-label'],model.label);button.onclick();assert.deepEqual(calls,[]);
 view.render({...model,disabled:false,reason:''});assert.equal(f.doc.getElementById('quickResearch'),button);button.onclick();assert.deepEqual(calls,['R000']);
});
