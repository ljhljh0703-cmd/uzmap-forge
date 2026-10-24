/** View-only models. Resolved source facts enter here; no command, VM write or RNG. */
export function desktopFieldLayout(bounds,width,height,padding=20){
 if(width<=900||!bounds||!Number.isFinite(height)||height<=padding*2)return null;
 const bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY;
 if(!(bw>0&&bh>0))return null;
 const ratio=bw/bh,fieldWidth=Math.min(width-360,Math.ceil((height-padding*2)*ratio+padding*2));
 const zoom=Math.min((fieldWidth-padding*2)/bw,(height-padding*2)/bh);
 return {fieldWidth,sidebarWidth:width-fieldWidth,boardWidth:bw*zoom,boardHeight:bh*zoom,gutter:(fieldWidth-bw*zoom)/2};
}
/** Map-specific source functions, parsed by the existing JASS parser. Count actual
 * CreateNUnitsAtLoc arguments, not role/config maxima or unrelated function calls.
 * Missing/changed source is unknown rather than silently becoming ten. */
export function sourceWaveCounts(source,parse){
 const counts=[];
 for(const name of ['mke','MVe','Sd']){
  const body=source.match(new RegExp('function\\s+'+name+'\\s+takes[\\s\\S]*?endfunction'))?.[0];
  if(!body){counts.push(null);continue;}
  try{
   const fn=parse(body).functionIndex.get(name);let count=0,valid=true;
   const walk=node=>{if(!node||typeof node!=='object')return;if((node.kind==='CallStmt'||node.kind==='CallExpr')&&node.name==='CreateNUnitsAtLoc'){
    const arg=node.args[0],type=node.args[1],isWave=type?.kind==='ArrayIndexExpr'&&type.name==='b'||name==='Sd'&&type?.kind==='VarExpr'&&type.name==='te';
    if(isWave){if(arg?.kind==='IntLiteral'&&Number.isSafeInteger(arg.value)&&arg.value>0)count+=arg.value;else valid=false;}
   }for(const value of Object.values(node)){if(Array.isArray(value)){for(const child of value)walk(child);}else if(value&&typeof value==='object')walk(value);}};
   walk(fn);counts.push(valid&&count>0?count:null);
  }catch{counts.push(null);}
 }
 return {race:counts.slice(0,2),classic:counts[2]};
}
export function nextWaveView({state={},total,typeId=null,name='',count=null,def=null,airborne=null}={}){
 const round=Math.max(1,Number(state.round)||1)+(state.chosen?1:0);if(round>total)return null;
 return {round,typeId,name:name||'적 정보 확인 중',count:Number.isSafeInteger(count)&&count>0?count:null,life:Number.isFinite(def?.pointValue)&&def.pointValue>=0?def.pointValue:null,motion:airborne===true?'공중':airborne===false?'지상':'확인 중'};
}
/** Compact rendering of the same source facts used by the PC card. */
export function formatNextWaveLine(model){
 if(!model)return '';
 return ['다음 '+model.round+'웨이브',model.name,model.count===null?'마리 수 확인 중':model.count+'마리',model.motion,model.band==='boss'?'보스':'',model.life===null?'도착 피해 확인 중':'1마리 도착 = 생명 '+model.life+' 감소'].filter(Boolean).join(' · ');
}
export function mountNextWave(doc,draw){
 const phone=doc.createElement('p');phone.id='phoneWavePreview';phone.className='phone-wave-preview';phone.hidden=true;doc.querySelector('.phasebar')?.prepend(phone);
 const host=doc.getElementById('bottomPanel'),section=doc.createElement('section'),title=doc.createElement('h2'),art=doc.createElement('canvas'),name=doc.createElement('strong'),facts=doc.createElement('p'),risk=doc.createElement('p');
 section.id='nextWavePreview';section.className='next-wave-preview';section.setAttribute('aria-label','다음 웨이브');art.width=64;art.height=64;art.setAttribute('aria-hidden','true');const text=doc.createElement('div');text.append(title,name,facts,risk);section.append(art,text);host.insertBefore(section,doc.getElementById('gemNone'));let signature='';
 return {render(model,{visible=true}={}){
  phone.hidden=!model||!visible;const line=formatNextWaveLine(model);if(phone.textContent!==line)phone.textContent=line;
  const key=JSON.stringify([model,Boolean(draw?.ready?.())]);if(key===signature)return;signature=key;
  title.textContent=model?'다음 웨이브 · '+model.round:'마지막 웨이브';name.textContent=model?.name??'마지막 적을 막아 주세요';facts.textContent=model?[model.motion,model.count===null?'마리 수 확인 중':model.count+'마리'].join(' · '):'';
  risk.textContent=model?model.life===null?'광산 도착 피해 확인 중':'광산 도착 시 한 마리마다 생명 '+model.life+' 감소':'';
  let ctx;try{ctx=art.getContext('2d');ctx?.clearRect(0,0,64,64);}catch{}art.hidden=!model?.typeId||!ctx||!draw?.(ctx,model,32,32,56);
 }};
}

