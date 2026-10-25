/** UI-only observation. Source snapshots stay read-only; the single storage key
 * is a visit preference, never a run/replay/save field or a game command. */
export const FIRST_RUN_GUIDE_KEY='uzmap.ui.gemtower.tutorial.v1';
const CARDS=Object.freeze([
 Object.freeze({step:1,anchor:'build',text:'빈칸을 눌러 보석을 놓아요\n길 위에 놓으면 적이 돌아가요'}),
 Object.freeze({step:2,anchor:'hand',text:'1개를 남기면 나머지는 바위가 돼요\n같은 보석 2개는 조합해 강화해요'}),
 Object.freeze({step:3,anchor:'life',text:'광산에 도착한 적은 생명을 줄여요'}),
 Object.freeze({step:4,anchor:'research',text:'골드로 다음 보석의 등급을 올려요'}),
]);
export const FIRST_RUN_TIPS=Object.freeze(CARDS.map(card=>card.text));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const copy=model=>model?{...model}:null;

export function createFirstRunGuide({storage=()=>globalThis.localStorage,off=false}={}){
 let attempted=false,active=false,stopped=false,phase='place',manualStep=0,model=null,suppressed=false;
 let initialRound=1,lastLife=null,firstCost=null,everAffordable=false,researchDone=false;
 const card=(step,manual=false)=>({...CARDS[step-1],manual});
 const publish=value=>{model=value;return copy(model);};
 function begin(input){
  if(attempted||stopped||off===true||input.ready!==true||input.prepared!==true||input.round!==1||input.buildCount!==0)return;
  attempted=true;
  try{
   const target=storage();
   if(target.getItem(FIRST_RUN_GUIDE_KEY)!==null){stopped=true;return;}
   // Claim this visit before showing anything: reloading midway is a returning visit.
   target.setItem(FIRST_RUN_GUIDE_KEY,'seen');
  }catch{stopped=true;return;}
  active=true;initialRound=input.round;lastLife=finite(input.life)?input.life:null;
 }
 function observeSource(input){
  if(firstCost===null&&positive(input.researchCost))firstCost=input.researchCost;
  if(firstCost!==null&&finite(input.gold)&&input.gold>=firstCost)everAffordable=true;
  if(finite(input.researchLevel)&&input.researchLevel>0)researchDone=true;
  const lifeDecreased=finite(input.life)&&lastLife!==null&&input.life<lastLife;
  const waveEnded=input.firstWaveEnded===true||Number.isSafeInteger(input.round)&&input.round>initialRound;
  const count=Number.isSafeInteger(input.buildCount)&&input.buildCount>=0?input.buildCount:0;
  if(phase==='place'&&count>0)phase='wait-hand';
  if(phase==='wait-hand'&&count>=5)phase='hand';
  if(phase==='hand'&&input.choiceConfirmed===true)phase='wait-wave';
  if(phase==='wait-wave'&&input.combatSeen===true)phase='life';
  // Fast progress between frames must not bring an earlier first-wave lesson back.
  if(waveEnded||phase==='life'&&lifeDecreased)phase='wait-research';
  if(phase==='wait-research'&&researchDone){phase='done';active=false;}
  if(finite(input.life))lastLife=input.life;
  if(phase==='place')return card(1);
  if(phase==='hand')return input.prepared===true?card(2):null;
  if(phase==='life')return card(3);
  if(phase==='wait-research'&&everAffordable&&input.prepared===true&&positive(input.researchCost)&&finite(input.gold)&&input.gold>=input.researchCost)return card(4);
  return null;
 }
 return {
  observe(snapshot={}){
   const input=snapshot&&typeof snapshot==='object'?snapshot:{};
   suppressed=input.restoring===true||input.own===false;
   if(suppressed)return publish(null);
   if(input.fresh===false||input.restoredView===true){active=false;stopped=true;}
   let automatic=null;
   if(input.ready===true&&!stopped&&off!==true){begin(input);if(active)automatic=observeSource(input);}
   return publish(manualStep?card(manualStep,true):automatic);
  },
  openManual(){manualStep=1;return publish(suppressed?null:card(1,true));},
  next(){
   if(!manualStep)return copy(model);
   if(manualStep<4){manualStep++;return publish(suppressed?null:card(manualStep,true));}
   // All four were explicitly read. Do not restart the automatic guide afterwards.
   manualStep=0;active=false;stopped=true;return publish(null);
  },
  skip(){manualStep=0;active=false;stopped=true;return publish(null);},
  snapshot(){return copy(model);},
 };
}

