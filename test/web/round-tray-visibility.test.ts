import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {roundSlotModels}=await import(pathToFileURL(resolve(process.env.UI_SKIN_SOURCE??'web/ui-skin.js')).href);
const source=fs.readFileSync(process.env.UI_SKIN_SOURCE??resolve('web/ui-skin.js'),'utf8');
const render=source.match(/ function render\(snapshot\)\{[\s\S]*?\n \}/)?.[0];assert.ok(render);
function fixture(width=1440){
 const tray={hidden:false,dataset:{}},summary={textContent:''},state={textContent:''},title={textContent:''},selectedPortrait:any={dataset:{},getContext:()=>({clearRect(){}})};let slotPaints=0,portraitPaints=0,portraitReady=true;
 const buttons=Array.from({length:5},()=>({dataset:{artReady:'true'},disabled:false,attrs:{},setAttribute(k:string,v:string){this.attrs[k]=v;},style:{setProperty(){}}}));
 const slots:any={get clientWidth(){return tray.hidden?0:width-40;},style:{}},play={disabled:false,dataset:{},getClientRects:()=>[{}]},nodes:any={rosterCount:{textContent:'12'},play};
 const bottom={hidden:false},explorer={hidden:false};
 const context:any={tray,slots,summary,state,title,buttons,selectedPortrait,bottom,explorer,latest:null,signature:'',roundSlotModels,selectionCard:{render(){}},renderCasino(){},paintSlot(button:any){slotPaints++;button.dataset.artReady='true';},drawGem(){portraitPaints++;return portraitReady;},QUALITY_COLORS:['#aaa'],targetPanel:{},targetButton:{setAttribute(){}},cancelButton:{},targetHint:{},doc:{defaultView:{innerWidth:width,getComputedStyle:()=>({columnGap:'8px'})},getElementById:(id:string)=>nodes[id],querySelectorAll:()=>[]},paintFrames(){},paintButtons(){},paintIcons(){}};
 vm.runInNewContext(render,context);
 return {tray,slots,summary,buttons,selectedPortrait,bottom,explorer,render:(snapshot:any)=>context.render(snapshot),stats:()=>({slotPaints,portraitPaints}),setPortraitReady(v:boolean){portraitReady=v;}};
}
it('only an empty committed hand collapses while selected portrait and owned summary keep updating',()=>{
 const f=fixture(),snapshot={chosen:true,buildCount:0,candidates:[],selectedGem:{id:99,name:'기존 보석'}};f.render(snapshot);
 assert.equal(f.tray.hidden,true);assert.equal(f.summary.textContent,'보유 12');assert.equal(f.selectedPortrait.dataset.unitId,99);assert.equal(f.bottom.hidden,false);assert.equal(f.explorer.hidden,false);assert.deepEqual(f.stats(),{slotPaints:0,portraitPaints:1});
 f.buttons[0].dataset.artReady='false';f.render(snapshot);assert.deepEqual(f.stats(),{slotPaints:0,portraitPaints:1},'hidden slot retry must not trigger repeated portrait work');
});
it('the same five buttons return at PREP and measure their visible width on the first reopening render',()=>{
 for(const width of [360,600,1440]){const f=fixture(width),buttons=[...f.buttons];f.render({chosen:true,buildCount:0,candidates:[]});f.render({chosen:false,buildCount:0,candidates:[{slot:1,id:4,alive:true,name:'이전 보석'}]});
  assert.equal(f.tray.hidden,false);assert.equal(f.buttons.length,5);assert.ok(f.buttons.every((b,i)=>b===buttons[i]));assert.ok(f.buttons.every(b=>b.dataset.unitId===''));assert.equal(f.stats().slotPaints,5);
  const cell=Number(f.slots.style.gridTemplateColumns.match(/repeat\(5, (\d+)px\)/)?.[1]);assert.ok(cell>=44);if(width===1440)assert.ok(cell>44,'reopening must not use the hidden zero-width measurement');
 }
});
it('uncommitted, unknown-state and genuinely populated hands remain visible with the original source slot mapping',()=>{
 const f=fixture(),candidate={slot:2,id:42,alive:true,name:'중급 루비'};
 for(const snapshot of [{chosen:false,buildCount:0},{buildCount:0},{chosen:true,buildCount:2,candidates:[candidate]}]){f.render(snapshot);assert.equal(f.tray.hidden,false);}
 assert.equal(f.buttons[1].dataset.unitId,42);assert.equal(f.buttons[1].disabled,false);const before=f.stats().slotPaints;f.buttons[0].dataset.artReady='false';f.render({chosen:true,buildCount:2,candidates:[candidate]});assert.equal(f.stats().slotPaints-before,5,'visible slot art retries are preserved');
});


it('a hidden tray retries an unready selected portrait on the identical snapshot and stops after recovery without painting slots',()=>{
 const f=fixture(),snapshot={chosen:true,buildCount:0,candidates:[],selectedGem:{id:99,name:'기존 보석'}};f.setPortraitReady(false);f.render(snapshot);
 assert.equal(f.tray.hidden,true);assert.equal(f.selectedPortrait.dataset.artReady,'false');assert.deepEqual(f.stats(),{slotPaints:0,portraitPaints:1});
 f.setPortraitReady(true);f.render(snapshot);assert.equal(f.selectedPortrait.dataset.artReady,'true');assert.deepEqual(f.stats(),{slotPaints:0,portraitPaints:2});
 f.render(snapshot);assert.deepEqual(f.stats(),{slotPaints:0,portraitPaints:2});assert.equal(f.selectedPortrait.dataset.unitId,99);
});

it('committed populated hands retain their source buttons in a compact display and reset at preparation',()=>{const f=fixture();f.render({chosen:true,buildCount:5,candidates:[{slot:2,id:42,alive:true,name:'기존 보석'}]});assert.equal(f.tray.dataset.committed,'true');assert.equal(f.tray.hidden,false);assert.equal(f.buttons[1].dataset.unitId,42);f.render({chosen:false,buildCount:0});assert.equal(f.tray.dataset.committed,'false');});
