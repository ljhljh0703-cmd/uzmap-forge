import {it} from 'node:test';import assert from 'node:assert/strict';import * as sound from '../../web/sound-events.js';
const call=(caller:string,symbol:string,index:any=null,sequence=1)=>({kind:'PlaySoundBJ',caller,line:100,tick:20,threadId:1,sequence,reference:{symbol,index}});
const context=(patch:any={})=>({runId:'normal-run',tick:20,speed:1,...patch});
it('maps only audited caller/reference pairs and their real lane, never a shared zero handle or a vaguely named sound',()=>{
 assert.deepEqual(sound.sourceCueForCall(call('p4','Br')),{kind:'life-loss',playerId:0});assert.deepEqual(sound.sourceCueForCall(call('adv','Br')),{kind:'life-loss',playerId:1});
 assert.deepEqual(sound.sourceCueForCall(call('QMe','AN')),{kind:'wave-gold',playerId:0});assert.deepEqual(sound.sourceCueForCall(call('mke','VA',40)),{kind:'wave-start',playerId:0});assert.deepEqual(sound.sourceCueForCall(call('Sd','dr')),{kind:'wave-start',playerId:0});assert.deepEqual(sound.sourceCueForCall(call('j5e','dr')),{kind:'boss',playerId:0});
 for(const c of [call('wee','VA',60),call('wee','RN'),call('wwe','zN'),call('Nd','cr'),call('iY','Ur'),call('xz','dr'),call('mke','VA',null),call('mke','VA',39),call('mke','VA',60),call('p4','dr'),call('toString','Br')])assert.equal(sound.sourceCueForCall(c),null);
});
it('prefers the true source call over a view fallback for one logical event regardless of input order',()=>{
 for(const reverse of [false,true]){const r=sound.createSoundEventRouter();const events=[{kind:'life-loss',key:'leak-17',playerId:0},{kind:'source-call',key:'leak-17',call:call('p4','Br')}];if(reverse)events.reverse();const result=r.route(events,context());assert.equal(result.length,1);assert.equal(result[0].cue,'life-loss');assert.equal(result[0].origin,'source');assert.equal(result[0].source.caller,'p4');assert.equal(r.route(events,context()).length,0);}
});
it('routes every confirmed own-player UI category while retaining rare eligibility and quiet tap/kill volume',()=>{
 const r=sound.createSoundEventRouter(),kinds=['wave-start','life-loss','kill','boss','air','keep','rare','combine','research','wave-gold','tap','defeat','clear','place','upgrade'];const result=r.route(kinds.map(kind=>({kind,key:kind,playerId:0,rank:4})),context());assert.deepEqual(result.map(row=>row.cue),kinds);assert.ok(result.find(row=>row.cue==='kill').gain<.25);assert.ok(result.find(row=>row.cue==='tap').gain<.25);
 const a=sound.createSoundEventRouter();assert.equal(a.route([{kind:'rare',key:'low',rank:3},{kind:'rare',key:'special',special:true},{kind:'rare',key:'rank4',rank:4}],context()).length,2);
});
it('does not play another player world or unknown/unconfirmed/missing-key events',()=>{
 const r=sound.createSoundEventRouter();assert.deepEqual(r.route([{kind:'source-call',call:call('adv','Br')},{kind:'kill',key:'other',playerId:1},{kind:'combine',key:'rejected',confirmed:false},{kind:'kill'},{kind:'not-real',key:'unknown'}],context()),[]);
});
it('at four-times or faster only every third distinct live kill is emitted and normal speed stays quiet but unsampled',()=>{
 const r=sound.createSoundEventRouter();for(const speed of [4,8]){r.reset('normal-run');for(let i=1;i<=6;i++){const events=[{kind:'kill',key:'kill-'+i,playerId:0}];assert.equal(r.route(events,context({speed})).length,i%3===0?1:0);assert.equal(r.route(events,context({speed})).length,0);}}r.reset();assert.equal(r.route([{kind:'kill',key:'slow'}],context({speed:1})).length,1);
});
it('suppressed restore/hidden/failure calls are consumed without backlog or shifting the fast-kill phase',()=>{
 for(const flag of ['restoring','hidden','failed','suppressed']){const r=sound.createSoundEventRouter(),events=[{kind:'kill',key:'past'},{kind:'source-call',key:'past-leak',call:call('p4','Br')}];assert.deepEqual(r.route(events,context({[flag]:true,speed:4})),[]);assert.deepEqual(r.route(events,context({speed:4})),[]);assert.equal(r.snapshot().fastKillCount,0);assert.equal(r.route([{kind:'kill',key:'live1'},{kind:'kill',key:'live2'},{kind:'kill',key:'live3'}],context({speed:4})).length,1);}
});
it('new runs and explicit reset keep each original event local to that run without retaining unbounded history',()=>{
 const r=sound.createSoundEventRouter({maxSeen:12});for(let i=0;i<100;i++)r.route([{kind:'tap',key:'tap-'+i}],context());assert.ok(r.snapshot().seen<=12);const e=[{kind:'research',key:'tech1'}];assert.equal(r.route(e,context()).length,1);assert.equal(r.route(e,context()).length,0);assert.equal(r.route(e,context({runId:'next-run'})).length,1);r.reset();assert.equal(r.snapshot().seen,0);
});
it('preserves exact observed ticks and snapshots without RNG, clock or command access',()=>{
 const r=sound.createSoundEventRouter(),source=call('mke','VA',40),events=Object.freeze([Object.freeze({kind:'source-call',key:'w40',call:Object.freeze({...source,reference:Object.freeze(source.reference)})}),Object.freeze({kind:'air',key:'w40air',playerId:0})]),ctx=Object.freeze(context({tick:22})),before=JSON.stringify({events,ctx});const out=r.route(events,ctx);assert.equal(out[0].tick,20);assert.equal(out[1].tick,22);assert.equal(JSON.stringify({events,ctx}),before);out[0].source.reference.index=49;assert.equal(source.reference.index,40);
});
