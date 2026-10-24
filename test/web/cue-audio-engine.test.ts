import {it} from 'node:test';import assert from 'node:assert/strict';
import {createCueAudio} from '../../web/action-feedback.js';
import {H_AUDIO_CUES,H_CUE_SETTINGS} from '../../web/audio-catalog.js';
const cues={place:'https://audio.test/place.ogg',combine:'https://audio.test/combine.ogg',upgrade:'https://audio.test/upgrade.ogg',kill:'https://audio.test/kill.ogg',tap:'https://audio.test/tap.ogg',lifeLoss:'https://audio.test/life.ogg',defeat:'https://audio.test/defeat.ogg'};
const music={prepare:'https://audio.test/prepare.m4a',combat:'https://audio.test/combat.m4a'};
function fixture(options:any={}){
 let ms=0,created=0,recorded=0;const fetched:string[]=[],sources:any[]=[],gains:any[]=[],timers=new Map<number,any>(),timerHistory:any[]=[];let timerId=0;
 const context:any={state:'suspended',currentTime:0,destination:{speaker:true},async resume(){this.state='running';},async suspend(){this.state='suspended';},async decodeAudioData(bytes:any){return {file:bytes.file};},createGain(){const calls:any[]=[];const g={gain:{value:0,setValueAtTime(v:number,t:number){calls.push(['set',v,t]);this.value=v;},linearRampToValueAtTime(v:number,t:number){calls.push(['ramp',v,t]);},cancelScheduledValues(t:number){calls.push(['cancel',t]);}},connections:[] as any[],connect(node:any){this.connections.push(node);},disconnect(){},calls};gains.push(g);return g;},createBufferSource(){const source:any={buffer:null,loop:false,connections:[],starts:0,stops:0,onended:null,connect(node:any){this.connections.push(node);},disconnect(){},start(){this.starts++;},stop(){this.stops++;this.onended?.();},finish(){this.onended?.();}};sources.push(source);return source;}};
 if(options.recording)context.createMediaStreamDestination=()=>{recorded++;return {stream:{id:'recording'},recording:true};};
 const audio=createCueAudio({contextFactory:()=>{created++;return context;},cueUrls:cues,bgmUrls:music,now:()=>ms,wallNow:()=>123456,fetch:async(url:string)=>{fetched.push(url);const bytes:any=new ArrayBuffer(4);bytes.file=url;return {ok:true,arrayBuffer:async()=>bytes};},setTimeout:(fn:Function,delay:number)=>{const id=++timerId,t={fn,at:ms+delay};timers.set(id,t);timerHistory.push(fn);return id;},clearTimeout:(id:number)=>timers.delete(id),...options});
 const time=(next:number)=>{ms=next;context.currentTime=ms/1000;for(const[id,t]of [...timers])if(t.at<=ms){timers.delete(id);t.fn();}};
 return {audio,context,fetched,sources,gains,timerHistory,time,stats:()=>({created,recorded,timers:timers.size}),live:()=>sources.filter(s=>s.starts&&!s.stops)};
}
it('accepts an injected catalogue, defaults to separate 80/50 volumes and never creates context or fetches before unlock',async()=>{
 const f=fixture();assert.equal(f.audio.snapshot().sfxVolume,80);assert.equal(f.audio.snapshot().bgmVolume,50);assert.equal(f.audio.play('place'),false);assert.equal(f.audio.setPhase('prepare'),false);assert.equal(f.audio.getRecordingStream(),null);assert.equal(f.stats().created,0);assert.equal(f.fetched.length,0);
 assert.equal(await f.audio.unlock(),true);assert.deepEqual(new Set(f.fetched),new Set([...Object.values(cues),...Object.values(music)]));await f.audio.unlock();assert.equal(f.stats().created,1);assert.equal(f.fetched.length,9);assert.equal(f.gains[0].gain.value,.8);assert.equal(f.gains[1].gain.value,.5);
});
it('clamps volumes and starts no muted zero-volume voice or music, including before the first gesture',async()=>{
 const f=fixture();f.audio.setSfxVolume(-1);f.audio.setBgmVolume(0);assert.equal(f.audio.snapshot().sfxVolume,0);assert.equal(await f.audio.unlock(),false);assert.equal(f.stats().created,0);assert.equal(f.fetched.length,0);
 f.audio.setSfxVolume(200);assert.equal(f.audio.snapshot().sfxVolume,100);await f.audio.unlock();assert.equal(f.audio.setPhase('prepare'),false);assert.equal(f.audio.play('place'),true);f.audio.setSfxVolume(0);assert.equal(f.audio.snapshot().active,0);assert.equal(f.audio.play('combine'),false);assert.equal(f.sources.filter(s=>s.loop).length,0);
});
it('preempts quiet SFX for important alerts while preserving a strict three-voice cap',async()=>{
 const f=fixture();await f.audio.unlock();for(const kind of ['kill','tap','place'])assert.equal(f.audio.play(kind),true);assert.equal(f.audio.snapshot().active,3);assert.equal(f.audio.play('lifeLoss',{wave:3,tick:400}),true);assert.equal(f.audio.snapshot().active,3);assert.equal(f.sources[1].buffer.file,cues.tap);assert.equal(f.sources[1].stops,1);assert.equal(f.live().filter(s=>!s.loop).length,3);assert.equal(f.audio.play('tap'),false);
});
it('deduplicates identical cues for 80ms without queuing them or altering later permission',async()=>{
 const f=fixture();await f.audio.unlock();assert.equal(f.audio.play('place'),true);f.sources[0].finish();f.time(79);assert.equal(f.audio.play('place'),false);f.time(80);assert.equal(f.audio.play('place'),true);assert.equal(f.audio.snapshot().played,2);
});
it('supports configurable cue gain/priority and keeps logs bounded, detached and contextual',async()=>{
 const f=fixture({logLimit:6,cueSettings:{tap:{gain:.1,priority:200}}});await f.audio.unlock();f.time(3500);assert.equal(f.audio.play('tap',{tick:12,event:'touch'}),true);const log=f.audio.log;const played=log.find((x:any)=>x.result==='played');assert.equal(played.cue,'tap');assert.equal(played.file,cues.tap);assert.equal(played.wallTime,123456);assert.equal(played.audioTime,3.5);assert.deepEqual(played.context,{tick:12,event:'touch'});assert.ok(f.gains.some(g=>g.gain.value===.1));
 for(let i=0;i<20;i++)f.audio.play('missing');assert.equal(f.audio.log.length,6);const copy=f.audio.snapshot().log;copy[0].cue='tampered';assert.notEqual(f.audio.log[0].cue,'tampered');assert.ok(f.audio.log.every((x:any)=>['played','skipped'].includes(x.result)));
 const importantTap=fixture({cueSettings:{tap:{gain:.1,priority:200}}});await importantTap.audio.unlock();for(const cue of ['lifeLoss','defeat','combine'])assert.equal(importantTap.audio.play(cue),true);assert.equal(importantTap.audio.play('tap'),true,'injected priority overrides the quiet tap default');assert.equal(importantTap.sources[2].stops,1);assert.equal(importantTap.audio.snapshot().active,3);
});
it('runs separate looping prepare/combat nodes with a half-second gain crossfade and retires the old node',async()=>{
 const f=fixture();await f.audio.unlock();assert.equal(f.audio.setPhase('prepare'),true);f.time(500);assert.equal(f.audio.setPhase('combat',{wave:1}),true);assert.equal(f.audio.snapshot().bgmActive,2);assert.equal(f.audio.snapshot().phase,'combat');const loops=f.sources.filter(s=>s.loop);assert.equal(loops.length,2);assert.ok(f.gains.some(g=>g.calls.some((a:any)=>a[0]==='ramp'&&a[1]===0&&a[2]===1)));assert.ok(f.gains.some(g=>g.calls.some((a:any)=>a[0]==='ramp'&&a[1]===1&&a[2]===1)));
 f.time(1000);assert.equal(f.audio.snapshot().bgmActive,1);assert.equal(loops[0].stops,1);assert.equal(loops[1].stops,0);assert.ok(f.audio.log.some((x:any)=>x.cue==='bgm:combat'&&x.result==='played'));
});
it('rapid phase reversals reuse at most two music nodes and cancel obsolete fade retirement',async()=>{
 const f=fixture();await f.audio.unlock();f.audio.setPhase('prepare');f.time(100);f.audio.setPhase('combat');f.time(200);f.audio.setPhase('prepare');assert.equal(f.sources.filter(s=>s.loop).length,2);assert.equal(f.audio.snapshot().bgmActive,2);f.time(1000);assert.equal(f.audio.snapshot().phase,'prepare');assert.equal(f.audio.snapshot().bgmActive,1);const active=f.live().filter(s=>s.loop);assert.equal(active.length,1);assert.equal(active[0].buffer.file,music.prepare);
});
it('unchanged phase calls do not create or log repeated starts; null stops both tracks',async()=>{
 const f=fixture();await f.audio.unlock();f.audio.setPhase('prepare');const count=f.audio.log.length;for(let i=0;i<30;i++)f.audio.setPhase('prepare');assert.equal(f.sources.length,1);assert.equal(f.audio.log.length,count);f.audio.setPhase(null);assert.equal(f.audio.snapshot().phase,null);assert.equal(f.audio.snapshot().bgmActive,0);
});
it('suspending invalidates unresolved decode and cannot start a late SFX or BGM',async()=>{
 const resolves:any[]=[];const f=fixture();f.context.decodeAudioData=()=>new Promise(r=>resolves.push(r));const pending=f.audio.unlock();for(let i=0;i<20&&resolves.length<9;i++)await Promise.resolve();assert.equal(resolves.length,9);await f.audio.suspend();for(const resolve of resolves)resolve({});assert.equal(await pending,false);assert.equal(f.audio.play('place'),false);assert.equal(f.audio.setPhase('prepare'),false);assert.equal(f.sources.length,0);assert.equal(f.audio.snapshot().status,'paused');
});
it('suspend stops every SFX/BGM and obsolete timer callbacks cannot stop a new post-gesture track',async()=>{
 const f=fixture();await f.audio.unlock();f.audio.play('place');f.audio.setPhase('prepare');f.audio.setPhase('combat');const obsolete=[...f.timerHistory];await f.audio.suspend();assert.equal(f.audio.snapshot().active,0);assert.equal(f.audio.snapshot().bgmActive,0);assert.equal(f.audio.play('combine'),false);assert.equal(f.audio.setPhase('prepare'),false);assert.equal(f.context.state,'suspended');
 await f.audio.unlock();assert.equal(f.audio.snapshot().bgmActive,0,'unlock itself never starts historical music');f.audio.setPhase('prepare');for(const fn of obsolete)fn();assert.equal(f.audio.snapshot().bgmActive,1);
});
it('turning BGM to zero stops music without stopping SFX and turning SFX to zero stops only voices',async()=>{
 const f=fixture();await f.audio.unlock();f.audio.play('place');f.audio.setPhase('prepare');f.audio.setBgmVolume(0);assert.equal(f.audio.snapshot().bgmActive,0);assert.equal(f.audio.snapshot().active,1);f.audio.setBgmVolume(50);f.audio.setPhase('combat');f.audio.setSfxVolume(0);assert.equal(f.audio.snapshot().active,0);assert.equal(f.audio.snapshot().bgmActive,1);
});
it('recording destination is explicit, optional and connects both current channels once without replacing speakers',async()=>{
 const f=fixture({recording:true});assert.equal(f.audio.getRecordingStream(),null);assert.equal(f.stats().recorded,0);await f.audio.unlock();assert.equal(f.stats().recorded,0);const stream=f.audio.getRecordingStream();assert.ok(stream);assert.equal(f.audio.getRecordingStream(),stream);assert.equal(f.stats().recorded,1);assert.equal(f.gains[0].connections.length,2);assert.equal(f.gains[1].connections.length,2);assert.equal(f.gains[0].connections[0],f.context.destination);const old=fixture();await old.audio.unlock();assert.equal(old.audio.getRecordingStream(),null);
});

