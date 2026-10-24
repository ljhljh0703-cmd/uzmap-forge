import {it} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {casinoViewModel,dispatchCasinoApproach} from '../../web/ui-skin.js';
const payout=()=>({base:{two:35,three:80,jackpot:200},factor:5,two:175,three:400,jackpotMultiplier:{min:3,max:6},jackpot:{min:600,max:1200}});
const source=()=>({unlocked:true,gamblerId:17,paused:false,stations:Array.from({length:7},(_,i)=>({id:100+i,index:i+1,title:`${i+1}번 빠칭코`,owned:false,busy:false,canApproach:true,reason:null,payout:payout()}))});
it('keeps original machine order while presenting owned, explicit selection, moving, then first as the primary machine',()=>{
 const s=source(),initial=casinoViewModel(s);assert.equal(initial.primaryId,100);assert.deepEqual(initial.rows.map(r=>r.id),[100,101,102,103,104,105,106]);
 s.stations[5].reason='moving';s.stations[5].canApproach=false;assert.equal(casinoViewModel(s).primaryId,105);assert.equal(casinoViewModel(s,104).primaryId,104);s.stations[2].owned=true;s.stations[2].busy=true;assert.equal(casinoViewModel(s).primaryId,102);
 assert.equal(dispatchCasinoApproach(casinoViewModel(s),104,id=>assert.equal(id,104)),true);assert.equal(dispatchCasinoApproach(casinoViewModel(s),105,()=>assert.fail('moving command dispatched')),false);
});
it('explains left-starting exact matches and observed prizes, never supplying unknown amounts or probability claims',()=>{
 const s=source(),before=structuredClone(s),v=casinoViewModel(s),row=v.rows[0];assert.match(row.payoutSummary,/175/);assert.match(row.payoutSummary,/400/);assert.match(row.payoutSummary,/600.*1,200/);assert.equal(row.payoutRows.length,3);
 assert.match(row.payoutRows[0].condition,/왼쪽.*2개.*3번째.*다름/);assert.match(row.payoutRows[1].formula,/80.*5/);assert.match(row.payoutRows[2].formula,/200.*3.*6/);assert.deepEqual(s,before);
 delete (s.stations[0] as any).payout;const unknown=casinoViewModel(s).rows[0];assert.match(unknown.payoutSummary,/확인 필요/);assert.ok(unknown.payoutRows.every(r=>/확인 필요/.test(r.amount)));assert.doesNotMatch(JSON.stringify(row),/확률|기대값|추천 기계/);
});
function renderFixture(){
 let creates=0,moves=0;const doc:any={activeElement:null};
 class Node{children:any[]=[];parentElement:any=null;textContent='';dataset:any={};attributes:any={};hidden=false;open=false;className='';disabled=false;type='';listeners:any={};tagName='DIV';constructor(tagName='DIV'){this.tagName=tagName;creates++;}append(...nodes:any[]){for(const node of nodes){if(node.parentElement){node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);if(node.contains(doc.activeElement))doc.activeElement=null;moves++;}node.parentElement=this;this.children.push(node);}}insertBefore(node:any,reference:any){if(node===reference)return;if(node.parentElement){node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);if(node.contains(doc.activeElement))doc.activeElement=null;moves++;}node.parentElement=this;const index=reference?this.children.indexOf(reference):this.children.length;this.children.splice(index,0,node);}remove(){if(this.parentElement){this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;}}replaceChildren(...nodes:any[]){for(const node of this.children)node.parentElement=null;this.children=[];this.append(...nodes);}contains(n:any){return n===this||this.children.some(c=>c.contains(n));}setAttribute(k:string,v:string){this.attributes[k]=v;}getAttribute(k:string){return this.attributes[k]??null;}addEventListener(k:string,fn:any){this.listeners[k]=fn;}focus(){if(!this.disabled)doc.activeElement=this;}}
 doc.createElement=(tag:string)=>new Node(tag.toUpperCase());const node=()=>doc.createElement('div'),context:any={doc,casinoViewModel,dispatchCasinoApproach,approachCasino(){},casinoRows:new Map(),casinoView:casinoViewModel(),casinoSelectedId:null,casinoSnapshot:null,casinoSignature:'',receiptSignature:'',casinoResult:node(),resultText:node(),recentList:node(),recentSummary:node(),casinoPanel:node(),casinoHint:node(),casinoList:node(),casinoChoices:node(),casinoOtherList:node(),casinoChoiceSummary:node()};
 const text=fs.readFileSync(new URL('../../web/ui-skin.js',import.meta.url),'utf8'),fn=text.match(/function renderCasino\([^\n]*\{[\s\S]*?\n \}/)?.[0];assert.ok(fn);vm.runInNewContext(fn!,context);return {context,doc,render:(s:any)=>context.renderCasino(s),stats:()=>({creates,moves})};
}
it('shows one primary machine and folds the rest, keeping keyed buttons and open comparison across live refreshes',()=>{
 const f=renderFixture(),s=source();f.render(s);assert.equal(f.context.casinoList.children.length,1);assert.equal(f.context.casinoOtherList.children.length,6);assert.equal(f.context.casinoChoices.open,false);
 const rows=f.context.casinoRows,first=rows.get('1:100'),other=rows.get('6:105');f.context.casinoChoices.open=true;first.payoutDetails.open=true;other.button.focus();const stats=f.stats();f.render(s);assert.deepEqual(f.stats(),stats);assert.equal(f.doc.activeElement,other.button);
 s.stations[5].reason='moving';s.stations[5].canApproach=false;f.render(s);assert.equal(f.context.casinoList.children[0],other.element);assert.equal(f.context.casinoOtherList.children.length,6);assert.equal(f.context.casinoRows.get('6:105').button,other.button);assert.equal(f.doc.activeElement,other.payoutTitle);assert.equal(f.context.casinoChoices.open,true);assert.equal(first.payoutDetails.open,true);assert.deepEqual(f.context.casinoOtherList.children.map((n:any)=>n.dataset.casinoIndex),['1','2','3','4','5','7']);
});

