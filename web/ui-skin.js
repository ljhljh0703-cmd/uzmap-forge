/** Gem-selection screen skin. View-only: no Sim/VM imports, no source commands.
 * Root supplies original I[1..5] presentation and existing selection/drawing callbacks.
 * Walnut/brass raster material comes from recorded ChatGPT assets, never CSS art.
 */
export function qualityFrameForName(name='') {
 const plain=String(name).replace(/\|c[\da-f]{8}|\|r/gi,'');
 if(/^(?:퍼펙트|완벽한|최상급)\s/.test(plain))return 4;
 if(/^상급\s/.test(plain))return 3;if(/^중급\s/.test(plain))return 2;if(/^하급\s/.test(plain))return 1;return 0;
}
export function roundSlotModels(snapshot={}) {
 const bySlot=new Map((snapshot.candidates??[]).filter(Boolean).map(item=>[item.slot,item]));
 const count=Math.max(0,Math.min(5,Number(snapshot.buildCount)||0));
 return Array.from({length:5},(_,index)=>{
  const slot=index+1,item=slot<=count?bySlot.get(slot):null;
  return item?.alive?{...item,slot,frame:qualityFrameForName(item.name),selected:item.id===snapshot.selectedId}:{slot,id:null,name:'아직 놓지 않은 보석',frame:0,selected:false};
 });
}
export function createNoticeState(duration=1800){
 let last={text:'',count:0,until:0};
 return {push(text,now){last={text,count:last.text===text&&now<last.until?last.count+1:1,until:now+duration};return {...last};}};
}
const CASINO_REASON_TEXT={
 locked:'보석 질 연구를 완료하면 입장할 수 있어요',
 'no-gambler':'타짜를 확인할 수 없습니다',paused:'나가기 후 다른 기계를 선택하세요',
 busy:'다른 사용자가 이용 중입니다',moving:'이 기계로 이동 중입니다',
 'game-over':'게임이 종료되었습니다','invalid-order':'지금은 이동을 요청할 수 없습니다',
 'not-owner':'타짜를 조종할 수 없습니다',immobile:'타짜가 이동할 수 없는 상태입니다'
};
/** Presentation of source observations only. No VM, path, ownership, price or payout logic. */
export function casinoViewModel(casino){
 if(!casino||typeof casino!=='object')return {visible:false,hint:'',rows:[]};
 const unlocked=casino.unlocked===true,gamblerReady=Number.isSafeInteger(casino.gamblerId)&&casino.gamblerId>0,paused=casino.paused===true;
 const rows=(casino.stations??[]).map(station=>{
  const reason=station.reason??null,idReady=Number.isSafeInteger(station.id)&&station.id>0;
  let state=!unlocked||reason==='locked'?'locked':!gamblerReady||reason==='no-gambler'?'no-gambler':station.owned?'owned':station.busy||reason==='busy'?'busy':paused||reason==='paused'?'paused':reason==='moving'?'moving':!idReady||!station.canApproach||reason?'blocked':'available';
  const viaEntrance=station.viaEntrance===true;
  const status=state==='available'&&viaEntrance?'입구 경유 필요':({locked:'잠김','no-gambler':'타짜 확인 필요',owned:'입장 완료',busy:'다른 사용자 이용 중',paused:'퇴장 필요',moving:'이동 중',blocked:'입장 불가',available:'입장 가능'})[state];
  return {id:station.id,index:station.index,title:String(station.title??'기계 정보 확인 필요'),state,status:status+(station.spinning===true?' · 추첨 중':''),spinning:station.spinning===true,viaEntrance,
   buttonText:state==='available'&&viaEntrance?'입구로 이동':state==='owned'?'입장 완료':state==='moving'?'이동 중':state==='busy'?'사용 중':state==='paused'?'퇴장 필요':'입장',
   disabled:state!=='available',reason,reasonText:CASINO_REASON_TEXT[reason]??(state==='locked'?CASINO_REASON_TEXT.locked:state==='no-gambler'?CASINO_REASON_TEXT['no-gambler']:state==='paused'?CASINO_REASON_TEXT.paused:state==='busy'?CASINO_REASON_TEXT.busy:state==='blocked'?'지금은 입장할 수 없습니다':'')};
 });
 const hint=!unlocked?CASINO_REASON_TEXT.locked:!gamblerReady?CASINO_REASON_TEXT['no-gambler']:rows.some(row=>row.state==='owned'&&row.spinning)?'추첨 중입니다 · 완료 후 코인을 넣거나 나갈 수 있어요':paused?'다른 기계로 이동하려면 먼저 ‘나가기’를 누르세요':rows.some(row=>row.state==='available'&&row.viaEntrance)?'입구로 이동한 뒤 입장을 누르세요':rows.some(row=>row.state==='moving')?'타짜가 이동 중입니다 · 다른 기계로 목적지를 바꿀 수 있어요':'기계를 고르면 타짜가 입장하러 이동합니다';
 return {visible:true,hint,rows};
}
/** Returns callback-dispatched, not source admission success. Never mutates the snapshot. */
export function dispatchCasinoApproach(view,id,approach){
 const row=view?.visible&&view.rows.find(row=>row.id===id&&!row.disabled);
 if(!row||typeof approach!=='function')return false;approach(row.id);return true;
}
const QUALITY_MATERIALS=['slot-grey','slot-green','slot-blue','slot-purple','slot-gold'];
export function qualityMaterialForFrame(frame){return QUALITY_MATERIALS[frame]??QUALITY_MATERIALS[0];}
const NEGATIVE_BUTTONS=new Set(['cancelPoint','castA008','castA02G','reset','gemDeselect','drawerClose','cancelGemTarget','cancelRestore']);
export function approvedButtonMaterial({id='',primary=false,action=false,disabled=false,pressed=false}={}){
 const color=primary?'gold':NEGATIVE_BUTTONS.has(id)?'red':action||id.startsWith('cast')?'green':null;
 return color?`button-${color}-${disabled?'disabled':pressed?'pressed':'normal'}`:null;
}
const QUALITY_COLORS=['#ada99c','#46a250','#368ac6','#a66ec7','#e6bb46'];
const materialImages=new Map();
function imageAt(src){if(!materialImages.has(src)){const image=new Image();image.src=new URL(src,import.meta.url).href;materialImages.set(src,image);}return materialImages.get(src);}
// Atlas rectangles describe source rasters. Cropping is ordinary runtime sprite rendering;
// original files, including their transparent padding, remain byte-for-byte intact.
const MATERIALS={};
const preparedRasters=new Map();
function preparedRaster(spec){
 if(!spec)return null;const im=imageAt(spec.file);if(!im.complete||!im.naturalWidth)return null;
 const step=spec.sourceStep??4,key=spec.file+':'+step;if(preparedRasters.has(key))return preparedRasters.get(key);
 // Keep approved source PNG bytes intact. Transparent padding makes the working
 // raster divisible by the integer step, so nearest downsampling is exactly 1/N.
 const padded=document.createElement('canvas');padded.width=Math.ceil(im.naturalWidth/step)*step;padded.height=Math.ceil(im.naturalHeight/step)*step;
 const p=padded.getContext('2d');p.imageSmoothingEnabled=false;p.drawImage(im,0,0);
 const image=document.createElement('canvas');image.width=padded.width/step;image.height=padded.height/step;
 const c=image.getContext('2d');c.imageSmoothingEnabled=false;c.drawImage(padded,0,0,padded.width,padded.height,0,0,image.width,image.height);
 const result={image,insets:(spec.sourceInsets??[0,0,0,0]).map(n=>Math.ceil(n/step))};preparedRasters.set(key,result);return result;
}
let materialMetaPromise;
function materialsReady(){
 if(!materialMetaPromise)materialMetaPromise=fetch(new URL('./assets/ui/materials.json',import.meta.url)).then(r=>r.ok?r.json():{}).then(meta=>{Object.assign(MATERIALS,meta);});
 return materialMetaPromise;
}
function rasterNineSlice(ctx,spec,width,height){
 const prepared=preparedRaster(spec);if(!prepared)return false;
 const im=prepared.image,[left,top,right,bottom]=prepared.insets,w=im.width,h=im.height;
 const d=Math.max(1,Math.min(left,top,right,bottom,Math.floor(width/3),Math.floor(height/3)));
 const sx=[0,left,w-right],sy=[0,top,h-bottom],sw=[left,w-left-right,right],sh=[top,h-top-bottom,bottom];
 const dx=[0,d,width-d],dy=[0,d,height-d],dw=[d,width-2*d,d],dh=[d,height-2*d,d];
 ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=false;
 for(let row=0;row<3;row++)for(let col=0;col<3;col++)ctx.drawImage(im,sx[col],sy[row],sw[col],sh[row],dx[col],dy[row],dw[col],dh[row]);
 return true;
}
export function mountGemSkin({document:doc,drawGem,selectUnit,armTarget,cancelTarget,approachCasino}){
 const app=doc.getElementById('gameApp');if(!app)return {render(){},notify(){}};
 const notices=createNoticeState();const panels=new Map(),buttonPaints=new WeakMap(),buttonImages=new Map(),icons=[];let latest=null,signature='';
 const tray=doc.createElement('section');tray.id='roundTray';tray.setAttribute('aria-label','이번 라운드 보석 다섯 개');
 const heading=doc.createElement('div');heading.className='round-heading';
 const title=doc.createElement('b');title.textContent='이번 보석';const state=doc.createElement('span');state.id='roundSlotStatus';heading.append(title,state);
 const slots=doc.createElement('div');slots.className='round-slots';tray.append(heading,slots);
 const bottom=doc.getElementById('bottomPanel'),roster=bottom.querySelector('.roster-bar');bottom.prepend(tray);
 const explorer=doc.createElement('details');explorer.id='ownedExplorer';const summary=doc.createElement('summary');summary.textContent='보유 보석';explorer.append(summary);doc.querySelector('.header-actions').prepend(explorer);explorer.append(roster);
 roster.addEventListener('click',event=>{if(event.target.closest('button[data-unit-id]'))explorer.open=false;});
 doc.addEventListener('pointerdown',event=>{if(explorer.open&&!explorer.contains(event.target))explorer.open=false;});
 const buttons=Array.from({length:5},(_,index)=>{
  const button=doc.createElement('button');button.type='button';button.className='round-slot';button.dataset.slot=String(index+1);button.setAttribute('aria-pressed','false');
  const frame=doc.createElement('canvas');frame.className='slot-material';frame.setAttribute('aria-hidden','true');const art=doc.createElement('canvas');art.className='slot-gem';art.width=64;art.height=64;art.setAttribute('aria-hidden','true');
  const number=doc.createElement('span');number.className='slot-number';number.textContent=String(index+1);button.append(frame,art,number);slots.append(button);
  button.addEventListener('click',()=>{const id=Number(button.dataset.unitId);if(Number.isSafeInteger(id)&&id>0)selectUnit(id);});return button;
 });
 const targetPanel=doc.createElement('section');targetPanel.id='gemTargetAbilities';targetPanel.hidden=true;targetPanel.setAttribute('aria-label','보조 능력');
 const targetControls=doc.createElement('div');targetControls.className='target-ability-controls';
 const targetButton=doc.createElement('button');targetButton.type='button';targetButton.id='castA05L';targetButton.className='sec';targetButton.setAttribute('aria-pressed','false');
 const cancelButton=doc.createElement('button');cancelButton.type='button';cancelButton.id='cancelGemTarget';cancelButton.className='sec';cancelButton.textContent='교환 취소';cancelButton.hidden=true;
 const targetHint=doc.createElement('p');targetHint.id='gemTargetHint';targetHint.setAttribute('role','status');targetControls.append(targetButton,cancelButton);targetPanel.append(targetControls,targetHint);doc.getElementById('gemUpgrades').before(targetPanel);
 targetButton.addEventListener('click',()=>armTarget?.('A05L'));cancelButton.addEventListener('click',()=>cancelTarget?.());
 const casinoPanel=doc.createElement('section');casinoPanel.id='casinoPanel';casinoPanel.hidden=true;casinoPanel.setAttribute('aria-labelledby','casinoHeading');
 const casinoHeading=doc.createElement('h2');casinoHeading.id='casinoHeading';casinoHeading.textContent='빠칭코 입장';
 const casinoHint=doc.createElement('p');casinoHint.id='casinoHint';casinoHint.setAttribute('role','status');
 const casinoList=doc.createElement('ul');casinoList.id='casinoStationList';
 const casinoHelp=doc.createElement('p');casinoHelp.className='casino-help';casinoHelp.textContent='입장 후 위쪽 구입 목록에서 코인 투입과 나가기를 사용할 수 있어요.';
 casinoPanel.append(casinoHeading,casinoHint,casinoList,casinoHelp);doc.getElementById('rsR002Btn').closest('.research').after(casinoPanel);
 const training=doc.getElementById('trainingOptions'),trainingIntro=training.previousElementSibling;
 training.setAttribute('aria-label','구입 · 시설 이용');if(trainingIntro?.tagName==='P'){trainingIntro.textContent='수명 구입과 입장한 시설의 이용 버튼입니다.';if(trainingIntro.previousElementSibling?.tagName==='H2')trainingIntro.previousElementSibling.textContent='광산 · 시설 이용';}
 let casinoView=casinoViewModel(),casinoSignature='';const casinoRows=new Map();
 function renderCasino(snapshot){
  casinoView=casinoViewModel(snapshot);const key=JSON.stringify(casinoView);if(casinoSignature===key)return;casinoSignature=key;casinoPanel.hidden=!casinoView.visible;if(!casinoView.visible)return;casinoHint.textContent=casinoView.hint;
  const keep=new Set();for(const model of casinoView.rows){
   const key=String(model.index)+':'+String(model.id);keep.add(key);let row=casinoRows.get(key);
   if(!row){
    const element=doc.createElement('li');element.className='casino-station';element.dataset.casinoIndex=String(model.index);
    const info=doc.createElement('div'),title=doc.createElement('b'),status=doc.createElement('span');title.className='casino-station-title';status.className='casino-station-status';info.append(title,status);
    const button=doc.createElement('button');button.type='button';button.className='sec training-option casino-approach';button.dataset.casinoId=String(model.id);
    button.addEventListener('click',()=>dispatchCasinoApproach(casinoView,model.id,approachCasino));element.append(info,button);casinoList.append(element);row={element,title,status,button};casinoRows.set(key,row);
   }
   row.title.textContent=model.title;row.status.textContent=model.status;row.element.dataset.state=model.state;row.element.dataset.spinning=String(model.spinning);
   row.button.disabled=model.disabled||typeof approachCasino!=='function';row.button.textContent=model.buttonText;row.button.title=model.reasonText||'타짜가 이 기계로 이동해 입장합니다';row.button.setAttribute('aria-label',`${row.title.textContent} · ${model.buttonText}`);row.button.dataset.reason=model.reason??'';
  }
  for(const[key,row]of casinoRows)if(!keep.has(key)){row.element.remove();casinoRows.delete(key);}
 }
 const selectedPortrait=doc.createElement('canvas');selectedPortrait.id='selectedGemPortrait';selectedPortrait.width=64;selectedPortrait.height=64;selectedPortrait.setAttribute('aria-hidden','true');doc.querySelector('.bp-info').prepend(selectedPortrait);
 function framePanel(element,kind='panel',corner=12){
  if(!element||panels.has(element))return;const canvas=doc.createElement('canvas');canvas.className='skin-material';canvas.setAttribute('aria-hidden','true');element.classList.add('skin-framed');element.prepend(canvas);panels.set(element,{canvas,kind,corner,w:0,h:0});
 }
 framePanel(roster,'panel',12);framePanel(doc.querySelector('.statusbar'),'hud',12);framePanel(tray,'tray',12);framePanel(doc.getElementById('gemPanel'),'panel',12);framePanel(doc.querySelector('footer'),'hud',8);
 for(const e of doc.querySelectorAll('.mode-card,.game-over>div'))framePanel(e,'panel',16);
 framePanel(doc.querySelector('#restoreOverlay>div'),'panel',16);
 function addIcon(host,key,className=''){
  if(!host)return;const canvas=doc.createElement('canvas');canvas.width=32;canvas.height=32;canvas.className='ui-pixel-icon '+className;canvas.setAttribute('aria-hidden','true');canvas.dataset.icon=key;host.prepend(canvas);icons.push({canvas,key});
 }
 for(const [title,key]of [['골드','icon-gold-coin'],['라이프','icon-life-heart']]){const host=doc.querySelector(`.hud-pill[title="${title}"]`);host?.querySelector('svg')?.remove();addIcon(host,key);}
 addIcon(doc.getElementById('objectiveHud'),'icon-wave-flag','ui-wave-icon');
 for(const [index,key]of ['icon-attack-sword','icon-range-crosshair','icon-speed-boot'].entries()){
  const host=doc.querySelectorAll('.gem-stats .stat>span')[index];if(!host)continue;
  const label=doc.createElement('span');label.className='stat-label-text';label.textContent=host.textContent;host.textContent='';host.append(label);addIcon(host,key);
 }
 function paintIcons(){for(const {canvas,key}of icons){const prepared=preparedRaster(MATERIALS[key]);if(!prepared)continue;const c=canvas.getContext('2d');c.clearRect(0,0,32,32);c.imageSmoothingEnabled=false;c.drawImage(prepared.image,Math.floor((32-prepared.image.width)/2),Math.floor((32-prepared.image.height)/2));canvas.dataset.artReady='true';}}
 const notice=doc.getElementById('actionFeedback');
 function paintFrames(){for(const[e,p]of panels){if(!e.getClientRects().length)continue;const w=Math.round(e.clientWidth),h=Math.round(e.clientHeight);if(w<1||h<1)continue;const paintKey=JSON.stringify([w,h,MATERIALS[p.kind]]);if(p.paintedKey===paintKey)continue;if(p.canvas.width!==w||p.canvas.height!==h){p.canvas.width=w;p.canvas.height=h;}const spec=MATERIALS[p.kind];if(rasterNineSlice(p.canvas.getContext('2d'),spec,w,h,p.corner))p.paintedKey=paintKey;}}
 function paintButtons(){
  for(const button of doc.querySelectorAll('button:not(.round-slot):not(.build-cell),#ownedExplorer>summary')){
   if(!button.getClientRects().length)continue;
   const w=Math.round(button.clientWidth),h=Math.round(button.clientHeight);if(w<1||h<1)continue;
   const material=approvedButtonMaterial({id:button.id,primary:button.dataset.primary==='true',action:button.classList.contains('training-option')||button.hasAttribute('data-upgrade-target'),disabled:button.disabled,pressed:button.dataset.skinPressed==='true'});
   const spec=MATERIALS[material??'hud'];if(!spec)continue;
   const key=JSON.stringify([w,h,material??'hud',spec]);if(buttonPaints.get(button)===key)continue;
   if(!buttonImages.has(key)){
    const canvas=doc.createElement('canvas');canvas.width=w;canvas.height=h;
    if(!rasterNineSlice(canvas.getContext('2d'),spec,w,h))continue;buttonImages.set(key,canvas.toDataURL());
   }
   button.style.backgroundImage=`url("${buttonImages.get(key)}")`;button.style.backgroundSize='100% 100%';button.style.backgroundRepeat='no-repeat';button.dataset.skinMaterial=material??'hud';button.dataset.skinSource=spec.file;buttonPaints.set(button,key);
  }
 }
 function setPressed(button,on){if(!button||button.disabled||button.classList.contains('round-slot')||button.classList.contains('build-cell'))return;button.dataset.skinPressed=String(on);paintButtons();}
 const pressed=new Set();
 doc.addEventListener('pointerdown',event=>{const button=event.target.closest('button');if(button){pressed.add(button);setPressed(button,true);}});
 const releasePressed=()=>{for(const button of pressed)setPressed(button,false);pressed.clear();};
 doc.addEventListener('pointerup',releasePressed);doc.addEventListener('pointercancel',releasePressed);doc.defaultView.addEventListener('blur',releasePressed);
 doc.addEventListener('keydown',event=>{if(!event.repeat&&(event.key===' '||event.key==='Enter')&&event.target.matches('button')){pressed.add(event.target);setPressed(event.target,true);}});
 doc.addEventListener('keyup',event=>{if(event.key===' '||event.key==='Enter')releasePressed();});
 function paintSlot(button,item){
  const frame=button.querySelector('.slot-material'),art=button.querySelector('.slot-gem'),w=Math.round(button.clientWidth),h=Math.round(button.clientHeight);
  if(frame.width!==w||frame.height!==h){frame.width=w;frame.height=h;}
  const ctx=frame.getContext('2d');const key=qualityMaterialForFrame(item.frame);rasterNineSlice(ctx,MATERIALS[key],w,h);button.dataset.qualityMaterial=key;
  const a=art.getContext('2d');a.clearRect(0,0,64,64);a.imageSmoothingEnabled=false;
  const painted=!item.id||drawGem(a,item,32,34,64);button.dataset.artReady=String(Boolean(painted));button.dataset.empty=String(!item.id);
 }
 function render(snapshot){
  renderCasino(snapshot.casino);
  const models=roundSlotModels(snapshot);
  tray.dataset.committed=String(snapshot.chosen===true);
  tray.hidden=snapshot.chosen===true&&models.every(item=>item.id===null);
  const gap=parseInt(doc.defaultView.getComputedStyle(slots).columnGap,10)||8,max=doc.defaultView.innerWidth>=1000?80:72,available=slots.clientWidth;
  const cell=Math.max(44,Math.min(max,Math.floor((available-gap*4)/5)));
  slots.style.gridTemplateColumns=`repeat(5, ${cell}px)`;slots.style.justifyContent='start';slots.style.paddingLeft=Math.max(0,Math.floor((available-cell*5-gap*4)/2))+'px';
  summary.textContent='보유 '+doc.getElementById('rosterCount').textContent;
  latest=snapshot;const key=JSON.stringify([models,snapshot.round,snapshot.buildCount,snapshot.chosen,snapshot.selectedId,snapshot.selectedGem]);
  state.textContent=snapshot.chosen?'보석을 남겼습니다':`${Math.min(5,snapshot.buildCount??0)} / 5`;
  title.textContent=snapshot.chosen?'이번 선택':'이번 보석';
  if(signature!==key||selectedPortrait.dataset.artReady==='false'||(!tray.hidden&&buttons.some(b=>b.dataset.artReady==='false'))){signature=key;for(let i=0;i<5;i++){const item=models[i],button=buttons[i];button.dataset.unitId=item.id??'';button.disabled=!item.id;button.setAttribute('aria-pressed',String(item.selected));button.setAttribute('aria-label',`보석 ${i+1} · ${item.name}`);button.title=item.name;button.style.setProperty('--quality-color',QUALITY_COLORS[item.frame]);if(!tray.hidden)paintSlot(button,item);}
   const selected=snapshot.selectedGem??models.find(m=>m.selected);const p=selectedPortrait.getContext('2d');p.clearRect(0,0,64,64);selectedPortrait.dataset.unitId=selected?.id??'';selectedPortrait.dataset.artReady=String(!selected||Boolean(drawGem(p,selected,32,34,64)));
  }
  const targeted=snapshot.targetActions?.find(action=>action.abilityId==='A05L'),selecting=Boolean(snapshot.pendingTarget);
  targetPanel.hidden=!targeted?.acquired&&!selecting;
  if(targeted){targetButton.disabled=targeted.disabled;targetButton.textContent=selecting?'교환 대상 선택 중':targeted.label;targetButton.title=targeted.description;targetButton.setAttribute('aria-pressed',String(selecting));}
  const targetNote=targeted?.reason==='not-owner'?'보석을 남긴 뒤 전투 중 사용':targeted?.reason==='game-over'?'게임 종료':'';
  const rangeNote=Number.isFinite(targeted?.rangeU)?`시전 사거리 ${targeted.rangeU}`:'';
  cancelButton.hidden=!selecting;targetHint.textContent=(selecting?['교환할 보석을 누르세요 · 보유 목록에서도 선택',rangeNote]:[targeted?.description.split(/\r?\n/)[0],rangeNote,targetNote]).filter(Boolean).join(' · ');
  const keep=doc.getElementById('castA009'),start=doc.getElementById('skip'),play=doc.getElementById('play');
  for(const b of doc.querySelectorAll('button[data-primary]'))delete b.dataset.primary;
  const primary=keep&&!keep.disabled&&keep.getClientRects().length?keep:start&&!start.disabled&&start.getClientRects().length?start:play;
  if(primary&&!primary.disabled)primary.dataset.primary='true';paintFrames();paintButtons();paintIcons();
 }
 function repaint(){signature='';for(const p of panels.values())p.paintedKey='';if(latest)render(latest);else paintFrames();}
 const resizeObserver=new ResizeObserver(repaint);resizeObserver.observe(bottom);resizeObserver.observe(app);
 void materialsReady().then(()=>{for(const spec of Object.values(MATERIALS)){const im=imageAt(spec.file);if(!im.complete)im.addEventListener('load',repaint,{once:true});}repaint();}).catch(error=>{app.dataset.skinError='materials';console.warn('[UI material]',error.message);});
 app.dataset.uiSkin='walnut-brass';app.dataset.uiAssets='claude-approved-23';
 return {render,refresh:repaint,notify(text,now=performance.now()){const message=notices.push(text,now);notice.textContent=message.text+(message.count>1?` ×${message.count}`:'');notice.hidden=false;return message;},destroy(){resizeObserver.disconnect();}};
}