it('tries an ogg/m4a URL fallback only after a failed decode and logs the successful path',async()=>{
 const primary='https://audio.test/bad.ogg',fallback='https://audio.test/good.m4a',unused='https://audio.test/unused.m4a',f=fixture({cueUrls:{place:[primary,fallback],combine:[cues.combine,unused]},bgmUrls:{}});
 f.context.decodeAudioData=async(bytes:any)=>{if(bytes.file===primary)throw Error('unsupported codec');return {file:bytes.file};};await f.audio.unlock();assert.deepEqual(new Set(f.fetched),new Set([primary,fallback,cues.combine]));assert.equal(f.fetched.includes(unused),false);assert.equal(f.audio.snapshot().files.place,fallback);assert.equal(f.audio.play('place'),true);assert.equal(f.audio.log.at(-1).file,fallback);
});

it('a fresh gesture waits for an older asynchronous suspension and its state cannot be overwritten by that old completion',async()=>{
 const f=fixture();await f.audio.unlock();let finish:any;
 f.context.suspend=()=>new Promise<void>(resolve=>{finish=()=>{f.context.state='suspended';resolve();};});
 const parked=f.audio.suspend(),resumed=f.audio.unlock();for(let i=0;i<4;i++)await Promise.resolve();finish();await parked;assert.equal(await resumed,true);assert.equal(f.context.state,'running');assert.equal(f.audio.snapshot().status,'ready');assert.equal(f.audio.play('place'),true);
});

