import {it} from 'node:test';
import assert from 'node:assert/strict';
import * as skin from '../../web/ui-skin.js';
function fixture(){
 const doc:any={activeElement:null,defaultView:{innerHeight:844}};
 class Element{
  id='';className='';type='';textContent='';title='';open=false;dataset:any={};children:any[]=[];parentNode:any=null;style:any={values:{},setProperty(k,v){this.values[k]=v;}};attrs=new Map();listeners=new Map<string,Set<Function>>();captures=new Set<number>();focuses=0;
  append(...nodes:any[]){for(const n of nodes){n.remove();n.parentNode=this;this.children.push(n);}}
  prepend(n:any){n.remove();n.parentNode=this;this.children.unshift(n);}
  remove(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}
  setAttribute(k,v){this.attrs.set(k,v);}getAttribute(k){return this.attrs.get(k)??null;}
  addEventListener(k,f){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k)!.add(f);}removeEventListener(k,f){this.listeners.get(k)?.delete(f);}
  emit(k,extra:any={}){const e:any={isPrimary:true,button:0,pointerId:2,pointerType:'touch',clientX:100,clientY:400,timeStamp:100,detail:1,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...extra};for(const fn of this.listeners.get(k)??[])fn(e);return e;}
  setPointerCapture(id){this.captures.add(id);}releasePointerCapture(id){this.captures.delete(id);}hasPointerCapture(id){return this.captures.has(id);}
  focus(){doc.activeElement=this;this.focuses++;}
 }
 const panel:any=new Element(),meta:any=new Element(),summary:any=new Element(),body:any=new Element(),ability:any=new Element();let rect={left:12,top:786,width:390,height:58};let reads=0;
 panel.getBoundingClientRect=()=>{reads++;return {...rect};};body.append(ability);meta.append(summary,body);panel.append(meta);doc.createElement=()=>new Element();
 assert.equal(typeof (skin as any).createSelectionSheet,'function','actual DOM overlay helper exists');const sheet=(skin as any).createSelectionSheet(doc,{panel,meta,summary,body});sheet.update({selected:true,interacting:false});
 const grip=body.children.find(n=>n.id==='selectionSheetHandle');
 const nativeClick=(handle=summary,extra:any={})=>{const event=handle.emit('click',extra);if(handle===summary&&!event.defaultPrevented){meta.open=!meta.open;meta.emit('toggle');}return event;};
 const swipe=(handle=summary,dy=-70,extra:any={})=>{handle.emit('pointerdown',{clientY:400,timeStamp:100,...extra});handle.emit('pointermove',{clientY:400+dy,timeStamp:170,...extra});return handle.emit('pointerup',{clientY:400+dy,timeStamp:200,...extra});};
 return {doc,panel,meta,summary,body,ability,grip,sheet,nativeClick,swipe,rect:()=>rect,reads:()=>reads,setRect(r:any){rect={...rect,...r};}};
}
it('native summary click and keyboard activation toggle once while one fixed overlay body preserves control identity',()=>{
 const f=fixture(),originalBody=f.body,originalAbility=f.ability;assert.equal(f.panel.dataset.selectionSheet,'true');assert.ok(f.grip);assert.equal(f.meta.open,false);f.nativeClick();assert.equal(f.meta.open,true);assert.equal(f.body,originalBody);assert.equal(f.body.children.includes(originalAbility),true);assert.equal(f.body.style.values['--selection-sheet-left'],'12px');assert.equal(f.body.style.values['--selection-sheet-width'],'390px');assert.equal(f.body.style.values['--selection-sheet-bottom'],'58px');f.nativeClick(f.summary,{detail:0,timeStamp:300});assert.equal(f.meta.open,false);assert.equal(f.rect().height,58);
});
it('up/down handle swipes change only disclosure state and consume the resulting pointer click',()=>{
 const f=fixture();f.swipe();assert.equal(f.meta.open,true);assert.equal(f.nativeClick(f.summary,{timeStamp:201}).defaultPrevented,true);assert.equal(f.meta.open,true);f.swipe(f.grip,70);assert.equal(f.meta.open,false);assert.equal(f.doc.activeElement,f.summary);assert.equal(f.nativeClick(f.grip,{timeStamp:201}).defaultPrevented,true);assert.equal(f.meta.open,false);
});
it('ordinary taps, horizontal movement, unrelated pointers and cancellation never manufacture a swipe',()=>{
 const f=fixture();f.swipe(f.summary,-10);assert.equal(f.meta.open,false);assert.equal(f.nativeClick(f.summary,{timeStamp:201}).defaultPrevented,false);assert.equal(f.meta.open,true);
 f.summary.emit('pointerdown');f.summary.emit('pointermove',{clientX:180,clientY:380});f.summary.emit('pointerup',{clientX:180,clientY:330});assert.equal(f.meta.open,true);
 f.summary.emit('pointerdown');f.summary.emit('pointerup',{pointerId:9,clientY:300});assert.equal(f.meta.open,true);f.summary.emit('pointercancel');assert.equal(f.meta.open,true);
 f.summary.emit('pointerdown');f.summary.emit('pointermove',{clientY:470});f.summary.emit('pointercancel');assert.equal(f.meta.open,true);f.summary.emit('pointerup',{clientY:470});assert.equal(f.meta.open,true);
});
it('body scroll is not a drag handle and body input cannot bubble into field handlers',()=>{
 const f=fixture();f.nativeClick();for(const kind of ['pointerdown','pointermove','pointerup','click']){const e=f.body.emit(kind,{clientY:300});assert.equal(e.defaultPrevented,false,'native scroll/click is preserved');if(kind!=='pointermove')assert.equal(e.stopped,true);}assert.equal(f.meta.open,true);assert.equal(f.ability.parentNode,f.body);
});
it('active targeting stays exposed; completed explicit collapse focuses the visible summary',()=>{
 const f=fixture();f.sheet.update({selected:true,interacting:true});assert.equal(f.meta.open,true);f.swipe(f.grip,70);assert.equal(f.meta.open,true);assert.equal(f.nativeClick(f.summary,{timeStamp:400}).defaultPrevented,true);assert.equal(f.meta.open,true);
 f.sheet.update({selected:true,interacting:false});f.ability.focus();f.grip.emit('click',{detail:0,timeStamp:500});assert.equal(f.meta.open,false);assert.equal(f.doc.activeElement,f.summary);
});
it('resize updates overlay anchors without changing host dimensions; clearing selection cancels gesture and closes details',()=>{
 const f=fixture();f.nativeClick();f.setRect({left:0,top:700,width:320});f.doc.defaultView.innerHeight=758;f.sheet.update({selected:true,interacting:false});assert.equal(f.body.style.values['--selection-sheet-width'],'320px');assert.equal(f.body.style.values['--selection-sheet-bottom'],'58px');assert.equal(f.rect().height,58);
 f.summary.emit('pointerdown');f.sheet.update({selected:false,interacting:false});f.summary.emit('pointerup',{clientY:300});assert.equal(f.meta.open,false);assert.equal(f.panel.dataset.selectionSheet,'false');f.sheet.destroy();assert.equal(f.body.children.includes(f.grip),false);assert.equal(f.summary.listeners.get('pointerdown')?.size??0,0);
});
it('a cancelled-direction or incomplete drag consumes its compatibility click, while a fresh tap remains native',()=>{
 for(const delta of [{x:80,y:-60},{x:0,y:-20}]){const f=fixture();f.summary.emit('pointerdown');f.summary.emit('pointermove',{clientX:100+delta.x,clientY:400+delta.y,timeStamp:170});f.summary.emit('pointerup',{clientX:100+delta.x,clientY:400+delta.y,timeStamp:200});assert.equal(f.meta.open,false);assert.equal(f.nativeClick(f.summary,{timeStamp:201}).defaultPrevented,true);assert.equal(f.meta.open,false);}
 const f=fixture();f.swipe();assert.equal(f.meta.open,true);f.summary.emit('pointerdown',{timeStamp:210});f.summary.emit('pointerup',{timeStamp:215,clientY:401});assert.equal(f.nativeClick(f.summary,{timeStamp:216}).defaultPrevented,false);assert.equal(f.meta.open,false);
});
