import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mountGameMenu} from '../../web/game-menu.js';

/** Reuses the keyed-node/focus test shape from casino-choices. It models the
 * already-mounted real shell order, not game logic or a second menu policy. */
function fixture({earlyDiagnostic=false}={}){
 const doc:any={activeElement:null};let moves=0;
 class Node{
  tagName:string;id='';children:any[]=[];parentElement:any=null;dataset:any={};attributes:any={};className='';hidden=false;inert=false;open=false;disabled=false;tabIndex=0;scrollTop=0;textContent='';value='';type='';readOnly=false;listeners:any={};onclick:any=null;
  constructor(tag='div'){this.tagName=tag.toUpperCase();}
  append(...nodes:any[]){for(const node of nodes){if(node.parentElement){node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);moves++;}node.parentElement=this;this.children.push(node);}}
  prepend(...nodes:any[]){for(const node of [...nodes].reverse()){if(node.parentElement){node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);moves++;}node.parentElement=this;this.children.unshift(node);}}
  before(...nodes:any[]){const p=this.parentElement;if(!p)return;for(const node of nodes){if(node.parentElement)node.parentElement.children.splice(node.parentElement.children.indexOf(node),1);node.parentElement=p;p.children.splice(p.children.indexOf(this),0,node);}}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='tabindex')this.tabIndex=Number(v);}
  getAttribute(k){return this.attributes[k]??null;}
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  dispatch(k,event:any={}){for(const fn of this.listeners[k]??[])fn({target:this,preventDefault(){event.prevented=true;},...event});}
  click(){if(!this.disabled){this.onclick?.({target:this});this.dispatch('click');}}
  contains(node){return this===node||this.children.some(c=>c.contains(node));}
  closest(selector){let node:any=this;while(node){if(matches(node,selector))return node;node=node.parentElement;}return null;}
  querySelector(selector){return descendants(this).find(n=>matches(n,selector))??null;}
  querySelectorAll(selector){return descendants(this).filter(n=>matches(n,selector));}
  focus(){let node:any=this;while(node){if(node.hidden||node.inert)return;node=node.parentElement;}if(!this.disabled)doc.activeElement=this;}
  getClientRects(){let node:any=this;while(node){if(node.hidden||node.inert)return [];node=node.parentElement;}return [{}];}
 }
 const descendants=(node:any):any[]=>node.children.flatMap(n=>[n,...descendants(n)]);
 const matches=(node:any,selector:string)=>selector.startsWith('#')?node.id===selector.slice(1):selector.startsWith('.')?node.className.split(/\s+/).includes(selector.slice(1)):selector.startsWith('[')?node.getAttribute(selector.slice(1,-1).split('=')[0])===selector.slice(1,-1).split('=')[1]?.replace(/["']/g,''):node.tagName===selector.toUpperCase();
 const root=new Node('div');root.id='gameApp';doc.createElement=(tag:string)=>new Node(tag);doc.getElementById=id=>[root,...descendants(root)].find(n=>n.id===id)??null;doc.querySelector=selector=>[root,...descendants(root)].find(n=>matches(n,selector))??null;
 const nodes:any={gameApp:root};
 const add=(parent:any,tag:string,id='',className='')=>{const n=new Node(tag);n.id=id;n.className=className;parent.append(n);if(id)nodes[id]=n;return n;};
 const header=add(root,'header'),play=add(header,'button','play');play.textContent='일시정지';
 const drawer=add(root,'aside','gameDrawer'),head=add(drawer,'div','','drawer-head');add(head,'h2').textContent='연구 · 메뉴';add(head,'button','drawerClose').textContent='닫기';
 const controls=add(drawer,'section','','menu-controls');add(controls,'h3').textContent='게임 조작';add(controls,'button','reset').textContent='새 게임';add(controls,'label','','speed-control').append(add(new Node(),'input','speed'));
 const precision=add(controls,'label','','precise-placement');add(precision,'input','precisePlacement');add(controls,'button','changeSetup');const difficulty=add(controls,'p','','menu-difficulty');add(difficulty,'span','difficultyTag');
 const owned=add(drawer,'details','ownedExplorer');add(owned,'summary').textContent='보유 보석';add(owned,'div','gemRoster');
 add(drawer,'p','drawerRunStatus');const sound=add(drawer,'div','','feedback-sound');add(sound,'button','feedbackSound');add(sound,'span','feedbackSoundStatus');
 const group=(id:string,parent=drawer)=>{const n=add(parent,'details',id,'menu-group');add(n,'summary').textContent=id;return n;};
 const recipe=group('recipeOptions');add(recipe,'input','recipeSearch');add(recipe,'div','recipeList');
 const save=group('saveOptions');add(save,'button','saveRun');add(save,'select','savedRuns');add(save,'button','resumeRun');
 const mine=group('mineOptions');add(mine,'div','trainingOptions');
 const research=group('researchOptions');add(research,'button','rsR000Btn');add(research,'p','researchStatus');
 const casino=group('casinoOptions');add(casino,'section','casinoPanel');
 const players=add(drawer,'details');add(players,'summary').textContent='플레이어 현황';add(players,'div','multiboard');
 const chat=add(drawer,'details');add(chat,'summary').textContent='채팅 명령';add(chat,'input','chatInput');add(chat,'button','chatSend');
 const advanced=group('advancedOptions');group('devInfo',advanced);group('devRuntime',advanced);const replay=group('replayDetails',advanced);add(replay,'textarea','replayInput');
 add(drawer,'p','artStatus');add(drawer,'p').textContent='원작 자료 안내';
 if(earlyDiagnostic){const old=add(drawer,'details');add(old,'summary').textContent='오류 기록';add(old,'textarea','browserDiagnosticText').value='early failure';}
 const original={...nodes};return {doc,nodes,original,drawer,controls,players,chat,all:()=>[root,...descendants(root)],moves:()=>moves};
}

it('mounts three semantic tabs after existing skin/recipe nodes, preserving every original node and listener',()=>{
 const f=fixture();let orders=0;f.nodes.rsR000Btn.onclick=()=>orders++;
 const menu=mountGameMenu(f.doc);const tabs=f.all().filter(n=>n.getAttribute('role')==='tab');assert.deepEqual(tabs.map(n=>n.textContent),['지금 판','도감·조합표','설정']);
 for(const [id,node] of Object.entries(f.original))assert.equal(f.doc.getElementById(id),node,id);
 assert.equal(new Set(f.all().filter(n=>n.id).map(n=>n.id)).size,f.all().filter(n=>n.id).length,'no duplicated source IDs');
 assert.equal(f.nodes.recipeOptions.parentElement.id,'menuGuideHost');assert.ok(f.doc.getElementById('menuPanelGuide').contains(f.nodes.casinoPanel));
 menu.select('guide');f.nodes.rsR000Btn.click();assert.equal(orders,1);assert.equal(mountGameMenu(f.doc),menu,'idempotent mounting keeps keyed control objects');
});
it('opens save content on the current-game tab and keeps new game last without moving header pause',()=>{
 const f=fixture();mountGameMenu(f.doc);const run=f.doc.getElementById('menuPanelRun');assert.ok(run);assert.equal(run.hidden,false);assert.equal(f.nodes.saveOptions.open,true);assert.ok(run.contains(f.nodes.savedRuns));assert.ok(run.contains(f.nodes.ownedExplorer));
 assert.ok(run.children.at(-1).contains(f.nodes.reset));assert.equal(f.nodes.play.parentElement.tagName,'HEADER');assert.equal(f.doc.getElementById('menuPanelSettings').contains(f.nodes.reset),false);
 for(const id of ['precisePlacement','changeSetup','feedbackSound','difficultyTag','advancedOptions'])assert.ok(f.doc.getElementById('menuPanelSettings').contains(f.nodes[id]),id);
});
it('menu pause delegates exactly once to the current source control and mirrors its source label/disabled state',()=>{
 const f=fixture();let clicks=0;f.nodes.play.onclick=()=>{clicks++;f.nodes.play.textContent='재개';};const menu=mountGameMenu(f.doc),proxy=f.doc.getElementById('menuPlay');assert.ok(proxy);proxy.click();assert.equal(clicks,1);assert.equal(proxy.textContent,'재개');
 f.nodes.play.disabled=true;proxy.click();assert.equal(clicks,1,'a newly disabled source cannot receive a stale enabled proxy click');menu.sync({solo:true,playing:false});assert.equal(proxy.disabled,true);proxy.click();assert.equal(clicks,1);assert.equal(f.doc.getElementById('menuPanelRun').hidden,false);
});
it('tabs support arrow/Home/End navigation and inactive panels cannot retain keyboard focus',()=>{
 const f=fixture(),menu=mountGameMenu(f.doc),run=f.doc.getElementById('menuTabRun'),guide=f.doc.getElementById('menuTabGuide'),settings=f.doc.getElementById('menuTabSettings');
 run.focus();run.dispatch('keydown',{key:'ArrowRight'});assert.equal(f.doc.activeElement,guide);assert.equal(guide.getAttribute('aria-selected'),'true');assert.equal(f.doc.getElementById('menuPanelRun').hidden,true);assert.equal(f.doc.getElementById('menuPanelRun').inert,true);
 f.nodes.saveRun.focus();assert.notEqual(f.doc.activeElement,f.nodes.saveRun);guide.dispatch('keydown',{key:'End'});assert.equal(f.doc.activeElement,settings);settings.dispatch('keydown',{key:'Home'});assert.equal(f.doc.activeElement,run);run.dispatch('keydown',{key:'ArrowLeft'});assert.equal(f.doc.activeElement,settings);
 menu.select('guide');f.nodes.rsR000Btn.focus();menu.select('settings');assert.equal(f.doc.activeElement,settings,'moving away from a focused panel returns focus to the selected tab');
});
it('ordinary updates preserve research focus, chosen tab, source controls and scroll until explicit navigation',()=>{
 const f=fixture(),menu=mountGameMenu(f.doc);menu.select('guide');f.nodes.rsR000Btn.focus();f.drawer.scrollTop=217;const guide=f.doc.getElementById('menuPanelGuide');guide.scrollTop=311;const before=f.moves();
 for(let i=0;i<20;i++){f.nodes.researchStatus.textContent='연구 '+i;f.nodes.play.textContent=i%2?'재개':'일시정지';menu.sync({solo:true,playing:i%2===0});}
 assert.equal(f.doc.activeElement,f.nodes.rsR000Btn);assert.equal(f.drawer.scrollTop,217);assert.equal(guide.scrollTop,311);assert.equal(f.moves(),before);assert.equal(f.doc.getElementById('menuTabGuide').getAttribute('aria-selected'),'true');
 menu.select('run');f.drawer.scrollTop=35;f.doc.getElementById('menuPanelRun').scrollTop=45;guide.scrollTop=0;menu.select('guide');assert.equal(f.drawer.scrollTop,217,'each tab restores its drawer scroll');assert.equal(guide.scrollTop,311,'inner panel scroll also restores after hidden-layout clamping');menu.select('run');assert.equal(f.doc.getElementById('menuPanelRun').scrollTop,45);
});
it('solo hides source chat/player wrappers only and multiplayer exposes the exact same bound controls',()=>{
 const f=fixture();let sends=0;f.nodes.chatSend.onclick=()=>sends++;const menu=mountGameMenu(f.doc);menu.sync({solo:true});assert.equal(f.chat.hidden,true);assert.equal(f.players.hidden,true);assert.equal(f.doc.getElementById('chatSend'),f.nodes.chatSend);
 menu.sync({solo:false});assert.equal(f.chat.hidden,false);assert.equal(f.players.hidden,false);menu.reveal('chatInput',{focus:true});assert.equal(f.doc.activeElement,f.nodes.chatInput);f.nodes.chatSend.click();assert.equal(sends,1);
});
it('rock shortcut reveals the current-game tab and opens existing owning details before roster focus',()=>{
 const f=fixture(),menu=mountGameMenu(f.doc);menu.select('settings');assert.equal(menu.reveal('ownedExplorer'),true);assert.equal(f.doc.getElementById('menuPanelRun').hidden,false);assert.equal(f.nodes.ownedExplorer.open,true);assert.equal(menu.reveal('missing-control'),false);assert.equal(menu.select('unknown'),false);
});
it('retains early diagnostics and seeds the same textarea ID for later inline browser error reports',()=>{
 for(const earlyDiagnostic of [false,true]){const f=fixture({earlyDiagnostic}),old=f.doc.getElementById('browserDiagnosticText');mountGameMenu(f.doc);const area=f.doc.getElementById('browserDiagnosticText');assert.ok(area);if(old){assert.equal(area,old);assert.equal(area.value,'early failure');}assert.ok(f.nodes.advancedOptions.contains(area));
  const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8'),errorText=html.match(/  function browserErrorText[^\n]*\{[\s\S]*?\n  \}/)?.[0],record=html.match(/  function recordBrowserDiagnostic[^\n]*\{[\s\S]*?\n  \}/)?.[0];assert.ok(errorText&&record);const count=f.all().length,context:any={document:f.doc,browserDiagnostics:[]};vm.runInNewContext(errorText+'\n'+record,context);context.recordBrowserDiagnostic('test','late diagnostic');assert.match(area.value,/late diagnostic/);assert.equal(f.all().length,count,'real late collector writes into the seeded textarea without appending outside tabs');
 }
});

it('guide starts with research available and long recipes collapsed without replacing either control group',()=>{const f=fixture();mountGameMenu(f.doc);assert.equal(f.nodes.recipeOptions.open,false);assert.equal(f.nodes.researchOptions.open,true);assert.equal(f.doc.getElementById('researchOptions'),f.original.researchOptions);});
it('keeps a skin-installed outer frame canvas in the drawer when skin mounts before menu tabs',()=>{
 const f=fixture(),frame=f.doc.createElement('canvas');frame.id='existingDrawerFrame';frame.className='skin-material outer-frame';frame.setAttribute('aria-hidden','true');f.drawer.prepend(frame);
 const identity=f.doc.getElementById('existingDrawerFrame');const menu=mountGameMenu(f.doc);
 assert.equal(f.doc.getElementById('existingDrawerFrame'),identity,'existing canvas identity is preserved');assert.equal(frame.parentElement,f.drawer,'structural outer material must not become advanced-tab content');assert.equal(f.drawer.children[0],frame,'the source frame remains the first drawer child');assert.equal(f.nodes.advancedOptions.contains(frame),false);
 for(const tab of ['guide','settings','run'])menu.select(tab);assert.equal(frame.parentElement,f.drawer);assert.equal(f.all().filter(n=>n.id==='existingDrawerFrame').length,1);
});