it('logs catalogue cue gain and contemporaneous channel volumes independently of router descriptor gain and future settings',async()=>{
 const f=fixture({cueSettings:{place:{gain:.45},tap:{gain:.1},lifeLoss:{gain:.8}}});await f.audio.unlock();
 assert.equal(f.audio.play('place',{gain:.12,sourceKind:'place'}),true);const first=f.audio.log.at(-1);
 assert.equal(first.effectiveCueGain,.45);assert.equal(first.sfxVolume,80);assert.equal(first.bgmVolume,50);assert.equal(first.enabled,true);assert.equal(first.context.gain,.12,'context retains the caller descriptor, not a claim of applied gain');
 f.audio.setSfxVolume(20);assert.equal(f.audio.play('tap',{gain:1}),true);const second=f.audio.log.at(-1);assert.equal(second.effectiveCueGain,.1);assert.equal(second.sfxVolume,20);
 assert.equal(f.audio.log.find((row:any)=>row.sequence===first.sequence).sfxVolume,80,'past rows must not borrow the current slider value');
 f.audio.setSfxVolume(0);assert.equal(f.audio.play('lifeLoss',{gain:1}),false);const muted=f.audio.log.at(-1);assert.equal(muted.effectiveCueGain,.8);assert.equal(muted.sfxVolume,0);assert.equal(muted.enabled,true);
 f.audio.setEnabled(false);f.audio.play('lifeLoss');assert.equal(f.audio.log.at(-1).enabled,false);
 f.audio.setEnabled(true);f.audio.setSfxVolume(20);f.audio.setBgmVolume(25);await f.audio.unlock();assert.equal(f.audio.setPhase('prepare',{gain:.2}),true);const bgm=f.audio.log.at(-1);assert.equal(bgm.effectiveCueGain,1);assert.equal(bgm.sfxVolume,20);assert.equal(bgm.bgmVolume,25);assert.equal(bgm.enabled,true);
 f.audio.play('not-in-catalogue',{gain:1});const unknown=f.audio.log.at(-1);assert.equal(unknown.effectiveCueGain,null);assert.equal(unknown.bgmVolume,25);
});

for(const terminal of ['defeat','clear'])it('actual CC0 catalogue lets '+terminal+' replace life-loss voices at the engine cap',async()=>{
 const f=fixture({cueUrls:H_AUDIO_CUES,cueSettings:H_CUE_SETTINGS,bgmUrls:{}});await f.audio.unlock();
 for(const time of [0,100,200]){f.time(time);assert.equal(f.audio.play('lifeLoss'),true);}
 assert.equal(f.audio.snapshot().active,3);f.time(300);assert.equal(f.audio.play(terminal),true,'terminal cue must outrank lifeLoss in the real injected settings');assert.equal(f.audio.snapshot().active,3);assert.ok(f.sources.slice(0,3).some(source=>source.stops===1));assert.equal(f.audio.log.at(-1).cue,terminal);assert.equal(f.audio.log.at(-1).result,'played');
});
