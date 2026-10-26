import {it} from 'node:test';
import assert from 'node:assert/strict';
import * as skin from '../../web/ui-skin.js';

function fixture(){
 const doc:any={activeElement:null,defaultView:{innerHeight:844}};
 class Element{
  id='';tagName:string;parentNode:Element|null=null;children:Element[]=[];dataset:any={};attributes=new Map();hidden=false;disabled=false;open=false;textContent='';title='';focuses=0;listeners=new Map<string,Set<Function>>();style:any={setProperty(){}};
  constructor(tag='div',id=''){this.tagName=tag.toUpperCase();this.id=id;}
  get nextSibling(){const list=this.parentNode?.children??[],index=list.indexOf(this);return list[index+1]??null;}
  get isConnected(){return true;}
  append(...nodes:Element[]){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
  prepend(node:Element){node.remove();node.parentNode=this;this.children.unshift(node);}
  insertBefore(node:Element,next:Element|null){node.remove();const at=next?this.children.indexOf(next):-1;node.parentNode=this;if(at<0)this.children.push(node);else this.children.splice(at,0,node);}
  remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);if(this.contains(doc.activeElement))doc.activeElement=null;}this.parentNode=null;}
  contains(node:any):boolean{return node===this||this.children.some(child=>child.contains(node));}
  querySelector(selector:string):Element|null{const hit=(e:Element)=>selector==='summary'?e.tagName==='SUMMARY':selector.startsWith('.')?e.attributes.get('class')===selector.slice(1):false;for(const child of this.children){if(hit(child))return child;const found=child.querySelector(selector);if(found)return found;}return null;}
  setAttribute(k:string,v:string){this.attributes.set(k,v);}getAttribute(k:string){return this.attributes.get(k)??null;}
  addEventListener(k:string,f:Function){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k)!.add(f);}removeEventListener(k:string,f:Function){this.listeners.get(k)?.delete(f);}
  focus(){doc.activeElement=this;this.focuses++;}
 }
 const nodes:any={};const el=(tag:string,id='')=>{const node=new Element(tag,id);if(id)nodes[id]=node;return node;};
 const panel=el('div','gemPanel'),name=el('div');name.setAttribute('class','bp-name');const title=el('b','gemName');title.textContent='퍼펙트 루비';const badge=el('span','gemSpecialBadge');badge.textContent='특별 보석';
 const meta=el('details');meta.setAttribute('class','gem-meta');const summary=el('summary');summary.textContent='정보·강화';const body=el('div');body.setAttribute('class','gem-detail-body');const stats=el('div'),upgrade=el('div','gemUpgrades'),upgradeButton=el('button');upgradeButton.textContent='상급 루비 강화';upgrade.append(upgradeButton);body.append(stats,upgrade);meta.append(summary,body);name.append(title,badge,meta);
 const actions=el('div');actions.setAttribute('class','bp-actions');const keep=el('button','castA009');keep.textContent='보석 선택';keep.title='보석 한 개를 남깁니다';const ability=el('button','castA007');ability.textContent='보석 조합';const missing=el('button','castA03M');missing.hidden=true;const close=el('button','gemDeselect');close.textContent='선택 닫기';actions.append(keep,ability,missing,close);panel.append(name,actions);
 const portraitHome=el('div'),portrait=el('canvas','selectedGemPortrait');portrait.setAttribute('aria-hidden','true');portraitHome.append(portrait);panel.prepend(portraitHome);
 const none=el('div','gemNone'),hint=el('span');none.append(hint);
 const root=el('main');root.append(panel,none);
 const find=(node:Element,id:string):Element|null=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean)??null;
 doc.createElement=(tag:string)=>el(tag);doc.getElementById=(id:string)=>nodes[id]??find(root,id);doc.querySelector=(selector:string)=>selector==='#gemNone span'?hint:root.querySelector(selector);
 assert.equal(typeof (skin as any).createSelectionCard,'function','actual source presentation controller exists');
 const controller=(skin as any).createSelectionCard(doc);
 const render=(snapshot:any={})=>controller.render({selectedId:7,selectedGem:{id:7,name:'퍼펙트 루비'},buildCount:5,chosen:false,combatActive:false,pendingPoint:false,pendingTarget:null,...snapshot});
 return {doc,nodes,panel,name,title,badge,meta,summary,body,stats,upgrade,upgradeButton,actions,keep,ability,missing,close,hint,portrait,render};
}
it('the existing keep button states its result without changing identity, title conditions or acquired commands',()=>{
 const f=fixture(),before=[...f.actions.children];f.render();assert.equal(f.keep.textContent,'남기기');assert.equal(f.keep.getAttribute('aria-label'),'이 보석 남기기');assert.equal(f.keep.title,'보석 한 개를 남깁니다');assert.equal(f.keep.id,'castA009');assert.deepEqual(f.actions.children,before);assert.equal(f.keep.disabled,false);
 assert.equal(f.close.textContent,'×');assert.equal(f.close.getAttribute('aria-label'),'선택 닫기');assert.equal(skin.approvedButtonMaterial({id:'gemDeselect'}),null);assert.equal(skin.approvedButtonMaterial({id:'castA008'}),'button-green-normal');
 assert.match(f.hint.textContent,/남기/);f.render({buildCount:3});assert.match(f.hint.textContent,/2개/);f.render({chosen:true});assert.match(f.hint.textContent,/능력.*강화/);
});
it('combat compacts to a named disclosure and close, retaining the same ability and upgrade controls',()=>{
 const f=fixture();f.keep.disabled=true;f.render({chosen:true,combatActive:true});assert.equal(f.panel.dataset.combatCard,'true');assert.equal(f.meta.open,false);assert.equal(f.actions.parentNode,f.body);assert.equal(f.close.parentNode,f.name);assert.equal(f.badge.parentNode,f.body);assert.equal(f.upgradeButton.parentNode,f.upgrade);assert.equal(f.ability.hidden,false);assert.equal(f.missing.hidden,true);assert.match(f.summary.textContent,/능력·강화.*2/);
 f.meta.open=true;f.render({chosen:true,combatActive:true});assert.equal(f.meta.open,true,'render never overwrites an explicit open');
 const focus=f.ability;focus.focus();f.render({selectedId:8,selectedGem:{id:8},chosen:true,combatActive:true});assert.equal(f.meta.open,true,'focused commands are not collapsed');assert.equal(f.doc.activeElement,focus);
});
it('pending target or point actions expose their controls and selection close preserves focus during reparenting',()=>{
 const f=fixture();f.close.focus();f.render({chosen:true,combatActive:true});assert.equal(f.doc.activeElement,f.close);assert.ok(f.close.focuses>1,'same focused node survives its move');
 for(const pending of [{pendingPoint:true},{pendingTarget:{abilityId:'A05L'}}]){f.meta.open=false;f.render({chosen:true,combatActive:true,...pending});assert.equal(f.meta.open,true);}
 f.meta.open=false;f.render({selectedId:8,selectedGem:{id:8},chosen:true,combatActive:true});assert.equal(f.meta.open,false,'a fresh combat selection starts compact without losing the affordance');assert.match(f.summary.textContent,/능력·강화/);
});
it('preparation, ending or clearing selection restores original homes and never treats absent combat state as combat',()=>{
 const f=fixture(),home=[...f.actions.children];f.render({chosen:true,combatActive:true});f.render({combatActive:false});assert.equal(f.actions.parentNode,f.panel);assert.equal(f.close.parentNode,f.actions);assert.equal(f.badge.parentNode,f.name);assert.deepEqual(f.actions.children,home);assert.equal(f.panel.dataset.combatCard,'false');assert.equal(f.summary.textContent,'정보·강화');
 f.render({chosen:true,combatActive:true});f.render({selectedId:null,selectedGem:null,chosen:true,combatActive:true});assert.equal(f.actions.parentNode,f.panel);assert.equal(f.panel.dataset.combatCard,'false');f.render({chosen:true,combatActive:undefined});assert.equal(f.panel.dataset.combatCard,'false');
});