// First-view helper group; previous module URLs re-export the same functions.
/** Per-world, presentation-only warnings from resolved source wave models.
 * No commands, clocks, random draws, engine imports or save-state access.
 * Suppressed replay observes history, but never queues historical notices. */
export function createWaveWarnings({waveAt,total=50,airCount=()=>0}={}){
 const limit=Number.isSafeInteger(total)&&total>0?total:0,preparedRounds=new Set(),warned=new Set();
 let highestRound=0,firstAir;
 const wave=n=>{
  if(!Number.isSafeInteger(n)||n<1||n>limit||typeof waveAt!=='function')return null;
  try{const model=waveAt(n);return model&&model.round===n&&typeof model.typeId==='string'&&model.typeId?model:null;}catch{return null;}
 };
 const firstAirWave=()=>{
  if(firstAir!==undefined)return firstAir;
  for(let n=1;n<=limit;n++){
   const model=wave(n);if(!model||!['지상','공중'].includes(model.motion))return null;
   if(model.motion==='공중'){firstAir=n;return n;}
  }
  firstAir=null;return null;
 };
 const airText=target=>{
  let count;try{count=airCount();}catch{}
  const facts=Number.isSafeInteger(count)&&count>=0?'공중을 칠 수 있는 보석 '+count+'개':'공중 공격 가능 보석 수 확인 중';
  return (target===1?'이번 웨이브 공중':'2웨이브 뒤 공중')+' · 공중은 미로를 무시해요 · '+facts;
 };
 return {
  observe({round,prepared,suppressed=false}={}){
   if(!Number.isSafeInteger(round)||round<1||round>limit||round<highestRound)return null;
   highestRound=round;if(prepared!==true||preparedRounds.has(round))return null;
   const target=round+2,boss=wave(target)?.band==='boss'&&!warned.has('boss:'+target),first=firstAirWave();
   // The authored first air wave is 1: a round -1 preparation cannot exist.
   // Show this one exception in initial preparation, with honest current-wave wording.
   const air=first!==null&&!warned.has('air')&&(first===target||first===1&&round===1);
   if(suppressed||boss||air){preparedRounds.add(round);if(boss)warned.add('boss:'+target);if(air)warned.add('air');}
   if(suppressed)return null;
   // A simultaneous source boss/first-air event has one response; boss takes
   // priority and the air opportunity is consumed, so repeated render is quiet.
   if(boss)return {kind:'boss',targetWave:target,text:'2웨이브 뒤 보스 · 공격력 높은 보석을 길 가까이'};
   if(air)return {kind:'air',targetWave:first,text:airText(first)};
   return null;
  }
 };
}

/** First actual enemy types only. One active card and at most three pending
 * distinct types; overflow is consumed as history rather than replayed late.
 * Keep one instance on its world so restore rollback retains the old history. */
export function createEnemyEncounters({now=()=>performance.now(),duration=1500}={}){
 const seen=new Set(),pending=[],hold=Number.isFinite(duration)&&duration>0?duration:1500;
 let active=null,lastTime=0;
 const clock=()=>{let value;try{value=now();}catch{}if(Number.isFinite(value))lastTime=Math.max(lastTime,value);return lastTime;};
 const copy=()=>active?{...active}:null;
 const advance=at=>{
  if(active&&at>=active.until)active=null;
  if(!active&&pending.length){active={typeId:pending.shift(),until:at+hold};return copy();}
  return null;
 };
 const clear=()=>{active=null;pending.length=0;};
 const geometry=b=>b&&[b.minX,b.minY,b.maxX,b.maxY].every(Number.isFinite)&&b.minX<=b.maxX&&b.minY<=b.maxY;
 const realEnemy=(e,b)=>e?.alive===true&&e.owner===11&&typeof e.typeId==='string'&&e.typeId.trim().length>0&&e.x>=b.minX&&e.x<=b.maxX&&e.y>=b.minY&&e.y<=b.maxY;
 return {
  observe({entities,bounds,suppressed=false}={}){
   const at=clock();if(suppressed)clear();
   if(!geometry(bounds))return null;
   let started=suppressed?null:advance(at);
   for(const entity of entities?.[Symbol.iterator]?entities:[]){
    if(!realEnemy(entity,bounds)||seen.has(entity.typeId))continue;
    seen.add(entity.typeId);if(suppressed)continue;
    if(!active){active={typeId:entity.typeId,until:at+hold};started=copy();}
    else if(pending.length<3)pending.push(entity.typeId);
   }
   return started;
  },
  snapshot(){advance(clock());return copy();},
  clear
 };
}