it('retains an explicitly dispatched machine after its entrance leg finishes, without treating it as admitted',()=>{
 const f=renderFixture(),s=source();f.render(s);const row=f.context.casinoRows.get('6:105');row.button.listeners.click();assert.equal(f.context.casinoSelectedId,105);assert.equal(f.context.casinoList.children[0],row.element);
 s.stations[5].reason='moving';s.stations[5].canApproach=false;f.render(s);s.stations[5].reason=null;s.stations[5].canApproach=true;f.render(s);assert.equal(f.context.casinoList.children[0],row.element);assert.equal(row.status.textContent,'입장 가능');assert.equal(s.stations[5].owned,false);
 s.stations[5].canApproach=false;s.stations[5].reason='busy';f.render(s);row.button.listeners.click();assert.equal(f.context.casinoSelectedId,105);assert.equal(row.button.disabled,true);
 s.stations=s.stations.filter(x=>x.id!==105);f.render(s);assert.equal(f.context.casinoList.children[0].dataset.casinoIndex,'1');assert.equal(f.context.casinoRows.has('6:105'),false);
});
it('moves focus from a newly disabled primary entry even when the card stays in the same host',()=>{
 const f=renderFixture(),s=source();f.render(s);const row=f.context.casinoRows.get('1:100');row.button.focus();row.payoutDetails.open=true;const stats=f.stats();
 s.stations[0].reason='moving';s.stations[0].canApproach=false;f.render(s);
 assert.equal(f.context.casinoList.children[0],row.element);assert.equal(row.button.disabled,true);assert.equal(f.doc.activeElement,row.payoutTitle);assert.equal(row.payoutDetails.open,true);assert.deepEqual(f.stats(),stats);
 s.stations[0].payout.two=210;f.render(s);assert.equal(f.doc.activeElement,row.payoutTitle);
});
