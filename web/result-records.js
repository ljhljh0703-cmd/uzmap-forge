/** Browser-only results and challenge metadata. Never imported by Sim or saved with input traces. */
export const RESULT_RECORD_KEY='uzmap.ui.gemtower.records.v1';
const integer=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const mode=value=>value==='race'||value==='classic';
function dateOK(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value;}
export function koreanDate(now=Date.now()){return new Date(now+9*3600000).toISOString().slice(0,10);}
export function dailySeed(date){if(!dateOK(date))return null;let n=2166136261;for(const c of 'gemtower:'+date)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n||1;}
export function challengeFromQuery(query){
 const dailyDate=query.get('daily'),m=query.get('mode')??(dailyDate?'race':null),raw=query.get('difficulty')??(dailyDate?'0':null),difficulty=raw!==null&&/^[012]$/.test(raw)?Number(raw):null;
 if(!mode(m)||difficulty===null||dailyDate&&!dateOK(dailyDate))return null;
 const seed=dailyDate?dailySeed(dailyDate):/^\d+$/.test(query.get('seed')??'')?Number(query.get('seed')):null;
 return integer(seed,0,0xffffffff)?{seed,mode:m,difficulty,dailyDate:dailyDate??null}:null;
}
export function challengeURL(base,profile){
 const url=new URL(base);url.search='';url.hash='';if(!mode(profile?.mode)||!integer(profile.difficulty,0,2)||!integer(profile.seed,0,0xffffffff))throw Error('도전 주소 정보가 올바르지 않습니다');
 const dailyDate=dateOK(profile.dailyDate)?profile.dailyDate:null;
 url.searchParams.set('seed',String(dailyDate?dailySeed(dailyDate):profile.seed));url.searchParams.set('mode',profile.mode);url.searchParams.set('difficulty',String(profile.difficulty));if(dailyDate)url.searchParams.set('daily',dailyDate);return url.href;
}
export async function shareChallenge(navigator,payload){
 if(typeof navigator?.share==='function')try{await navigator.share(payload);return{kind:'shared'};}catch(error){if(error?.name==='AbortError')return{kind:'cancelled'};}
 if(typeof navigator?.clipboard?.writeText==='function')try{await navigator.clipboard.writeText(payload.url);return{kind:'copied'};}catch{}
 return{kind:'manual',url:payload.url};
}
const groupKey=r=>r.mode+':'+r.difficulty+(dateOK(r.dailyDate)?':'+r.dailyDate:'');
const validResult=r=>r&&mode(r.mode)&&integer(r.difficulty,1,3)&&integer(r.wave,0,10000)&&integer(r.tick,0)&&typeof r.runId==='string'&&r.runId.length>0&&r.runId.length<=120;
function read(storage){
 try{const value=JSON.parse(storage()?.getItem(RESULT_RECORD_KEY)??'null');if(value?.version!==1||!Array.isArray(value.groups)||!Array.isArray(value.seen))return{version:1,groups:[],seen:[]};
 return{version:1,groups:value.groups.filter(g=>validResult(g.best)&&integer(g.plays,1,1000000000)&&g.key===groupKey(g.best)).slice(-512),seen:value.seen.filter(k=>typeof k==='string'&&k.length<=180).slice(-4096)};}catch{return{version:1,groups:[],seen:[]};}
}
export function createRecordBook(storage=()=>globalThis.localStorage){
 let state=read(storage);const unsaved=new Set();return{
  record(result){
   if(!validResult(result))return{saved:false,isBest:false,best:null,plays:0};
   // Refresh persisted state for other tabs, retaining a working in-memory fallback.
   const persisted=read(storage);if(!unsaved.size&&persisted.groups.length)state=persisted;
   const key=groupKey(result),id=key+':'+result.runId;let group=state.groups.find(g=>g.key===key);if(group&&state.seen.includes(id))return{saved:!unsaved.has(id),isBest:false,best:{...group?.best},plays:group?.plays??0};
   const best=group?.best,isBest=!best||result.wave>best.wave||result.wave===best.wave&&result.tick<best.tick;
   if(!group){group={key,plays:0,best:{...result}};state.groups.push(group);}group.plays++;if(isBest)group.best={...result};state.groups=state.groups.slice(-512);state.seen=[...state.seen,id].slice(-4096);
   let saved=true;try{const target=storage();if(typeof target?.setItem!=='function')throw Error('storage unavailable');target.setItem(RESULT_RECORD_KEY,JSON.stringify(state));unsaved.clear();}catch{saved=false;unsaved.add(id);}
   return{saved,isBest,best:{...group.best},previous:best?{...best}:null,plays:group.plays};
  },
  list(){return state.groups.map(g=>({key:g.key,plays:g.plays,best:{...g.best}}));}
 };
}
export function createResultStats(){
 const dead=new Set(),rows=new Map();let kills=0,unattributed=0,lastLoss=null;
 return{
  death(death,name){
   if(!integer(death?.unitId,1)||death.unit?.owner!==11||dead.has(death.unitId)||(death.killer?.owner!==0&&death.creditedOwner!==0))return;
   dead.add(death.unitId);kills++;const id=death.killer?.owner===0?death.killer.id:null;
   if(!integer(id,1)){unattributed++;return;}const row=rows.get(id)??{id,name:name||'이름 미확인 보석',kills:0};row.kills++;rows.set(id,row);
  },
  replace(ids,result){if(!integer(result?.id,1))return;let count=0;for(const id of new Set(ids??[])){const row=rows.get(id);if(row){count+=row.kills;rows.delete(id);}}const row=rows.get(result.id)??{id:result.id,name:result.name||'이름 미확인 보석',kills:0};row.kills+=count;if(result.name)row.name=result.name;rows.set(result.id,row);},
  loss(previous,value,attackers=[]){if(!Number.isFinite(previous)||!Number.isFinite(value)||previous<=value)return;const groups=new Map(),seen=new Set();for(const a of attackers){if(!integer(a?.id,1)||seen.has(a.id)||typeof a.name!=='string'||!a.name)continue;seen.add(a.id);groups.set(a.name,(groups.get(a.name)??0)+1);}lastLoss={amount:previous-value,units:[...groups].map(([name,count])=>({name,count}))};},
  snapshot(){return{kills,unattributed,top:[...rows.values()].filter(r=>r.kills>0).sort((a,b)=>b.kills-a.kills||a.id-b.id).slice(0,3).map(r=>({...r})),lastLoss:lastLoss?{amount:lastLoss.amount,units:lastLoss.units.map(x=>({...x}))}:null};}
 };
}
