import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';import {trainingOptionView} from '../../web/play-ui.js';

// The optional path validates a parent-reviewed proposal before main.js is applied.
const mainSource=process.env.TRAINING_UI_SOURCE??new URL('../../web/main.js',import.meta.url);
function fixture(initialRows:any[]){
 const source=fs.readFileSync(mainSource,'utf8'),fn=source.match(/function renderTraining\([^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(fn);
 let rows=initialRows,gold=1000,life=30,ready=true,spinning=new Set<number>([572]);
 let owned=new Set<number>();let creates=0,replacements=0,moves=0,removals=0;const doc:any={activeElement:null};
 function container(){const children:any[]=[],host:any={children,get firstElementChild(){return children[0]??null;},replaceChildren(){replacements++;for(const b of [...children])b.remove();},insertBefore(button:any,before:any){if(button===before)return;const prior=button.parentElement;if(prior){const at=prior.children.indexOf(button);prior.children.splice(at,1);moves++;if(doc.activeElement===button)doc.activeElement=null;}const index=before===null?children.length:children.indexOf(before);assert.ok(index>=0);children.splice(index,0,button);button.parentElement=host;}};return host;}
 const options=container(),casino=container(),children=options.children,save:any={},status:any={},casinoStatus:any={},casinoUse:any={hidden:true};
 doc.createElement=()=>{creates++;const b:any={dataset:{},children:[],parentElement:null,setAttribute(){},append(...items:any[]){this.children.push(...items);},querySelector(selector:string){return this.children.find((n:any)=>'.'+n.className===selector)??null;},focus(){doc.activeElement=b;},remove(){const host=b.parentElement,at=host?.children.indexOf(b)??-1;if(at>=0){host.children.splice(at,1);removals++;b.parentElement=null;if(doc.activeElement===b)doc.activeElement=null;}}};Object.defineProperty(b,'textContent',{get:()=>b.children.length?b.children.map((n:any)=>n.textContent??'').join(''):b._text??'',set:(v:string)=>{b._text=v;b.children=[];}});Object.defineProperty(b,'nextElementSibling',{get:()=>b.parentElement?.children[b.parentElement.children.indexOf(b)+1]??null});return b;};
 const w:any={vm:{},modeDialog:{clicked:true},sim:{ledger:{gold:()=>gold},pendingTrainings:new Map()}};
 const nodes:any={trainingOptions:options,trainingStatus:status,saveRun:save,casinoTrainingOptions:casino,casinoTrainingStatus:casinoStatus,casinoUse,cancelTrainingBatch:{}};
 const context:any={playing:true,trainingOptionView,checkpointRun:()=>({kind:"saved"}),trainingActions:()=>[...rows],gemTowerPlayerState:()=>({life,difficulty:ready?1:0}),gemTowerCasinoState:()=>({stations:[572,574].map(id=>({id,owned:owned.has(id),spinning:spinning.has(id)}))}),fullName:(_w:any,id:string)=>id,DT:.05,TRAIN_REASON:{busy:'구입 중','insufficient-gold':'골드가 부족합니다'},$:(id:string)=>nodes[id],document:doc};
 vm.runInNewContext(fn,context);
 return {w,doc,children,casinoChildren:casino.children,casinoStatus,casinoUse,save,status,render:(world=w)=>context.renderTraining(world),button:(producer:number,type:string,count=1)=>[...children,...casino.children].find(b=>b.dataset.producerId===String(producer)&&b.dataset.trainType===type&&b.dataset.trainCount===String(count)),setGold(v:number){gold=v;},setLife(v:number){life=v;},setReady(v:boolean){ready=v;},setSpinning(ids:number[]){spinning=new Set(ids);},setOwned(ids:number[]){owned=new Set(ids);},setPlaying(v:boolean){context.playing=v;},setRows(v:any[]){rows=v;},stats:()=>({creates,replacements,moves,removals})};
}
const coins=()=>[{producerId:572,typeId:'h044',cost:10,durationTicks:20,reason:null},{producerId:572,typeId:'h046',cost:0,durationTicks:20,reason:null},{producerId:574,typeId:'h044',cost:10,durationTicks:20,reason:null}];

it('only source-spinning machine coin/exit buttons lock and unlock when the source flag changes with identical gold',()=>{
 const f=fixture(coins());f.render();const owned=()=>f.children.filter(b=>b.dataset.producerId==='572');assert.equal(owned().length,2);assert.ok(owned().every(b=>b.disabled));assert.ok(owned().every(b=>/추첨/.test(b.title)));assert.equal(f.button(574,'h044').disabled,false);
 f.setSpinning([]);f.render();assert.ok(owned().every(b=>!b.disabled));assert.ok(owned().every(b=>!b.title.includes('추첨')));
});

it('keeps the focused training DOM across gold, batch remaining and source-spin updates while applying the existing gates',()=>{
 const f=fixture(coins());f.setSpinning([]);f.render();const button=f.button(574,'h044'),exit=f.button(572,'h046');button.focus();const initial=f.stats();
 f.setGold(990);f.render();assert.equal(f.button(574,'h044'),button,'gold refresh must not replace the pending keyboard/click target');assert.equal(f.doc.activeElement,button);
 f.w.trainingBatch={producerId:574,typeId:'h044',remaining:3};f.render();assert.equal(f.button(574,'h044'),button);assert.equal(button.disabled,true);f.w.trainingBatch.remaining=2;f.render();assert.equal(f.button(574,'h044'),button);assert.equal(f.save.disabled,true);
 f.w.trainingBatch=null;f.setSpinning([572]);f.render();assert.equal(f.button(572,'h046'),exit);assert.equal(exit.disabled,true);assert.match(exit.title,/추첨/);assert.equal(button.disabled,false);
 f.setSpinning([]);f.setGold(5);f.render();assert.equal(f.button(574,'h044'),button);assert.equal(button.disabled,true);f.setGold(20);f.render();assert.equal(button.disabled,false);assert.equal(f.save.disabled,false);
 assert.deepEqual(f.stats(),initial,'a state-only refresh must not create, detach or reorder the same keyed buttons');
});

it('removes only disappeared producers/options/count keys and keeps surviving buttons in authored cost order',()=>{
 const mine={producerId:549,typeId:'h01W',cost:5,durationTicks:20,reason:null},coin={producerId:572,typeId:'h044',cost:10,durationTicks:20,reason:null};const f=fixture([mine,coin]);f.setSpinning([]);f.setLife(95);f.render();const single=f.button(549,'h01W'),batch=f.button(549,'h01W',5),coinButton=f.button(572,'h044');coinButton.focus();
 f.setGold(20);f.render();assert.equal(f.button(549,'h01W'),single);assert.ok(!f.children.includes(batch));assert.equal(f.button(549,'h01W',4).querySelector('.training-label').textContent,'수명 4회 순차 구입 · 20 골드');assert.equal(f.button(572,'h044'),coinButton);assert.equal(f.doc.activeElement,coinButton);
 f.setRows([coin]);f.render();assert.ok(!f.children.includes(single));assert.equal(f.children.length,1);assert.equal(f.children[0],coinButton);assert.equal(f.doc.activeElement,coinButton,'removing a vanished mine must not detach the focused machine');
 const cheaper={producerId:574,typeId:'h046',cost:0,durationTicks:20,reason:null};f.setRows([coin,cheaper]);f.render();assert.deepEqual(f.children.map(b=>b.dataset.trainType),['h046','h044']);assert.equal(f.button(572,'h044'),coinButton);
 f.setRows([]);f.render();assert.equal(f.children.length,0,'a missing source machine must not leave an actionable stale button');
});

it('starts a restored world with only its current producer buttons and retains the original status, cap and ready checks',()=>{
 const mine={producerId:549,typeId:'h01W',cost:5,durationTicks:20,reason:null},f=fixture([mine]);f.setLife(99);f.setSpinning([]);f.render();const old=f.button(549,'h01W');f.setLife(100);f.render();assert.equal(f.button(549,'h01W'),old);assert.equal(old.disabled,true);assert.equal(old.title,'최대 수명 100');assert.equal(f.status.textContent,'최대 수명에 도달했습니다');
 f.setLife(30);f.setReady(false);f.render();assert.equal(f.button(549,'h01W'),old);assert.equal(old.disabled,true);assert.match(old.title,/난이도/);
 const restored={vm:{},modeDialog:{clicked:true},sim:f.w.sim};f.setRows(coins().slice(0,1));f.setReady(true);f.render(restored);assert.ok(!f.children.includes(old));assert.equal(f.children.length,1);assert.equal(f.children[0].dataset.producerId,'572');
});


it('life batch labels describe sequential purchases and show accepted queued work before or between pending trainings',()=>{
 const row={producerId:549,typeId:'h01W',cost:5,durationTicks:20,reason:null},f=fixture([row]);f.setLife(60);f.setSpinning([]);f.render();
 assert.equal(f.button(549,'h01W',10).querySelector('.training-label').textContent,'수명 10회 순차 구입 · 50 골드');
 f.w.trainingBatch={producerId:549,typeId:'h01W',remaining:9};f.render();
 assert.match(f.status.textContent,/대기/);assert.match(f.status.textContent,/남은 10회/);assert.match(f.status.textContent,/1회씩 완료 후 반영/);assert.equal(f.save.disabled,true);
 f.w.sim.pendingTrainings.set(572,{producerId:572,typeId:'h044',remainingTicks:18});f.render();
 assert.match(f.status.textContent,/대기/);assert.doesNotMatch(f.status.textContent,/0[.]9초/,'another producer must not supply the current batch timer');
 f.w.sim.pendingTrainings.set(549,{producerId:549,typeId:'h01W',remainingTicks:14});f.render();
 assert.match(f.status.textContent,/구입 중/);assert.match(f.status.textContent,/남은 10회/);assert.match(f.status.textContent,/게임 시간 0[.]7초 남음/);assert.match(f.status.textContent,/완료 후 반영/);
 f.w.sim.pendingTrainings.delete(549);f.w.trainingBatch.remaining=8;f.setLife(22);f.render();
 assert.match(f.status.textContent,/대기/);assert.match(f.status.textContent,/남은 9회/);assert.doesNotMatch(f.status.textContent,/이번 1회/,'between requests there is no active single-item timer');
});
it('a same-producer different pending type is not attributed to the batch and a single purchase shows only its own remaining game time',()=>{
 const f=fixture([{producerId:549,typeId:'h01W',cost:5,durationTicks:20,reason:null}]);f.setSpinning([]);
 f.w.trainingBatch={producerId:549,typeId:'h01W',remaining:2};f.w.sim.pendingTrainings.set(549,{producerId:549,typeId:'h042',remainingTicks:18});f.render();
 assert.match(f.status.textContent,/대기/);assert.match(f.status.textContent,/남은 3회/);assert.doesNotMatch(f.status.textContent,/0[.]9초/);
 f.w.trainingBatch=null;f.w.sim.pendingTrainings.set(549,{producerId:549,typeId:'h01W',remainingTicks:18});f.render();
 assert.match(f.status.textContent,/h01W/);assert.match(f.status.textContent,/게임 시간 0[.]9초 남음/);assert.match(f.status.textContent,/완료 후 반영/);
 f.w.sim.pendingTrainings.delete(549);f.render();assert.equal(f.status.textContent,'');assert.equal(f.save.disabled,false);
});
it('terminal UI does not advertise a frozen training as still processing and keeps the existing life-cap state',()=>{
 const f=fixture([{producerId:549,typeId:'h01W',cost:5,durationTicks:20,reason:null}]);f.setSpinning([]);
 f.w.sim.pendingTrainings.set(549,{producerId:549,typeId:'h01W',remainingTicks:18});f.w.gameOver={winner:null};f.render();
 assert.equal(f.status.textContent,'게임 종료 · 구입 처리 중단');assert.doesNotMatch(f.status.textContent,/처리 중[·…]|초 남음/);
 f.w.gameOver=null;f.w.sim.pendingTrainings.clear();f.setLife(100);f.render();assert.equal(f.status.textContent,'최대 수명에 도달했습니다');
});


it('an admitted machine exposes its original coin and exit buttons inside the casino even while mine options are closed',()=>{
 const f=fixture([{producerId:549,typeId:'h01W',cost:5,durationTicks:20,reason:null},...coins().slice(0,2)]);f.setOwned([572]);f.setSpinning([]);f.render();
 assert.ok(f.children.length>0&&f.children.every(b=>b.dataset.producerId==='549'),'mine single/batch controls stay separate');assert.deepEqual(f.casinoChildren.map((b:any)=>b.dataset.trainType),['h046','h044']);assert.equal(f.casinoUse.hidden,false);assert.equal(f.button(572,'h044').disabled,false);assert.equal(f.button(572,'h046').disabled,false);
});
it('ownership changes move the same keyed control and keep focus, and source exit removes stale actions',()=>{
 const f=fixture(coins().slice(0,2));f.setSpinning([]);f.render();const coin=f.button(572,'h044');coin.focus();f.setOwned([572]);f.render();
 assert.equal(f.children.length,0);assert.equal(f.casinoChildren.length,2);assert.equal(f.button(572,'h044'),coin);assert.equal(f.doc.activeElement,coin);
 f.setRows([]);f.setOwned([]);f.render();assert.equal(f.casinoChildren.length,0);assert.equal(f.casinoUse.hidden,true);assert.equal(f.casinoStatus.textContent,'');
});
it('same-gold spinning updates keep owned controls locked in place until the original flag clears',()=>{
 const f=fixture(coins().slice(0,2));f.setOwned([572]);f.render();const coin=f.button(572,'h044'),exit=f.button(572,'h046');assert.ok(coin.disabled&&exit.disabled);assert.match(f.casinoStatus.textContent,/추첨/);
 f.setSpinning([]);f.render();assert.equal(f.button(572,'h044'),coin);assert.equal(f.button(572,'h046'),exit);assert.equal(coin.disabled,false);assert.equal(exit.disabled,false);assert.doesNotMatch(f.casinoStatus.textContent,/추첨 중/);
});
it('paused, source training and terminal status stay beside the admitted machine',()=>{
 const f=fixture(coins().slice(0,2));f.setOwned([572]);f.setSpinning([]);f.setPlaying(false);f.render();assert.match(f.casinoStatus.textContent,/재개/);
 f.w.sim.pendingTrainings.set(572,{producerId:572,typeId:'h044',remainingTicks:18});f.setPlaying(true);f.render();assert.match(f.casinoStatus.textContent,/h044.*0[.]9초/);
 f.w.gameOver={winner:null};f.render();assert.match(f.casinoStatus.textContent,/게임 종료/);assert.doesNotMatch(f.casinoStatus.textContent,/0[.]9초/);
});
it('both purchase containers use one shared handler and the existing validated recorded request',()=>{
 const source=fs.readFileSync(mainSource,'utf8'),fn=source.match(/function handleTrainingClick\([^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(fn,'one existing training handler must serve both DOM locations');const calls:any[]=[],world={};const context:any={world,playing:false,checkpointRun:()=>({kind:'saved'}),requestTrainingBatch:(...args:any[])=>{calls.push(args);return true;},flash(){},render(){}};vm.runInNewContext(fn!,context);context.handleTrainingClick({target:{closest:()=>({dataset:{producerId:'572',trainType:'h044',trainCount:'1'}})}});assert.deepEqual(calls,[[world,572,'h044',1]]);assert.match(source,/\["trainingOptions","casinoTrainingOptions"\].*addEventListener\('click',handleTrainingClick\)/);
});
