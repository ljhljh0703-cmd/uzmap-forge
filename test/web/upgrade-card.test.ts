import {it} from 'node:test';
import assert from 'node:assert/strict';
import * as skin from '../../web/ui-skin.js';

function dom(){
 const doc:any={activeElement:null,defaultView:{innerHeight:844},registrations:0};
 class Element{
  tagName:string;id='';className='';type='';title='';dataset:any={};children:Element[]=[];parentNode:Element|null=null;attrs=new Map<string,string>();listeners=new Map<string,Function[]>();hidden=false;disabled=false;open=false;private value='';
  style:any={values:{},setProperty(k:string,v:string){this.values[k]=v;}};
  classList={contains:(v:string)=>this.className.split(/\s+/).includes(v),add:(...v:string[])=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...v])].join(' ');}};
  constructor(tag:string){this.tagName=tag.toUpperCase();}
  get textContent():string{return this.value+this.children.map(node=>node.textContent).join('');}
  set textContent(value:string){this.value=String(value);for(const child of this.children)child.parentNode=null;this.children=[];}
  get nextSibling(){const nodes=this.parentNode?.children??[];return nodes[nodes.indexOf(this)+1]??null;}
  get isConnected(){return doc.root.contains(this);}
  append(...nodes:Element[]){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
  prepend(node:Element){this.insertBefore(node,this.children[0]??null);}
  insertBefore(node:Element,next:Element|null){node.remove();node.parentNode=this;const index=next?this.children.indexOf(next):-1;if(index<0)this.children.push(node);else this.children.splice(index,0,node);}
  remove(){if(this.parentNode)this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}
  contains(node:any):boolean{return node===this||this.children.some(child=>child.contains(node));}
  setAttribute(key:string,value:string){this.attrs.set(key,String(value));if(key==='class')this.className=String(value);if(key==='id')this.id=String(value);}
  getAttribute(key:string){return key==='class'?this.className||null:key==='id'?this.id||null:this.attrs.get(key)??null;}
  hasAttribute(key:string){return key.startsWith('data-')?Object.hasOwn(this.dataset,key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())):this.getAttribute(key)!==null;}
  matches(selector:string):boolean{const attr=selector.match(/\[([^\]]+)\]/)?.[1],base=selector.replace(/\[[^\]]+\]/g,'');return (!attr||this.hasAttribute(attr))&&(!base||base.startsWith('#')?this.id===base.slice(1):base.startsWith('.')?this.classList.contains(base.slice(1)):this.tagName===base.toUpperCase());}
  querySelectorAll(selector:string):Element[]{const out:Element[]=[];for(const child of this.children){if(child.matches(selector))out.push(child);out.push(...child.querySelectorAll(selector));}return out;}
  querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
  closest(selector:string):Element|null{return this.matches(selector)?this:this.parentNode?.closest(selector)??null;}
  addEventListener(key:string,listener:Function){doc.registrations++;this.listeners.set(key,[...this.listeners.get(key)??[],listener]);}
  removeEventListener(key:string,listener:Function){this.listeners.set(key,(this.listeners.get(key)??[]).filter(value=>value!==listener));}
  focus(){doc.activeElement=this;}
  getBoundingClientRect(){return {left:0,top:500,width:390,height:58};}
 }
 doc.createElement=(tag:string)=>new Element(tag);doc.root=new Element('main');doc.getElementById=(id:string)=>doc.root.id===id?doc.root:doc.root.querySelector('#'+id);
 doc.querySelector=(selector:string)=>selector==='#gemNone span'?doc.getElementById('gemNone')?.querySelector('span')??null:doc.root.querySelector(selector);
 return doc;
}
const input=(patch:any={})=>({typeId:'h02O',name:'정제된 은십자가',cost:25,preview:'지상 공격 · 기본 72–88 · 0.8초',status:'강화 가능 · 2초',condition:'연구 2단계 필요',disabled:false,...patch});
const create=(doc:any,data:any)=>(skin as any).upgradeOptionNode(doc,data);