/** Same automatic acquisition radius consumed by combatStep.weaponFor. Forced
 * source orders use the weapon's own range, never the acquisition cap. */
export function attackRangeModels(entity,def,{forced=false}={}){
 const models=[];
 for(const [index,attack] of [def?.attack,def?.secondaryAttack].entries()){
  if(!attack)continue;
  const radiusU=forced?attack.rangeU:Math.min(attack.rangeU,entity?.acquireRangeU??attack.acquireU),targetsMask=attack.targetsMask&3;
  if(Number.isFinite(radiusU)&&radiusU>=0&&targetsMask)models.push({radiusU,targetsMask,weaponSlot:index+1,mode:forced?'ordered':'auto'});
 }
 return models;
}
/** Under-unit paint, projected by the same camera as picking. Target masks keep
 * separate weapon circles; B4 silhouettes are reused, with a text fallback. */
export function drawAttackRanges(ctx,{models=[],x,y,zoom,sprites}={}){
 if(![x,y,zoom].every(Number.isFinite)||zoom<=0)return 0;let count=0;
 for(const model of [...models].sort((a,b)=>b.radiusU-a.radiusU)){
  if(!(model.radiusU>0))continue;const radius=model.radiusU*zoom;
  ctx.save();ctx.fillStyle=model.targetsMask===1?'rgba(218,189,118,.06)':'rgba(62,147,186,.06)';ctx.strokeStyle=model.targetsMask===1?'rgba(218,189,118,.8)':'rgba(92,194,231,.8)';ctx.lineWidth=1.5;ctx.setLineDash(model.mode==='ordered'?[5,3]:[]);ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
  const kinds=[model.targetsMask&1?'ground':null,model.targetsMask&2?'air':null].filter(Boolean),left=x+radius*.707,yEdge=y-radius*.707;
  for(const [index,kind]of kinds.entries()){
   const px=left+index*18;let painted=false;try{painted=Boolean(sprites?.draw?.(ctx,'effect:'+kind,px,yEdge,16,{tick:0,shadow:false}));}catch{}
   if(!painted){ctx.fillStyle='#f3e5ba';ctx.font='11px system-ui';ctx.fillText?.(kind==='ground'?'땅':'공중',px-7,yEdge);}
  }
  if(model.mode==='effect'){ctx.fillStyle='#f3e5ba';ctx.font='11px system-ui';ctx.fillText?.('화염 범위',left-20,yEdge-12);}
  ctx.restore();count++;
 }
 return count;
}