// First-view helper group; previous module URLs re-export the same functions.
/** Read-only prose derived from the tested map's w3q/w3u descriptions.
 * No command, affordability, research level, RNG, clock, DOM or save access.
 * Full original values and input hashes: artifacts/g-first-run/g3-source.json.
 * Tooltip percentages are not an executable probability table. */
const entries=[
 ['R000','보석 질 향상','다음 보석이 더 좋은 등급으로 나올 확률을 높여요.',
  ['war3map.w3q:R000.gnam','war3map.w3q:R000.gub1'],'long-tooltip',''],
 ['R001','찬스 확률 향상','최상급 보석 찬스와 슬레이트 찬스의 성공 확률을 높여요.',
  ['war3map.w3q:R001.gnam','war3map.w3q:R001.gub1'],'long-tooltip',''],
 ['R002','천국의 보석 어빌리티','추가 킬수를 얻을 확률을 높여요.',
  ['war3map.w3q:R002.gnam','war3map.w3q:R002.gub1'],'long-tooltip',''],
 ['h042','슬레이트 찬스','다음 라운드의 다섯 보석에서 슬레이트가 나올 기회를 사요.',
  ['war3map.w3u:h042.unam','war3map.w3u:h042.utub'],'long-tooltip',''],
 ['h03Q','최상급 보석 찬스','다음 라운드의 다섯 보석에서 최상급 보석이 나올 기회를 사요.',
  ['war3map.w3u:h03Q.unam','war3map.w3u:h03Q.utub'],'long-tooltip',''],
 ['h01W','광산 수명 구입','광산의 남은 생명을 늘려요. 최대 100까지 살 수 있어요.',
  ['war3map.w3u:h01W.unam','war3map.w3u:h01W.utub'],'long-tooltip',''],
 ['h044','코인 투입','코인을 넣어 빠칭코를 한 번 돌려요.',
  ['war3map.w3u:h044.unam','war3map.w3u:h044.utub'],'long-tooltip',''],
 // The long description is empty. The original short tooltip says “나간다”.
 ['h046','나가기','이용 중인 기계에서 나와요.',
  ['war3map.w3u:h046.unam','war3map.w3u:h046.utip'],'short-tooltip-only',''],
 // A greeting gives no effect or rule to explain; do not invent one.
 ['h049','시작','',
  ['war3map.w3u:h049.unam','war3map.w3u:h049.utub','war3map.w3u:h049.utip'],
  'meaning-unresolved','원작 설명이 “행운을 빕니다!”뿐이라 효과를 확인할 수 없어요.'],
];

export const SOURCE_BUTTON_HELP_METADATA=Object.freeze(Object.fromEntries(entries.map(
 ([id,originalName,help,sourceFields,sourceStatus,emptyReason])=>[id,Object.freeze({
  originalName,help,sourceFields:Object.freeze([...sourceFields]),sourceStatus,emptyReason,
 })],
)));

/** Unknown IDs and an unexplained original description deliberately stay blank. */
export function sourceButtonHelp(id){
 return typeof id==='string'&&Object.hasOwn(SOURCE_BUTTON_HELP_METADATA,id)
  ?SOURCE_BUTTON_HELP_METADATA[id].help:'';
}

