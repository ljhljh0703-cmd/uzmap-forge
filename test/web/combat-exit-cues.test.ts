import * as domState from '../../web/dom-state.js';
import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as art from '../../web/field-art.js';
import {lifeLossFeedback} from '../../web/play-ui.js';
import {selectionStageHint} from '../../web/ui-skin.js';
it('damaged creep bars keep original colour thresholds and all rectangles use whole pixels above the visible sprite',()=>{
 assert.equal(typeof (art as any).drawCreepHealth,'function');const rects:any[]=[],ctx:any={fillStyle:'',save(){},restore(){},fillRect(...r:any[]){rects.push({r,color:this.fillStyle});}};
 for(const [hp,color] of [[16,'#53a64f'],[10,'#c18b30'],[4,'#d74e3c']]){rects.length=0;(art as any).drawCreepHealth(ctx,{x:10.4,y:40.7,size:30.2,hp,maxHp:20});assert.ok(rects.some(x=>x.color===color));assert.ok(rects.every(({r})=>r.every(Number.isInteger)&&r[2]>0&&r[3]>0));assert.ok(rects.every(({r})=>r[1]+r[3]<40.7-30.2*.8));assert.ok(rects.filter(x=>x.color===color).every(x=>x.r[3]===3));}
});
it('full or invalid health is silent; one positive HP remains visible without inventing a displayed value',()=>{
 assert.equal(typeof (art as any).drawCreepHealth,'function');const rects:any[]=[],ctx:any={fillStyle:'',save(){},restore(){},fillRect(...r:any[]){rects.push({r,color:this.fillStyle});}};
 for(const hp of [100,101,NaN])assert.equal((art as any).drawCreepHealth(ctx,{x:30,y:70,size:44,hp,maxHp:100}),false);assert.equal(rects.length,0);
 (art as any).drawCreepHealth(ctx,{x:30,y:70,size:44,hp:1,maxHp:1000});assert.ok(rects.some(x=>x.color==='#d74e3c'&&x.r[2]>=1));
});
it('the actual source-life view announces one observed decrease in the HUD region and stays silent on repeats, purchases and replay',()=>{
 const source=fs.readFileSync('web/main.js','utf8'),fn=source.match(/^function renderFieldView\([^\n]*\{[\s\S]*?\n\}/m)?.[0];assert.ok(fn);const nodes:any={},span={textContent:''};let writes=0,notice='';
 const node=(id:string)=>nodes[id]??=( {dataset:{},textContent:'',hidden:false,inert:false,tabIndex:0,setAttribute(){},querySelector:()=>span,closest:()=>({dataset:{}})} );
 const live=node('lifeLossStatus');Object.defineProperty(live,'textContent',{get:()=>notice,set:(s:string)=>{notice=s;if(s)writes++;}});
 let life=15,now=100,cues=0;const context:any={lifeHud:{emit(){cues++;}},document:{hidden:false},$:node,gemTowerPlayerState:()=>({life,round:1,chosen:true}),lifeLossFeedback,selectionStageHint,restoring:false,RESEARCH_IDS:[],performance:{now:()=>now}};vm.runInNewContext(fn!,Object.assign(context,domState));
 const w:any={viewPlayerId:0,selectedGemId:null,sim:{playerState:{getSlotState:(id:number)=>id===0?1:0}},vm:{},modeDialog:{clicked:true},pendingBuilds:[]};
 context.renderFieldView(w);life=16;context.renderFieldView(w);assert.equal(writes,0);life=13;context.renderFieldView(w);assert.match(notice,/생명 3 감소/);assert.match(notice,/13/);assert.equal(writes,1);assert.equal(cues,1);
 for(let i=0;i<10;i++)context.renderFieldView(w);assert.equal(writes,1);assert.equal(node('exitMarker').dataset.hit,'true');now+=1801;context.renderFieldView(w);assert.equal(node('exitMarker').dataset.hit,'false');
 context.document.hidden=true;life=12;context.renderFieldView(w);context.document.hidden=false;context.renderFieldView(w);assert.equal(writes,1);
 context.restoring=true;life=11;context.renderFieldView(w);context.restoring=false;context.renderFieldView(w);assert.equal(writes,1);assert.equal(notice,'');assert.equal(cues,1);
});
