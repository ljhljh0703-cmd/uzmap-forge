/** Read-only presentation of resolved source effects. This module has no world,
 * VM, command, clock scheduling, selection or save-state access. */
const LABELS=Object.freeze({poison:'독',fire:'화염',slow:'감속',stun:'기절',critical:'치명타',splash:'범위 공격',air:'공중 공격',ground:'지상 공격'});
const positive=value=>Number.isFinite(value)&&value>0;
const eligible=effect=>effect&&typeof effect==='object'&&(effect.targetsMask===undefined||Boolean(effect.targetsMask&3));

export function effectIconModels(effects=[],def=null){
 const kinds=new Set();
 for(const e of Array.isArray(effects)?effects:[]){
  if(!eligible(e))continue;
  if((e.kind==='venom'||e.kind==='poison')&&positive(e.damagePerSecondPm)&&positive(e.durationTicks))kinds.add('poison');
  if(e.kind==='liquidFire'&&positive(e.damagePerSecondPm)&&positive(e.durationTicks)||e.kind==='immolation'&&positive(e.pulseDamagePm)&&positive(e.intervalTicks)&&positive(e.radiusU))kinds.add('fire');
  if((e.kind==='frost'||e.kind==='poison')&&positive(e.slowPm)&&positive(e.durationTicks)||e.kind==='enemySlowAura'&&positive(e.slowPm)&&positive(e.radiusU))kinds.add('slow');
  if(e.kind==='bash'&&positive(e.chancePm)&&(positive(e.durationTicks)||positive(e.heroDurationTicks)))kinds.add('stun');
  if(e.kind==='critical'&&positive(e.chancePm)&&Number.isFinite(e.multiplierPm)&&e.multiplierPm>1000)kinds.add('critical');
 }
 let mask=0;
 for(const attack of [def?.attack,def?.secondaryAttack])if(attack){
  mask|=attack.targetsMask??0;
  if([attack.splash?.fullU,attack.splash?.halfU,attack.splash?.quarterU].some(positive))kinds.add('splash');
 }
 if(mask&2)kinds.add('air');if(mask&1)kinds.add('ground');
 return Object.entries(LABELS).filter(([kind])=>kinds.has(kind)).map(([kind,label])=>({kind,key:'effect:'+kind,label}));
}

const drawIcon=(sprites,ctx,key,x,y,size)=>{try{return Boolean(ctx&&sprites?.draw?.(ctx,key,x,y,size,{tick:0,shadow:false}));}catch{return false;}};

/** Owns only its appended list; labels remain readable if art is unavailable.
 * Rendering retries the existing SpriteBank, without loading or generating art. */
export function mountEffectIcons({document:doc,host,sprites}={}){
 if(!doc?.createElement||!host?.append)return {render:()=>[],destroy(){}};
 const list=doc.createElement('ul'),rows=new Map();let destroyed=false;
 list.className='field-effect-icons';list.setAttribute('aria-label','보석 효과');list.hidden=true;host.append(list);
 return {
  render({effects=[],def=null}={}){
   if(destroyed)return [];
   const models=effectIconModels(effects,def),wanted=new Set(models.map(model=>model.kind));
   for(const[kind,row]of rows)if(!wanted.has(kind)){row.node.remove();rows.delete(kind);}
   for(const model of models){
    let row=rows.get(model.kind);
    if(!row){const node=doc.createElement('li'),canvas=doc.createElement('canvas'),label=doc.createElement('span');canvas.width=24;canvas.height=24;canvas.style.width='24px';canvas.style.height='24px';canvas.setAttribute('aria-hidden','true');label.textContent=model.label;node.append(canvas,label);list.append(node);row={node,canvas,label};rows.set(model.kind,row);}
    let ctx=null;try{ctx=row.canvas.getContext('2d');ctx?.clearRect(0,0,24,24);}catch{}
    row.canvas.hidden=!drawIcon(sprites,ctx,model.key,12,12,24);
   }
   list.hidden=models.length===0;return models;
  },
  destroy(){if(destroyed)return;destroyed=true;rows.clear();list.remove();}
 };
}

/** Caller selects which tower gets these quiet marks. All painted rectangles
 * fit inside its existing square; no hit target or object boundary is enlarged. */
export function drawFieldEffectMarks(ctx,{sprites,effects=[],def=null,x,y,size}={}){
 if(![x,y,size].every(Number.isFinite)||size<6)return 0;
 const left=Math.ceil(x-size/2),right=Math.floor(x+size/2),top=Math.ceil(y-size/2),bottom=Math.floor(y+size/2);
 const span=Math.min(right-left,bottom-top),models=effectIconModels(effects,def),count=Math.min(2,Math.floor(span/6),models.length);
 if(!count)return 0;
 // Even pixel sizes and integer centers also contain SpriteBank's raster rounding.
 const iconSize=Math.floor(Math.min(10,span/count)/2)*2;let painted=0;
 for(let index=0;index<count;index++)if(drawIcon(sprites,ctx,models[index].key,left+iconSize*(index+.5),bottom-iconSize/2,iconSize))painted++;
 return painted;
}

