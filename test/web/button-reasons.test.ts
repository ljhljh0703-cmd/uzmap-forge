import {it} from 'node:test';
import assert from 'node:assert/strict';
import {unavailableReason,createButtonReasonView} from '../../web/button-reasons.js';

class Element {
 tagName:string;attributes=new Map<string,string>();childNodes:Element[]=[];parentNode:Element|null=null;hidden=false;disabled=false;className='';textContent='';listeners=new Map<string,Function>();
 constructor(tag:string){this.tagName=tag.toUpperCase();}
 get id(){return this.getAttribute('id')??'';}set id(v:string){this.setAttribute('id',v);}
 get title(){return this.getAttribute('title')??'';}set title(v:string){this.setAttribute('title',v);}
 get nextSibling(){if(!this.parentNode)return null;const list=this.parentNode.childNodes;return list[list.indexOf(this)+1]??null;}
 getAttribute(k:string){return this.attributes.get(k)??null;}setAttribute(k:string,v:any){this.attributes.set(k,String(v));}removeAttribute(k:string){this.attributes.delete(k);}
 append(...nodes:Element[]){for(const node of nodes)this.insertBefore(node,null);}
 insertBefore(node:Element,before:Element|null){node.remove();node.parentNode=this;const index=before?this.childNodes.indexOf(before):-1;if(index<0)this.childNodes.push(node);else this.childNodes.splice(index,0,node);return node;}
 remove(){if(this.parentNode){const list=this.parentNode.childNodes;list.splice(list.indexOf(this),1);this.parentNode=null;}}
 addEventListener(k:string,fn:Function){this.listeners.set(k,fn);}
}
function fixture(){
 const root=new Element('div'),button=new Element('button'),native=new Element('span');native.textContent='기존 가격';button.append(native);root.append(button);
 const doc={createElement:(tag:string)=>new Element(tag),getElementById(id:string){const walk=(node:Element):Element|null=>node.id===id?node:node.childNodes.map(walk).find(Boolean)??null;return walk(root);}};
 const helper=createButtonReasonView(doc),click=()=>42;button.addEventListener('click',click);return {root,button,native,doc,helper,click};
}
it('formats only a real positive gold shortfall, without NaN, fabricated zero or a new affordability decision',()=>{
 assert.equal(unavailableReason('insufficient-gold',{cost:20,gold:7}),'골드 13 부족');
 assert.equal(unavailableReason('insufficient-gold',{cost:5,gold:-3}),'골드 8 부족');
 for(const context of [{},{cost:NaN,gold:2},{cost:Infinity,gold:0},{cost:20,gold:20},{cost:10,gold:12}]){
  const text=unavailableReason('insufficient-gold',context);assert.match(text,/골드/);assert.doesNotMatch(text,/NaN|Infinity|0 부족|-/);
 }
 assert.equal(unavailableReason(null,{cost:20,gold:0}),'','no validator rejection means no invented gold lock');
});
it('keeps short source-state explanations and falls back without leaking internal reason codes',()=>{
 for(const reason of ['game-over','busy','prereq-unmet','missing-data','not-owner','paused','missing-ability','missing-target','out-of-range','unreachable','stunned','max-level','unsupported-cost','not-trainable']){
  const context={cost:50,gold:7},before=structuredClone(context),text=unavailableReason(reason,context);assert.ok(text.length>0&&text.length<70);assert.doesNotMatch(text,new RegExp(reason));assert.deepEqual(context,before);
 }
 assert.match(unavailableReason('not-owner',{otherField:true}),/내 전장/);
 assert.equal(unavailableReason('unrecognized-rule'),'지금은 사용할 수 없어요');
});
it('creates one adjacent visible reason and preserves native children, listeners and the disabled value',()=>{
 const f=fixture();f.button.disabled=true;f.button.title='원래 도움말';
 const node=f.helper.set(f.button,'골드 13 부족');assert.ok(node);assert.equal(node.tagName,'SMALL');assert.equal(node.className,'button-disabled-reason');assert.equal(f.button.nextSibling,node);
 for(let i=0;i<40;i++)assert.equal(f.helper.set(f.button,'골드 13 부족'),node);
 assert.equal(f.root.childNodes.length,2);assert.equal(node.textContent,'골드 13 부족');assert.equal(node.hidden,false);assert.equal(f.button.getAttribute('aria-describedby'),node.id);assert.equal(f.button.title,'골드 13 부족');assert.equal(f.button.getAttribute('data-disabled-reason'),'골드 13 부족');
 assert.equal(f.button.childNodes.length,1);assert.equal(f.button.childNodes[0],f.native);assert.equal(f.button.listeners.get('click'),f.click);assert.equal(f.button.disabled,true);
});
it('an enabled button clears the helper explanation without becoming disabled or retaining stale accessibility tokens',()=>{
 const f=fixture();f.button.disabled=true;f.button.title='원래 도움말';f.button.setAttribute('aria-describedby','source-help');f.helper.set(f.button,'처리 중이에요');
 f.button.disabled=false;assert.equal(f.helper.set(f.button,'처리 중이에요'),null);assert.equal(f.button.disabled,false);assert.equal(f.root.childNodes.length,1);assert.equal(f.button.title,'원래 도움말');assert.equal(f.button.getAttribute('aria-describedby'),'source-help');assert.equal(f.button.getAttribute('data-disabled-reason'),null);
});
it('reuses an existing reason and restores its exact hidden, text and ID state after clearing',()=>{
 const f=fixture(),existing=new Element('small');existing.textContent='기존 안내';existing.hidden=true;f.root.append(existing);f.button.disabled=true;
 assert.equal(f.helper.set(f.button,'강화 중이에요',existing),existing);assert.equal(f.root.childNodes.length,2);assert.equal(existing.hidden,false);assert.ok(existing.id);const id=existing.id;
 assert.equal(f.button.getAttribute('aria-describedby'),id);f.helper.clear(f.button);assert.equal(existing.textContent,'기존 안내');assert.equal(existing.hidden,true);assert.equal(existing.getAttribute('id'),null);assert.equal(f.button.getAttribute('aria-describedby'),null);
});
it('keeps preexisting node IDs and accessibility links, and leaves externally updated title on clear',()=>{
 const f=fixture(),existing=new Element('small');existing.id='existing-reason';existing.textContent='원래 안내';f.root.append(existing);f.button.disabled=true;f.button.setAttribute('aria-describedby','existing-reason another-help');
 f.helper.set(f.button,'처리 중이에요',existing);f.button.title='다음 프레임의 최신 도움말';f.helper.clear(f.button);
 assert.equal(existing.id,'existing-reason');assert.equal(existing.textContent,'원래 안내');assert.equal(f.button.getAttribute('aria-describedby'),'existing-reason another-help');assert.equal(f.button.title,'다음 프레임의 최신 도움말');
});
it('captures an externally refreshed title between repeated sets and restores the latest baseline',()=>{
 const f=fixture();f.button.disabled=true;f.button.title='이전 가격';f.helper.set(f.button,'골드 13 부족');f.button.title='최신 가격';f.helper.set(f.button,'골드 3 부족');f.helper.clear(f.button);assert.equal(f.button.title,'최신 가격');
});
it('clear only removes helper-owned attributes and never overwrites concurrent source updates',()=>{
 const f=fixture(),existing=new Element('small');existing.id='source-condition';existing.hidden=false;existing.textContent='기존 상태';f.root.append(existing);f.button.disabled=true;f.button.setAttribute('data-disabled-reason','원래 속성');
 f.helper.set(f.button,'처리 중이에요',existing);f.button.setAttribute('aria-describedby',f.button.getAttribute('aria-describedby')+' fresh-help');f.button.setAttribute('data-disabled-reason','외부에서 갱신한 사유');existing.textContent='최신 상태';f.helper.clear(f.button);
 assert.equal(f.button.getAttribute('aria-describedby'),'fresh-help');assert.equal(f.button.getAttribute('data-disabled-reason'),'외부에서 갱신한 사유');assert.equal(existing.textContent,'최신 상태');assert.equal(existing.hidden,false);assert.equal(f.button.disabled,true);
});
it('switching the supplied node restores the former node and removes only its own ID token',()=>{
 const f=fixture(),a=new Element('small'),b=new Element('small');a.textContent='A';a.hidden=true;b.textContent='B';b.id='b-help';f.root.append(a,b);f.button.disabled=true;f.button.setAttribute('aria-describedby','source-help');
 f.helper.set(f.button,'첫 설명',a);const old=a.id;f.helper.set(f.button,'다음 설명',b);assert.equal(a.textContent,'A');assert.equal(a.hidden,true);assert.equal(a.id,'');assert.equal(b.textContent,'다음 설명');assert.ok(!f.button.getAttribute('aria-describedby')!.split(/\s+/).includes(old));assert.equal(f.button.getAttribute('aria-describedby'),'source-help b-help');
});
it('blank text is a clear operation and a never-managed enabled button is untouched',()=>{
 const f=fixture(),existing=new Element('small');existing.hidden=false;existing.textContent='원래 설명';f.root.append(existing);f.button.title='기존 도움말';assert.equal(f.helper.set(f.button,'불가',existing),null);assert.equal(existing.hidden,false);assert.equal(existing.textContent,'원래 설명');assert.equal(f.button.title,'기존 도움말');
 f.button.disabled=true;f.helper.set(f.button,'처리 중이에요');f.helper.set(f.button,'');assert.equal(f.root.childNodes.length,2);assert.equal(f.button.title,'기존 도움말');
});
it('created IDs avoid source collisions and follow the button when the parent changes',()=>{
 const f=fixture(),occupied=new Element('p'),other=new Element('section');occupied.id='button-disabled-reason-1';f.root.append(occupied,other);f.button.disabled=true;
 const node=f.helper.set(f.button,'처리 중이에요');assert.notEqual(node.id,occupied.id);other.append(f.button);f.helper.set(f.button,'처리 중이에요');assert.equal(f.button.nextSibling,node);assert.equal(node.parentNode,other);
});