it('a source command that already has focus stays exposed when combat reparents its original node',()=>{
 const f=fixture();f.ability.focus();f.render({chosen:true,combatActive:true});assert.equal(f.meta.open,true);assert.equal(f.doc.activeElement,f.ability);assert.ok(f.ability.focuses>1);
});
it('the completed keep action collapses at combat and moves its newly disabled focus to the visible disclosure',()=>{
 const f=fixture();f.keep.focus();f.keep.disabled=true;f.render({chosen:true,combatActive:true});assert.equal(f.meta.open,false);assert.equal(f.doc.activeElement,f.summary);assert.match(f.summary.textContent,/능력·강화/);
});
it('one shared stage hint supports the field view without mutating source state or replacing pending-placement guidance',()=>{
 const hint=(skin as any).selectionStageHint;assert.equal(typeof hint,'function');
 const state={buildCount:3,chosen:false},before=structuredClone(state);assert.match(hint(state),/2개/);assert.deepEqual(state,before);
 assert.match(hint({buildCount:5,chosen:false}),/이 보석 남기기/);assert.match(hint({buildCount:0,chosen:true}),/능력.*강화/);assert.match(hint({}),/5개/);
});

it('selection details reuse the original portrait canvas and expose only supplied identity without adding a compact row',()=>{
 const f=fixture();const stone={id:7,name:'바위',kind:'stone',roleLabel:'바위 · 길을 막는 장애물'};
 f.render({selectedGem:stone,chosen:true,combatActive:true});const header=f.doc.getElementById('selectedUnitArt'),role=f.doc.getElementById('selectedUnitRole');assert.ok(header);assert.equal(header.parentNode,f.body);assert.equal(f.portrait.parentNode,header);assert.equal(f.portrait.getAttribute('aria-hidden'),'true');assert.equal(header.hidden,false);assert.equal(role.textContent,stone.roleLabel);assert.equal(header.dataset.kind,'stone');assert.equal(f.meta.open,false);
 f.meta.open=true;const slate={id:8,name:'우라늄 슬레이트',kind:'slate',roleLabel:'슬레이트 · 보조 효과'};f.render({selectedId:8,selectedGem:slate,chosen:true,combatActive:true,pendingPoint:true});assert.equal(f.doc.getElementById('selectedUnitArt'),header);assert.equal(f.doc.getElementById('selectedGemPortrait'),f.portrait);assert.equal(role.textContent,slate.roleLabel);assert.equal(header.dataset.kind,'slate');assert.equal(f.meta.open,true);
});
it('missing source identity hides the art header and clears old labels instead of inventing a unit classification',()=>{
 const f=fixture();f.render({selectedGem:{id:7,kind:'gem',roleLabel:'보석 · 공격 타워'}});const header=f.doc.getElementById('selectedUnitArt'),role=f.doc.getElementById('selectedUnitRole');assert.equal(header.hidden,false);
 for(const selectedGem of [null,{id:8},{id:8,kind:'slate'},{id:8,roleLabel:'분류'},{id:8,kind:'stone',roleLabel:'  '},{id:8,kind:4,roleLabel:'분류'}]){f.render({selectedId:selectedGem?.id??null,selectedGem});assert.equal(header.hidden,true);assert.equal(role.textContent,'');assert.equal(header.dataset.kind,undefined);}
});