it('upgrade information sits outside one short ordinary upgrade button, preserving caller facts',()=>{
 const doc=dom(),data=Object.freeze(input()),node=create(doc,data);doc.root.append(node);
 const button=node.querySelector('button[data-upgrade-target]'),info=node.querySelector('.upgrade-option-info');
 assert.ok(button&&info);assert.equal(node.className,'upgrade-option');assert.equal(node.querySelectorAll('button').length,1);assert.equal(button.dataset.upgradeTarget,data.typeId);assert.equal(button.type,'button');
 assert.equal(button.textContent,'강화 · 25골드');assert.equal(button.children.length,0);assert.equal(info.querySelector('.upgrade-target-name').textContent,data.name);assert.equal(info.querySelector('.upgrade-preview').textContent,data.preview);assert.equal(info.querySelector('.upgrade-condition').textContent,data.status);assert.ok(info.textContent.includes(data.condition));assert.ok(!button.contains(info));
 assert.deepEqual(data,input());
});
it('thirty long source names and prices stay in text while the delegated action remains one line',()=>{
 const doc=dom();for(let i=0;i<30;i++){const data=input({typeId:'x'+String(i).padStart(3,'0'),name:`${i} <은&비취> `+'매우 긴 원작 강화 보석 '.repeat(12),cost:999999990+i});const node=create(doc,data);doc.root.append(node);const button=node.querySelector('button[data-upgrade-target]');assert.equal(node.querySelector('.upgrade-target-name').textContent,data.name);assert.equal(button.textContent,`강화 · ${data.cost}골드`);assert.ok(!/[\r\n]/.test(button.textContent));assert.equal(button.dataset.upgradeTarget,data.typeId);assert.equal(node.querySelectorAll('button').length,1);assert.equal(button.querySelectorAll('small').length,0);}
 assert.equal(doc.root.querySelectorAll('button[data-upgrade-target]').length,30);
});
it('disabled and title are supplied by the caller, including free and unknown-price labels',()=>{
 const doc=dom();for(const data of [input({disabled:true,condition:'골드가 부족합니다'}),input({disabled:false,condition:'상태 문구를 새로 계산하지 않음',cost:0}),input({disabled:true,cost:null,condition:''})]){const node=create(doc,data),button=node.querySelector('button[data-upgrade-target]');assert.equal(button.disabled,data.disabled);assert.equal(button.title,data.condition);assert.equal(button.textContent,`강화 · ${data.cost??'—'}골드`);}
});
it('the complete target and price label refers to existing external descriptions with unique IDs',()=>{
 const doc=dom();for(let i=0;i<2;i++){const data=input({typeId:'h #A',name:'<원작> 긴 이름'}),node=create(doc,data);doc.root.append(node);const button=node.querySelector('button[data-upgrade-target]');assert.ok(button.getAttribute('aria-label').includes(data.name));assert.ok(button.getAttribute('aria-label').includes('25골드'));const refs=button.getAttribute('aria-describedby').split(/\s+/);assert.equal(new Set(refs).size,refs.length);for(const id of refs){const described=doc.getElementById(id);assert.ok(described);assert.ok(node.contains(described));assert.ok(!button.contains(described));}assert.ok(refs.map(id=>doc.getElementById(id).textContent).join(' ').includes(data.preview));assert.ok(refs.map(id=>doc.getElementById(id).textContent).join(' ').includes(data.condition));}
 const ids:string[]=[];const walk=(node:any)=>{if(node.id)ids.push(node.id);for(const child of node.children)walk(child);};walk(doc.root);assert.equal(ids.length,new Set(ids).size);
});
it('identical status and condition are not printed twice; empty descriptions create no dangling reference',()=>{
 const doc=dom(),same='먼저 연구하세요',node=create(doc,input({status:same,condition:same,preview:''}));doc.root.append(node);const info=node.querySelector('.upgrade-option-info');assert.equal(info.textContent.split(same).length-1,1);const button=node.querySelector('button');for(const id of (button.getAttribute('aria-describedby')??'').split(/\s+/).filter(Boolean))assert.ok(doc.getElementById(id));
});
it('existing delegated button matching and green raster state are retained without colouring the information',()=>{
 const doc=dom();for(const disabled of [false,true]){const node=create(doc,input({disabled})),button=node.querySelector('button[data-upgrade-target]');assert.equal(button.closest('button[data-upgrade-target]'),button);assert.equal(node.querySelector('.upgrade-option-info').closest('button[data-upgrade-target]'),null);assert.equal(skin.approvedButtonMaterial({action:button.hasAttribute('data-upgrade-target'),disabled:button.disabled}),'button-green-'+(disabled?'disabled':'normal'));assert.equal(skin.approvedButtonMaterial({action:true,pressed:true,disabled}),'button-green-'+(disabled?'disabled':'pressed'));}
});
it('the DOM helper neither registers commands nor reads simulation, storage, clock or random state',()=>{
 const doc=dom();for(const key of ['world','sim','ledger','localStorage','fetch'])Object.defineProperty(doc,key,{get(){throw Error('forbidden command/data access '+key);}});const random=Math.random,now=Date.now;try{Math.random=()=>{throw Error('view must not use RNG');};Date.now=()=>{throw Error('view must not read clock');};const data=Object.freeze(input({disabled:false,cost:999999999,status:'골드 부족'})),node=create(doc,data);assert.equal(node.querySelector('button').disabled,false,'caller decision is not recomputed from cost/status');assert.equal(doc.registrations,0);assert.equal((node.querySelector('button') as any).onclick,undefined);}finally{Math.random=random;Date.now=now;}
});
it('the combat disclosure still counts one enabled nested upgrade and does not count disabled choices',()=>{
 const doc=dom(),make=(tag:string,id='',className='')=>{const node=doc.createElement(tag);node.id=id;node.className=className;return node;};
 const panel=make('div','gemPanel'),name=make('div','','bp-name'),meta=make('details','','gem-meta'),summary=make('summary'),body=make('div','','gem-detail-body'),actions=make('div','','bp-actions'),close=make('button','gemDeselect'),keep=make('button','castA009'),upgrades=make('div','gemUpgrades'),none=make('div','gemNone');
 keep.disabled=true;none.append(make('span'));upgrades.append(create(doc,input()),create(doc,input({typeId:'h033',disabled:true})));body.append(upgrades);meta.append(summary,body);name.append(meta);actions.append(keep,close);panel.append(name,actions);doc.root.append(panel,none);
 const controller=skin.createSelectionCard(doc);controller.render({selectedId:7,selectedGem:{id:7},chosen:true,combatActive:true});assert.equal(summary.textContent,'능력·강화 1개');
});
