/** Reuses the existing end-of-game card and native action buttons. */
export function mountResultView(doc,{same=()=>{},today=()=>{},share=async()=>({kind:'manual'})}={}){
 const by=id=>doc.getElementById(id),root=by('gameOver'),card=root?.children?.[0],app=by('gameApp');
 if(!root||!card)return{render(){},records(){}};
 card.classList.add('result-card');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
 const make=(tag,id,text='')=>{const n=doc.createElement(tag);if(id)n.id=id;n.textContent=text;return n;};
 const wave=make('p','goWave'),cause=make('p','goCause'),medal=make('p','goMedal','신기록'),metrics=make('dl','goMetrics'),topTitle=make('h3','','보석별 처치 상위 3'),top=make('ol','goTop'),record=make('p','goRecord'),status=make('p','goShareStatus'),manual=make('input','goShareURL');
 medal.hidden=true;medal.className='result-medal';wave.className='result-wave';status.setAttribute('role','status');manual.type='url';manual.readOnly=true;manual.hidden=true;manual.setAttribute('aria-label','복사할 도전 주소');
 const values=new Map();for(const[key,label]of [['kills','처치'],['gems','남긴 보석'],['highest','최고 등급 보석']]){const cell=make('div'),dt=make('dt','',label),dd=make('dd');cell.append(dt,dd);metrics.append(cell);values.set(key,dd);}
 const actions=make('div','goActions'),retry=by('goRestart'),sameButton=make('button','goSame','같은 판 다시'),shareButton=make('button','goShare','공유');sameButton.type=shareButton.type='button';retry.textContent='다시 하기';actions.append(retry,sameButton,shareButton);
 card.append(wave,cause,medal,metrics,topTitle,top,record,actions,status,manual);
 let current=null,lastKey='',epoch=0;sameButton.addEventListener('click',()=>same(current));
 shareButton.addEventListener('click',async()=>{if(!current||shareButton.disabled)return;shareButton.disabled=true;const generation=epoch;try{const result=await share(current);if(generation!==epoch)return;status.textContent=result.kind==='shared'?'공유했습니다':result.kind==='copied'?'도전 주소를 복사했습니다':result.kind==='cancelled'?'공유를 취소했습니다':'주소를 선택해 복사하세요';manual.hidden=result.kind!=='manual';if(!manual.hidden){manual.value=result.url??'';manual.focus();manual.select();}}catch{status.textContent='공유하지 못했습니다 · 다시 시도하세요';}finally{shareButton.disabled=false;}});
 root.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const buttons=[retry,sameButton,shareButton,...(!manual.hidden?[manual]:[])].filter(n=>!n.disabled);if(event.shiftKey&&doc.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus();}else if(!event.shiftKey&&doc.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus();}});
 const records=make('details','personalRecords'),summary=make('summary','','내 기록'),recordsList=make('div','personalRecordsList'),daily=make('button','startDaily','오늘의 판');daily.type='button';daily.className='sec';daily.addEventListener('click',()=>today());const dailyNote=make('p','','같은 날짜·방식·난이도로 도전해요. 건설 시점과 선택에 따라 보석은 달라질 수 있어요.');dailyNote.className='daily-note';records.append(summary,recordsList,daily,dailyNote);by('menuPanelRun')?.append(records);
 const startDaily=make('button','startupDaily','오늘의 판 · 같은 조건으로 도전');startDaily.type='button';startDaily.className='sec';startDaily.addEventListener('click',()=>today());by('modeSelect')?.querySelector('.mode-card')?.append(startDaily);
 let recordKey='';return{
  render(model){app.dataset.outcome=String(Boolean(model));if(!model){if(current)epoch++;current=null;lastKey='';manual.hidden=true;status.textContent='';return;}if(current?.runId!==model.runId){epoch++;if(!card.contains(doc.activeElement))retry.focus();}current=model;
   const key=JSON.stringify(model);if(key===lastKey)return;lastKey=key;wave.textContent=model.wave+'웨이브';root.dataset.outcome=model.winner===0?'clear':'defeat';
   cause.textContent=model.cause;values.get('kills').textContent=String(model.stats.kills);values.get('gems').textContent=String(model.gems);values.get('highest').textContent=model.highest||'없음';
   top.replaceChildren();for(const row of model.stats.top){const li=make('li'),name=make('span','',row.name),count=make('b','',row.kills+'처치');li.append(name,count);top.append(li);}if(!model.stats.top.length)top.append(make('li','','집계된 보석 처치가 없습니다'));
   if(model.stats.unattributed)top.append(make('li','',`공격자 미확인 ${model.stats.unattributed}처치`));
   medal.hidden=!model.record?.isBest;record.textContent=model.record?.best?`내 최고 ${model.record.best.wave}웨이브 · ${(model.record.best.tick/1200).toFixed(1)}분 · ${model.record.plays}판`:'이 브라우저의 기록을 확인할 수 없습니다';if(model.record?.saved===false)record.textContent+=' · 기록 저장 실패';
  },
  records(rows=[]){const key=JSON.stringify(rows);if(key===recordKey)return;recordKey=key;recordsList.replaceChildren();if(!rows.length)recordsList.append(make('p','','아직 완료한 판이 없습니다'));for(const row of rows){const b=row.best,p=make('p');p.textContent=`${b.mode==='classic'?'클래식':'레이스'} · ${['쉬움','보통','어려움'][b.difficulty-1]}${b.dailyDate?' · '+b.dailyDate:''}: ${b.wave}웨이브 · ${(b.tick/1200).toFixed(1)}분 · ${row.plays}판`;recordsList.append(p);}}
 };
}