it('ordinary keep focus collapses on combat entry even while the source button is still enabled',()=>{
 const f=fixture();f.render();f.keep.focus();assert.equal(f.keep.disabled,false);f.render({chosen:true,combatActive:true});assert.equal(f.meta.open,false);assert.equal(f.doc.activeElement,f.summary);f.meta.open=true;f.ability.focus();f.render({chosen:true,combatActive:true});assert.equal(f.meta.open,true);assert.equal(f.doc.activeElement,f.ability);
});

it('PC and phone keep details closed until requested, preserve explicit opening across resize and retain the same commands',()=>{const f=fixture();f.render({desktop:true,chosen:true,combatActive:true});assert.equal(f.meta.open,false);assert.equal(f.summary.hidden,false);assert.equal(f.actions.parentNode,f.body);f.meta.open=true;f.render({desktop:true,chosen:true,combatActive:true});assert.equal(f.meta.open,true);f.render({desktop:false,chosen:true,combatActive:true});assert.equal(f.summary.hidden,false);assert.equal(f.meta.open,true);f.meta.open=false;f.render({desktop:true,chosen:true,combatActive:true});assert.equal(f.meta.open,false);});

it('PC details flow below current actions, return to the mobile name row on resize and retain the original focused controls',async()=>{const f=fixture(),meta=f.meta,body=f.body;f.render({desktop:true});assert.equal(meta.parentNode,f.panel);assert.ok(f.panel.children.indexOf(f.actions)<f.panel.children.indexOf(meta));assert.equal(f.meta.open,false);f.meta.open=true;f.upgradeButton.focus();f.render({desktop:true,chosen:true,combatActive:true});assert.equal(f.doc.activeElement,f.upgradeButton);assert.equal(f.meta,meta);assert.equal(f.body,body);assert.equal(f.panel.dataset.desktopCard,'true');f.render({desktop:false,chosen:true,combatActive:true});assert.equal(meta.parentNode,f.name);assert.ok(f.name.children.indexOf(meta)<f.name.children.indexOf(f.close));assert.equal(f.meta.open,true);assert.equal(f.doc.activeElement,f.upgradeButton);assert.equal(f.panel.dataset.desktopCard,'false');const {readFileSync}=await import('node:fs');const css=readFileSync('web/play.css','utf8');assert.match(css,/#gemPanel\[data-desktop-card=true\]\[data-selection-sheet=true\]>\.gem-meta>\.gem-detail-body\{position:static/);});
