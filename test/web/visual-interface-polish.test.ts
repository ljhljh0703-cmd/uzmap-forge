import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {approvedButtonMaterial} from '../../web/ui-skin.js';

// Exercise the actual painter rather than a duplicate presentation policy. This
// covers the material cleanup needed when a source-enabled primary becomes a
// secondary control after selection, without changing its command or focus.
const source=readFileSync(new URL('../../web/ui-skin.js',import.meta.url),'utf8');
const painter=source.slice(source.indexOf(' function paintButtons(){'),source.indexOf('\n function setPressed(',source.indexOf(' function paintButtons(){')));
function fixture(){
 let draws=0;
 const button:any={id:'play',clientWidth:80,clientHeight:44,disabled:false,dataset:{primary:'true'},style:{},classList:{contains:()=>false},hasAttribute:()=>false,getClientRects:()=>[{}]};
 const context:any={doc:{querySelectorAll:()=>[button],createElement:()=>({getContext:()=>({}),toDataURL:()=>`data:image/png;${++draws}`})},approvedButtonMaterial,MATERIALS:{hud:{file:'approved/frame-topbar.png'},'button-gold-normal':{file:'approved/btn-gold-normal.png'},'button-green-disabled':{file:'approved/btn-green-disabled.png'},'button-red-normal':{file:'approved/btn-red-normal.png'}},buttonPaints:new WeakMap(),buttonImages:new Map(),rasterNineSlice:()=>true};
 vm.runInNewContext(painter,context);
 return {button,paint:()=>context.paintButtons(),draws:()=>draws};
}
it('secondary controls stay quiet while the actual primary action uses approved gold art',()=>{
 const f=fixture();f.paint();assert.equal(f.button.dataset.skinMaterial,'button-gold-normal');
 assert.equal(f.button.dataset.skinSource,'approved/btn-gold-normal.png');assert.match(f.button.style.backgroundImage,/data:image\/png/);
 delete f.button.dataset.primary;f.button.id='researchToggle';f.paint();
 assert.equal(f.button.style.backgroundImage,'');assert.equal(f.button.dataset.skinMaterial,undefined);assert.equal(f.button.dataset.skinSource,undefined);
 assert.equal(f.draws(),1,'no repeated topbar frame painted for a neutral menu control');
});
it('returning to primary after a quiet state repaints cached art and keeps source disabled action colors',()=>{
 const f=fixture();f.paint();delete f.button.dataset.primary;f.paint();f.button.dataset.primary='true';f.paint();
 assert.equal(f.button.dataset.skinMaterial,'button-gold-normal');assert.match(f.button.style.backgroundImage,/data:image\/png/);assert.equal(f.draws(),1,'approved cached PNG is reused');
 delete f.button.dataset.primary;f.button.id='castA007';f.button.disabled=true;f.paint();assert.equal(f.button.dataset.skinMaterial,'button-green-disabled');
 f.button.id='castA008';f.button.disabled=false;f.paint();assert.equal(f.button.dataset.skinMaterial,'button-red-normal');
});