const FEEDBACK_KINDS=new Set(['gold','life','combine']);
/** Root supplies already-observed successful events and restore suppression.
 * clear removes active visuals but preserves seen keys: history cannot replay. */
export function createFieldFeedback({now=()=>performance.now(),reducedMotion=()=>false}={}){
 const seen=new Set();let active=[],total=0;
 const time=()=>{const value=now();return Number.isFinite(value)?value:0;};
 const quiet=()=>typeof reducedMotion==='function'?Boolean(reducedMotion()):Boolean(reducedMotion);
 const expire=at=>{active=active.filter(item=>item.until>at);};
 return {
  emit(event={}){
   if(!FEEDBACK_KINDS.has(event.kind)||typeof event.key!=='string'||!event.key||event.key.length>240||!Number.isFinite(event.x)||!Number.isFinite(event.y)||!['world','screen'].includes(event.space)||seen.has(event.key))return null;
   seen.add(event.key);if(event.suppressed)return null;
   const at=time();expire(at);const item={kind:event.kind,key:event.key,x:event.x,y:event.y,space:event.space,at,until:at+(quiet()?520:760)};
   active=[...active,item].slice(-8);total++;return {...item};
  },
  snapshot(){expire(time());return {active:active.map(item=>({...item})),total};},
  draw(ctx,sprites,project=point=>point){
   const at=time();expire(at);let painted=0;
   for(const item of active){
    let point;try{point=item.space==='world'?project({x:item.x,y:item.y}):{x:item.x,y:item.y};}catch{continue;}
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))continue;
    const still=quiet(),progress=Math.max(0,Math.min(1,(at-item.at)/(item.until-item.at)));
    const size=still?12:16,half=size/2;let x=point.x,y=point.y-(still?0:progress*12);
    if(item.space==='screen'&&Number.isFinite(ctx.canvas?.width)&&Number.isFinite(ctx.canvas?.height)){
     if(ctx.canvas.width<size||ctx.canvas.height<size)continue;
     x=Math.max(half,Math.min(ctx.canvas.width-half,x));y=Math.max(half,Math.min(ctx.canvas.height-half,y));
    }
    ctx.save();if(!still)ctx.globalAlpha=(Number.isFinite(ctx.globalAlpha)?ctx.globalAlpha:1)*(1-progress);
    if(drawIcon(sprites,ctx,'feedback:'+item.kind,x,y,size))painted++;
    ctx.restore();
   }
   return painted;
  },
  clear(){active=[];total=0;}
 };
}

/** Actual HP differences only. This changes the six view slots, never HP or attribution. */
export function addDamageTag(tags,event,now){
 const active=tags.filter(t=>now-t.born<700);if(!Number.isSafeInteger(event?.unitId)||![event.x,event.y,event.amount,now].every(Number.isFinite)||event.amount<=0)return active;
 const prior=active.find(t=>t.unitId===event.unitId);if(prior){prior.amount+=event.amount;prior.x=event.x;prior.y=event.y;prior.born=now;prior.critical||=event.critical===true;return active;}
 return [...active,{unitId:event.unitId,x:event.x,y:event.y,amount:event.amount,critical:event.critical===true,born:now}].slice(-6);
}
const intersects=(a,b)=>a.left<b.x+b.width&&a.left+a.width>b.x&&a.top<b.y+b.height&&a.top+a.height>b.y;
export function damageTagViews(tags,project,{now=0,boxes=[],viewport={left:0,top:0,width:100000,height:100000},measure=text=>text.length*7,reducedMotion=false}={}){
 const out=[];for(const tag of tags.filter(t=>now-t.born<700).slice(-6)){
  const point=project(tag);if(!point||![point.x,point.y].every(Number.isFinite))continue;
  const fontSize=tag.critical===true?16:12,text=String(Math.round(tag.amount))+(tag.critical?'!':''),width=Math.ceil(measure(text,fontSize))+6,height=fontSize+4;if(width>viewport.width-8)continue;
  const box=boxes.find(b=>b.id===tag.unitId),base=(box?.y??point.y-32)-6,age=Math.max(0,Math.min(1,(now-tag.born)/700));
  const x=Math.max(viewport.left+4+width/2,Math.min(viewport.left+viewport.width-4-width/2,point.x));
  for(let row=0;row<8;row++){const y=base-row*(height+3)-(reducedMotion?0:age*8),rect={left:x-width/2,top:y-fontSize,width,height};if(rect.top<viewport.top+4)break;
   if(rect.top+height>viewport.top+viewport.height-4||boxes.some(b=>intersects(rect,b))||out.some(b=>intersects(rect,{x:b.left,y:b.top,width:b.width,height:b.height})))continue;
   out.push({...rect,x,y,text,fontSize,opacity:reducedMotion?1:1-age});break;
  }
 }return out;
}
export function goldGainView(tags,now,reducedMotion=false){const active=tags.filter(t=>now-t.born<760),amount=active.reduce((sum,t)=>sum+(Number.isFinite(t.amount)?t.amount:0),0);if(!amount)return null;const age=Math.max(0,Math.min(1,(now-Math.max(...active.map(t=>t.born)))/760));return{text:'+'+amount+' 골드',dy:reducedMotion?0:10*(1-age),opacity:reducedMotion?1:1-age};}
