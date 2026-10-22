import {it} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {gemObjectPresentation} from '../../web/play-ui.js';import {GEMTOWER_BALANCE} from '../../src/sim/balance/configs/gemtower.ts';
const source=fs.readFileSync('web/main.js','utf8');
const block=source.match(/    const normalFamily=gemTowerGemFamily\(fullName\(w,e.typeId\)\);[\s\S]*?    const line=logical[^\n]+/)?.[0];assert.ok(block,'actual board classification block exists');
it('the board special marker agrees with the shared source classification used by the portrait',()=>{
 for(const typeId of ['n00E','n009','n002']){const d={abilities:['A02J'],meta:{role:GEMTOWER_BALANCE.roleTable[typeId]}},context:any={w:{},e:{typeId},d,role:GEMTOWER_BALANCE.roleTable[typeId],gemTowerGemFamily:()=>null,fullName:()=>typeId,sprites:{aliases:{[typeId]:'special:'+typeId}},gemObjectPresentation};vm.runInNewContext(block+'\nresult={special,logical};',context);assert.equal(context.result.special,false,typeId+' is a source slate, not the legacy special marker');assert.equal(context.result.logical,'slate:'+typeId);}
});