it('repeating an unchanged explanation performs no property, attribute or DOM writes',()=>{
 const f=fixture();f.button.disabled=true;const node=f.helper.set(f.button,'골드 13 부족');let writes=0;
 const track=(element:any)=>{
  const setAttribute=element.setAttribute.bind(element);element.setAttribute=(...args:any[])=>{writes++;return setAttribute(...args);};
  const removeAttribute=element.removeAttribute.bind(element);element.removeAttribute=(...args:any[])=>{writes++;return removeAttribute(...args);};
  for(const key of ['textContent','hidden']){let value=element[key];Object.defineProperty(element,key,{configurable:true,get:()=>value,set(next){writes++;value=next;}});}
 };
 track(f.button);track(node);
 const insert=f.root.insertBefore.bind(f.root);f.root.insertBefore=(...args:any[])=>{writes++;return insert(...args);};
 for(let i=0;i<3;i++)assert.equal(f.helper.set(f.button,'골드 13 부족'),node);
 assert.equal(writes,0,'unchanged frames should not invalidate DOM or layout');assert.equal(f.button.disabled,true);
 f.helper.set(f.button,'골드 3 부족');assert.equal(node.textContent,'골드 3 부족');assert.equal(f.button.getAttribute('data-disabled-reason'),'골드 3 부족');
});
