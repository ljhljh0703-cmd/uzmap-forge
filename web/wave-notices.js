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