// First-view helper group; previous module URLs re-export the same functions.
/** Presentation only. Prices, levels and permission come from the existing research controls. */
export function researchShortcutModel(rows=[],{ready=false,own=false}={}){
 if(!ready||!own)return null;
 const grade=rows.find(row=>row.techId==='R000');if(!grade)return null;
 const row=grade.level<grade.maxLevel?grade:rows.find(row=>row.techId==='R001');
 if(!row||![row.level,row.maxLevel,row.cost].every(Number.isFinite))return null;
 const complete=row.level>=row.maxLevel,name=row.techId==='R000'?'보석 등급 올리기':'찬스 확률 올리기';
 return {...row,label:complete?name+' · 연구 완료':`${name} · ${row.cost}골드 (${row.level}/${row.maxLevel})`,explanation:row.techId==='R000'?'다음 보석이 더 높은 등급으로 나올 수 있어요':'최상급 보석 찬스와 슬레이트 찬스의 성공 확률을 높여요'};
}
export function createResearchAffordance(){
 let run=null;const seen=new Set();return {observe(id,model,suppressed=false){
  if(id!==run){run=id;seen.clear();}if(!model||model.disabled)return false;
  if(seen.has(model.techId))return false;seen.add(model.techId);return !suppressed;
 }};
}
export function mountResearchShortcut(doc,{purchase=()=>false,reducedMotion=()=>false}={}){
 const host=doc.getElementById('bottomPanel'),tray=doc.getElementById('roundTray');
 const section=doc.createElement('section'),button=doc.createElement('button'),info=doc.createElement('button'),detail=doc.createElement('p');
 section.id='researchShortcut';section.className='research-shortcut';section.hidden=true;section.setAttribute('aria-label','보석 등급 연구');
 button.id='quickResearch';button.type='button';info.id='quickResearchInfo';info.type='button';info.className='sec';info.textContent='ⓘ';info.setAttribute('aria-label','연구 효과 보기');info.setAttribute('aria-expanded','false');info.setAttribute('aria-controls','quickResearchDetail');
 detail.id='quickResearchDetail';detail.hidden=true;detail.className='research-shortcut-detail';button.setAttribute('aria-describedby',detail.id);section.append(button,info,detail);host.insertBefore(section,tray);
 const cue=createResearchAffordance();let latest=null,signature='';button.onclick=()=>{if(latest&&!button.disabled)purchase(latest.techId);};
 info.onclick=()=>{detail.hidden=!detail.hidden;info.setAttribute('aria-expanded',String(!detail.hidden));};
 return {render(model,{runId=null,suppressed=false}={}){
  latest=model;section.hidden=!model;if(!model)return;
  const key=JSON.stringify(model);if(key!==signature){signature=key;button.textContent=model.label;button.disabled=Boolean(model.disabled);button.dataset.techId=model.techId;button.title=model.reason||'';detail.textContent=model.explanation+' · '+model.level+'/'+model.maxLevel+'단계';}
  if(cue.observe(runId,model,suppressed)&&!reducedMotion())try{button.animate?.([{filter:'brightness(1)'},{filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:650,iterations:1});}catch{}
 }};
}

/** Small adjacent guide; existing game controls remain active throughout. */
export function mountFirstRunGuide(doc,{skip=()=>{},next=()=>{}}={}){
 const host=doc.getElementById('bottomPanel'),section=doc.createElement('section'),head=doc.createElement('div'),progress=doc.createElement('strong'),text=doc.createElement('p'),nextButton=doc.createElement('button'),skipButton=doc.createElement('button');
 section.id='firstRunGuide';section.className='first-run-guide';section.hidden=true;section.setAttribute('aria-label','첫 판 안내');head.className='first-run-guide-head';progress.id='tutorialProgress';text.id='tutorialText';text.setAttribute('role','status');
 nextButton.id='tutorialNext';nextButton.type='button';nextButton.className='sec';nextButton.textContent='다음';nextButton.onclick=next;skipButton.id='tutorialSkip';skipButton.type='button';skipButton.className='sec';skipButton.textContent='건너뛰기';skipButton.onclick=skip;head.append(progress,nextButton,skipButton);section.append(head,text);host.insertBefore(section,host.firstElementChild);
 let target=null;return {render(model){
  section.hidden=!model;let desired=null;
  if(model){progress.textContent='안내 '+model.step+'/4';text.textContent=model.text;nextButton.hidden=!model.manual;nextButton.textContent=model.step===4?'닫기':'다음';desired=doc.querySelector(({build:'.build-cell:not(:disabled)',hand:'.round-slots',life:'#hudLife',research:'#quickResearch'})[model.anchor]);if(desired?.getClientRects&&!desired.getClientRects().length)desired=null;section.dataset.step=String(model.step);}
  if(target!==desired){target?.classList.remove('tutorial-target');desired?.classList.add('tutorial-target');target=desired;}
 }};
}