/** Final source order, not a new geometric path-progress estimate. */
export function isExitThreat(entity,{bounds,exit}={}){
 return Boolean(entity?.alive&&entity.owner===11&&entity.orderActive===1&&bounds&&exit&&entity.x>=bounds.minX&&entity.x<=bounds.maxX&&entity.y>=bounds.minY&&entity.y<=bounds.maxY&&entity.orderX===exit.x&&entity.orderY===exit.y);
}
export function creepStatusIcons(statusMap,auraSlow=false){
 const active=new Set();
 for(const [key,effect]of statusMap?.entries?.()??[]){
  if(!(effect.remainingTicks>0))continue;
  if(effect.kind==='dot'){
   if(key==='dot'||String(key).startsWith('venom:'))active.add('poison');
   else if(String(key).startsWith('liquid:')||String(key).startsWith('burn:'))active.add('fire');
  }
  if(effect.kind==='slow'&&(key==='slow'||key==='frost'))active.add('slow');
  if(effect.kind==='stun'&&key==='stun')active.add('stun');
 }
 if(auraSlow)active.add('slow');return ['poison','fire','slow','stun'].filter(kind=>active.has(kind));
}
export function hasEnemySlowAura(entity,def,sources,areAllied=()=>false){
 const mask=def?.movementType==='fly'?2:1;
 return sources.some(({entity:source,effect})=>source.alive&&source.owner!==entity.owner&&!areAllied(source.owner,entity.owner)&&effect.slowPm>0&&(effect.targetsMask&mask)&&(source.x-entity.x)**2+(source.y-entity.y)**2<=effect.radiusU**2);
}
export function drawCreepStatus(ctx,{sprites,kinds=[],x,y,size}={}){
 if(![x,y,size].every(Number.isFinite)||size<=0)return 0;
 const iconSize=Math.min(12,Math.max(8,Math.round(size/3))),cy=Math.round(y-size*.8-6)-iconSize/2-4;let count=0;
 for(const [index,kind]of kinds.entries()){
  const cx=x+(index-(kinds.length-1)/2)*(iconSize+2);let painted=false;
  try{painted=Boolean(sprites?.draw?.(ctx,'effect:'+kind,cx,cy,iconSize,{tick:0,shadow:false}));}catch{}
  if(painted)count++;else{ctx.save();ctx.font='10px system-ui';ctx.fillStyle='#f3e5ba';ctx.fillText?.(({poison:'독',fire:'불',slow:'느림',stun:'기절'})[kind]??'',cx-iconSize/2,cy);ctx.restore();}
 }
 return count;
}
export function drawExitThreat(ctx,{x,y,size}={}){
 if(![x,y,size].every(Number.isFinite)||size<=0)return false;
 ctx.save();ctx.strokeStyle='#f46b57';ctx.lineWidth=2.5;ctx.setLineDash([]);ctx.strokeRect(x-size*.55,y-size*.55,size*1.1,size*1.1);ctx.font='bold 17px system-ui';ctx.textAlign='center';ctx.strokeStyle='#241510';ctx.lineWidth=3;ctx.strokeText?.('!',x+size*.65,y-size*.35);ctx.fillStyle='#ffe2be';ctx.fillText('!',x+size*.65,y-size*.35);ctx.restore();return true;
}
/** Uses the existing feedback queue for timing/dedup; an independent view canvas
 * reaches the HUD without widening the battlefield clip or its picking surface. */
export function mountHudLifeCue({document:doc,sprites,feedback,now=()=>performance.now(),reducedMotion=()=>false}={}){
 const app=doc.getElementById('gameApp'),canvas=doc.createElement('canvas');canvas.id='lifeLossOverlay';canvas.className='life-loss-overlay';canvas.setAttribute('aria-hidden','true');app.append(canvas);const ctx=canvas.getContext('2d');
 return {emit({key}={}){return feedback.emit({kind:'life',key,x:0,y:0,space:'screen'});},clear(){feedback.clear();ctx?.clearRect(0,0,canvas.width,canvas.height);},draw(){
  if(!ctx)return;const width=app.clientWidth,height=app.clientHeight;if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;ctx.clearRect(0,0,width,height);
  if(doc.hidden)return;
  const root=app.getBoundingClientRect(),target=doc.getElementById('hudLife')?.getBoundingClientRect(),exit=doc.getElementById('exitMarker');if(!target||!exit||exit.hidden)return;const from=exit.getBoundingClientRect(),tx=target.left+target.width/2-root.left,ty=target.top+target.height/2-root.top,sx=Math.max(9,Math.min(width-9,from.left+from.width/2-root.left)),sy=from.top+from.height/2-root.top;
  for(const item of feedback.snapshot().active){
   const t=Math.max(0,Math.min(1,(now()-item.at)/((item.until-item.at)*.85))),still=Boolean(reducedMotion());
   const x=still?tx:t<.65?sx:sx+(tx-sx)*(t-.65)/.35,y=still?ty:t<.65?sy+(ty-sy)*t/.65:ty;
   ctx.save();if(!still)ctx.globalAlpha=1-t*.4;try{sprites.draw(ctx,'feedback:life',x,y,18,{tick:0,shadow:false});}catch{}ctx.restore();
  }
 }};
}
