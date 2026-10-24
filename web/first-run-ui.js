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
