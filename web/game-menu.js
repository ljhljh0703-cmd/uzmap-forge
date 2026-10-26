/** Three menu tabs around the already-mounted source controls.
 * Mount after skin, simplifyPlayShell and mountRecipeBook. This module owns DOM
 * presentation only: no world, clock, orders, RNG, storage or replay access.
 */
const mountedMenus=new WeakMap();
const TABS=[['run','지금 판'],['guide','도감·조합표'],['settings','설정']];
const titleCase=name=>name[0].toUpperCase()+name.slice(1);
function setAttribute(node,key,value){if(node.getAttribute(key)!==String(value))node.setAttribute(key,String(value));}
function move(node,parent){if(node&&parent&&node.parentElement!==parent)parent.append(node);}

export function mountGameMenu(doc){
 if(mountedMenus.has(doc))return mountedMenus.get(doc);
 const byId=id=>doc.getElementById(id),drawer=byId('gameDrawer'),app=byId('gameApp');
 if(!drawer||!app)return {select(){return false;},reveal(){return false;},sync(){}};
 const originalChildren=[...drawer.children],head=drawer.querySelector('.drawer-head'),sourcePlay=byId('play');
 const tabs=doc.createElement('div');tabs.id='gameMenuTabs';tabs.className='game-menu-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','메뉴 분류');
 const buttons=new Map(),panels=new Map(),scrolls=new Map();let selected='run';
 for(const [key,label]of TABS){
  const suffix=titleCase(key),button=doc.createElement('button'),panel=doc.createElement('section');
  button.id='menuTab'+suffix;button.type='button';button.className='sec';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls','menuPanel'+suffix);
  panel.id='menuPanel'+suffix;panel.className='game-menu-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
  button.setAttribute('aria-selected',String(key===selected));button.tabIndex=key===selected?0:-1;panel.hidden=key!==selected;panel.inert=key!==selected;panel.setAttribute('aria-hidden',String(key!==selected));
  tabs.append(button);buttons.set(key,button);panels.set(key,panel);
 }
 drawer.append(tabs,...panels.values());drawer.setAttribute('aria-label','게임 메뉴');
 const heading=head?.querySelector('h2');if(heading)heading.textContent='메뉴';
 const run=panels.get('run'),guide=panels.get('guide'),settings=panels.get('settings');
 const controls=drawer.querySelector('.menu-controls')??doc.createElement('section');controls.id||='menuRunControls';controls.className='menu-controls';controls.setAttribute('aria-label','게임 조작');
 const speed=doc.querySelector('.speed-control'),precision=doc.querySelector('.precise-placement'),difficulty=doc.querySelector('.menu-difficulty'),sound=doc.querySelector('.feedback-sound');
 move(speed,controls);
 const pause=doc.createElement('button');pause.id='menuPlay';pause.type='button';pause.className='sec';controls.append(pause);
 move(controls,run);move(byId('drawerRunStatus'),run);move(byId('ownedExplorer'),run);
 const save=byId('saveOptions');if(save){save.open=true;move(save,run);}
 const newGame=doc.createElement('section');newGame.id='menuNewGame';newGame.className='menu-new-game';const newGameTitle=doc.createElement('h3');newGameTitle.textContent='새 게임';newGame.append(newGameTitle);move(byId('reset'),newGame);run.append(newGame);
 const guideHost=doc.createElement('div');guideHost.id='menuGuideHost';guide.append(guideHost);
 for(const id of ['recipeOptions','researchOptions','mineOptions','casinoOptions'])move(byId(id),guideHost);
 const recipe=byId('recipeOptions');if(recipe)recipe.open=false;const research=byId('researchOptions');if(research)research.open=true;
 for(const node of [sound,precision,byId('changeSetup'),difficulty])move(node,settings);
 let advanced=byId('advancedOptions');
 if(!advanced){advanced=doc.createElement('details');advanced.id='advancedOptions';advanced.className='menu-group';const summary=doc.createElement('summary');summary.textContent='실행 정보·조작 기록';advanced.append(summary);}
 move(advanced,settings);
 const chat=byId('chatInput')?.closest('details'),players=byId('multiboard')?.closest('details');
 for(const node of [players,chat])move(node,advanced);
 // The inline error collector looks up this exact ID before creating a new
 // drawer child. Seed its destination once, or preserve an earlier error panel.
 let diagnostic=byId('browserDiagnosticText');
 if(diagnostic){move(diagnostic.closest('details')??diagnostic,advanced);}
 else{
  const details=doc.createElement('details'),summary=doc.createElement('summary');details.id='menuBrowserDiagnostics';summary.textContent='오류 기록';diagnostic=doc.createElement('textarea');diagnostic.id='browserDiagnosticText';diagnostic.readOnly=true;diagnostic.rows=6;diagnostic.placeholder='오류 기록이 없습니다';diagnostic.setAttribute('aria-label','브라우저 오류 기록');details.append(summary,diagnostic);advanced.append(details);
 }
 // Source notes and late-before-mount diagnostics remain available, without
 // becoming extra sections underneath every selected tab. Keep the outer skin
 // material installed before this module in its structural drawer position.
 for(const node of originalChildren)if(node!==head&&!node.className.split(/\s+/).includes('skin-material')&&node.parentElement===drawer)move(node,advanced);

 function select(key,{focus=false}={}){
  if(!buttons.has(key))return false;
  if(selected!==key){
   const previous=panels.get(selected),focused=previous.contains(doc.activeElement);scrolls.set(selected,{drawer:drawer.scrollTop,panel:previous.scrollTop});selected=key;
   for(const [name,button]of buttons){const active=name===key,panel=panels.get(name);setAttribute(button,'aria-selected',active);button.tabIndex=active?0:-1;if(panel.hidden===active)panel.hidden=!active;if(panel.inert===active)panel.inert=!active;setAttribute(panel,'aria-hidden',!active);}
   const scroll=scrolls.get(key);drawer.scrollTop=scroll?.drawer??0;panels.get(key).scrollTop=scroll?.panel??0;if(focused)focus=true;
  }
  if(focus)buttons.get(key).focus();return true;
 }
 function reveal(id,{focus=false}={}){
  const node=byId(id);if(!node||!drawer.contains(node))return false;
  const match=[...panels].find(([,panel])=>panel.contains(node));if(!match)return false;
  select(match[0]);let parent=node;
  while(parent&&parent!==drawer){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
  if(focus&&!node.hidden&&!node.inert)node.focus();return true;
 }
 function sync({solo,playing}={}){
  if(typeof solo==='boolean')for(const node of [chat,players])if(node){if(node.hidden!==solo)node.hidden=solo;if(node.inert!==solo)node.inert=solo;}
  const label=sourcePlay?.textContent||(playing===false?'재개':'일시정지');if(pause.textContent!==label)pause.textContent=label;
  const disabled=Boolean(sourcePlay?.disabled??true);if(pause.disabled!==disabled)pause.disabled=disabled;
 }
 for(const [index,[key]]of TABS.entries()){
  const button=buttons.get(key);button.addEventListener('click',()=>select(key,{focus:true}));
  button.addEventListener('keydown',event=>{
   const next=event.key==='Home'?0:event.key==='End'?TABS.length-1:event.key==='ArrowRight'?(index+1)%TABS.length:event.key==='ArrowLeft'?(index+TABS.length-1)%TABS.length:null;
   if(next===null)return;event.preventDefault();select(TABS[next][0],{focus:true});
  });
 }
 pause.addEventListener('click',()=>{if(!sourcePlay?.disabled)sourcePlay?.click();sync();});
 const controller={select,reveal,sync};mountedMenus.set(doc,controller);app.dataset.menuTabs='true';sync({solo:true});return controller;
}
