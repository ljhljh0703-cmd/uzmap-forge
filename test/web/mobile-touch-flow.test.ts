import * as domState from '../../web/dom-state.js';
import {trainingInterruptionText} from '../../web/play-ui.js';
import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as ui from '../../web/play-ui.js';
const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
function fn(name:string){const match=source.match(new RegExp('function '+name+'\\([^\\n]*\\{[\\s\\S]*?\\n\\}'));assert.ok(match, name+' must use the actual shared handler');return match[0];}
it('visual picks include the rendered overlapping units without stealing a neighboring empty build cell',()=>{
 const pick=(ui as any).visibleGemChoices;assert.equal(typeof pick,'function');
 const units=[{id:1,typeId:'n002',x:50,y:90},{id:2,typeId:'h00G',x:50,y:90}];const before=JSON.stringify(units);
 assert.deepEqual(pick(units,50,90,{zoom:1,footprintPixels:64}).map((u:any)=>u.id),[1,2]);
 assert.deepEqual(pick(units,95,90,{zoom:1,footprintPixels:64}),[]);
 assert.deepEqual(pick(units,50,90,{zoom:.15,footprintPixels:9.6}).map((u:any)=>u.id),[1,2]);assert.equal(JSON.stringify(units),before);
});
it('ordinary touch remains a tap, a held touch or pen previews, and mouse hold keeps the existing click behavior',()=>{
 const classify=(ui as any).classifyMapGesture;assert.equal(typeof classify,'function');
 const start={pointerType:'touch',sx:0,sy:0,startedAt:100};
 assert.equal(classify(start,{clientX:7,clientY:3,timeStamp:180}),'tap');
 assert.equal(classify(start,{clientX:1,clientY:1,timeStamp:500}),'preview');
 assert.equal(classify({...start,pointerType:'pen'},{clientX:0,clientY:0,timeStamp:500}),'preview');
 assert.equal(classify({...start,pointerType:'mouse'},{clientX:0,clientY:0,timeStamp:500}),'tap');
 assert.equal(classify(start,{clientX:20,clientY:0,timeStamp:500}),'cancel');
});
function pointer(){
 const handlers=new Map<string,Function>(),placed:any[]=[],previews:any[]=[],selected:number[]=[];
 const unit={id:1,alive:true,owner:0,typeId:'n002',x:50,y:90,abilities:new Map([[1,1]])};
 const world:any={selectedGemId:null,pm:null,hover:null,gemTargetCandidateIds:new Set([1]),sim:{entities:new Map([[1,unit]])}};
 const cv={width:200,height:200,setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,right:200,bottom:200,width:200,height:200}),addEventListener:(kind:string,f:Function)=>handlers.set(kind,f)};
 const context:any={precisionPointer:()=>false,cv,surface:cv,drag:{on:false},cam:{cx:0,cy:0,zoom:1},mouseScreen:{},world,S2WX:(x:number)=>x,S2WY:(y:number)=>y,defOf:()=>({pathing:{width:4,height:4}}),isGemSelectable:()=>true,buildGridCells:()=>4,visibleGemChoices:(ui as any).visibleGemChoices,classifyMapGesture:(ui as any).classifyMapGesture,selectGemById:(w:any,id:number)=>{w.selectedGemId=id;selected.push(id);return true;},placeTower:(_w:any,x:number,y:number)=>placed.push([x,y]),previewPlacement:(_w:any,x:number,y:number)=>previews.push([x,y]),render(){}};
 vm.runInNewContext(fn('gemNear')+'\n'+fn('selectMapGem')+'\n'+source.slice(source.indexOf('surface.addEventListener("pointerdown"'),source.indexOf('function focusPlayer(w)')),Object.assign(context,domState));
 const cell={dataset:{x:'96',y:'96'}};const send=(kind:string,extra:any={})=>handlers.get(kind)!({isPrimary:true,button:0,pointerId:1,pointerType:'touch',timeStamp:100,clientX:50,clientY:90,target:{closest:()=>cell},...extra});return {send,placed,previews,selected,world};
}
it('actual pointer handler selects a slate under the construction overlay after rock removal',()=>{const f=pointer();f.send('pointerdown');f.send('pointerup',{timeStamp:180});assert.deepEqual(f.selected,[1]);assert.deepEqual(f.placed,[]);});
it('actual pointer handler still builds in the adjacent cell beyond the rendered unit',()=>{const f=pointer();f.send('pointerdown',{clientX:95});f.send('pointerup',{clientX:95,timeStamp:180});assert.deepEqual(f.selected,[]);assert.deepEqual(f.placed,[[96,96]]);});
it('a small finger wobble stays a tap in the actual pointer-move path',()=>{const f=pointer();f.send('pointerdown',{clientX:95});f.send('pointermove',{clientX:102});f.send('pointerup',{clientX:102,timeStamp:180});assert.deepEqual(f.placed,[[96,96]]);});
it('actual held touch previews an empty cell, and cancel/capture loss never builds',()=>{const f=pointer();f.send('pointerdown',{clientX:95});f.send('pointerup',{clientX:95,timeStamp:600});assert.deepEqual(f.placed,[]);assert.deepEqual(f.previews,[[96,96]]);for(const kind of ['pointercancel','lostpointercapture']){const g=pointer();g.send('pointerdown',{clientX:95});g.send(kind);g.send('pointerup',{clientX:95,timeStamp:600});assert.deepEqual(g.placed,[]);assert.deepEqual(g.previews,[]);}});
it('optional precision mode previews an ordinary empty-cell tap before confirmation',()=>{const f=pointer();f.world.precisePlacement=true;f.send('pointerdown',{clientX:95});f.send('pointerup',{clientX:95,timeStamp:180});assert.deepEqual(f.placed,[]);assert.deepEqual(f.previews,[[96,96]]);});
it('opening and closing the solo menu checkpoints without changing explicit pause state',()=>{
 for(const playing of [true,false]){
 const nodes:any={gameDrawer:{hidden:true},drawerScrim:{hidden:true},researchToggle:{setAttribute(){},focus(){}},drawerClose:{focus(){}}};let saves=0,resets=0;
 const c:any={world:{},playing,$:(id:string)=>nodes[id],frameClock:{reset(){resets++;}},checkpointRun(){saves++;},renderControls(){},render(){},refreshSavedRuns(){},flash(){},clearPlacement(){}};
 vm.runInNewContext(fn('setDrawer'),Object.assign(c,domState));c.setDrawer(true);assert.equal(c.playing,playing);assert.equal(nodes.gameDrawer.hidden,false);assert.equal(saves,Number(playing));assert.equal(resets,0);c.setDrawer(false);assert.equal(c.playing,playing);assert.equal(saves,Number(playing));
 }
});
it('background interruption preserves issued purchases and cancels only the unissued remainder before saving',()=>{
 const events=new Map<string,Function>(),issued=[{kind:'train',typeId:'h01W'}],world:any={trainingBatch:{producerId:1,typeId:'h01W',remaining:7},inputLog:issued,pendingBuilds:[],hover:{},pendingPlacement:{x:1,y:2}};let saved:any;
 const c:any={document:{hidden:true,addEventListener:(k:string,f:Function)=>events.set(k,f)},window:{addEventListener:(k:string,f:Function)=>events.set(k,f)},world,trainingInterruptionText,playing:true,drag:{on:true},frameClock:{reset(){}},checkpointRun(w:any){saved={batch:w.trainingBatch,issued:[...w.inputLog]};},renderControls(){},interruptUiOrders:undefined};
 vm.runInNewContext(fn('clearPlacement')+'\n'+fn('interruptUiOrders')+'\n'+source.slice(source.indexOf('document.addEventListener("visibilitychange"'),source.indexOf('resize(); requestAnimationFrame(loop);')),Object.assign(c,domState));
 events.get('visibilitychange')!();assert.equal(c.playing,false);assert.equal(world.trainingBatch,null);assert.deepEqual(saved.issued,issued);assert.equal(saved.batch,null);assert.equal(world.pendingPlacement,null);assert.equal(c.drag.on,false);assert.match(world.trainingBatchNotice,/7/);
});
it('training labels expose prerequisite, affordability and pending pause reasons without hover',()=>{
 const model=(ui as any).trainingOptionView;assert.equal(typeof model,'function');
 const base={name:'슬레이트 찬스',count:1,life:15,gold:10,ready:true,paused:false,batch:false,spinning:false};
 const row={typeId:'x',cost:125,durationTicks:20,reason:'prereq-unmet',requirements:[{name:'보석 질',count:1,current:0}]};
 const v=model(row,base);assert.equal(v.disabled,true);assert.match(v.reason,/보석 질/);assert.match(v.reason,/1/);
 assert.match(model({...row,reason:'insufficient-gold'},base).reason,/115/);
 assert.match(model({...row,reason:'busy'},{...base,paused:true}).reason,/재개/);
 const ready=model({...row,cost:5,reason:null},{...base,paused:true});assert.equal(ready.disabled,false);assert.match(ready.reason,/재개/);
});
it('precision preview stays anchored when the pointer moves, leaves or cancels another gesture',()=>{
 const f=pointer();f.world.pendingPlacement={x:96,y:96};f.world.hover={cx:96,cy:96};f.send('pointermove',{clientX:160,clientY:160});assert.deepEqual(f.world.hover,{cx:96,cy:96});f.send('pointerleave');assert.deepEqual(f.world.hover,{cx:96,cy:96});f.send('pointerdown',{clientX:150});f.send('pointercancel');assert.deepEqual(f.world.hover,{cx:96,cy:96});
});
it('a failed safety checkpoint blocks the new batch request while preserving the current game',()=>{
 let requested=0;const w={trainingBatch:null},c:any={world:w,checkpointRun:()=>({kind:'failed'}),requestTrainingBatch:()=>{requested++;return true;},flash(){},render(){},playing:false};
 vm.runInNewContext(fn('handleTrainingClick'),Object.assign(c,domState));c.handleTrainingClick({target:{closest:()=>({dataset:{producerId:'1',trainType:'h01W',trainCount:'2'}})}});assert.equal(requested,0);assert.equal(c.world,w);
});
it('keyboard and assistive build-cell activation also honor the precision preview setting',()=>{
 const line=source.split('\n').find(x=>x.startsWith('$("buildCells").addEventListener(\'click\''));assert.ok(line);let listener:Function;const previews:any[]=[],placed:any[]=[],world={precisePlacement:true},c:any={world,$:()=>({addEventListener:(_kind:string,f:Function)=>listener=f}),previewPlacement:(_w:any,x:number,y:number)=>previews.push([x,y]),placeTower:(_w:any,x:number,y:number)=>placed.push([x,y]),render(){}};
 vm.runInNewContext(line!,Object.assign(c,domState));listener!({detail:0,target:{closest:()=>({dataset:{x:'96',y:'96'}})}});assert.deepEqual(previews,[[96,96]]);assert.deepEqual(placed,[]);
});
it('a training prerequisite uses the original upgrade name and WTS rather than a raw research code',()=>{
 const c:any={resolveWtsText:(s:string,strings:Map<number,string>)=>s.replace(/TRIGSTR_(\d+)/g,(_m,n)=>strings.get(Number(n))??_m),fullName:(_w:any,id:string)=>id};
 vm.runInNewContext(fn('sourceText')+'\n'+fn('trainingTechName'),Object.assign(c,domState));
 const w={strings:new Map([[17,'|cffff0000보석 질 향상|r']]),sim:{mapIr:{objectMods:[{kind:'upgrade',newId:'R000',mods:[{field:'gnam',value:'TRIGSTR_17'}]}]}}};assert.equal(c.trainingTechName(w,'R000'),'보석 질 향상');assert.equal(c.trainingTechName(w,'NONE'),'필요 연구');
});
it('purchase interruption metadata is bounded and cannot restore unissued orders or arbitrary messages',async()=>{
 const {validateInputReplay}=await import('../../web/gem-actions.js');const trace={format:'uzmap-ui-input-v1',seed:7,tick:0,stateHash:'abcdef01',actions:[]};
 for(const trainingInterrupted of [{remaining:0,cause:'background'},{remaining:11,cause:'background'},{remaining:1,cause:'other'},'message'])assert.throws(()=>validateInputReplay({...trace,trainingInterrupted}));
 const saved=validateInputReplay({...trace,trainingInterrupted:{remaining:1,cause:'background'}});assert.deepEqual(saved.actions,[]);assert.equal(saved.trainingInterrupted.remaining,1);
});
