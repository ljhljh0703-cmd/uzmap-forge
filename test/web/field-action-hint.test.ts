import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {selectionStageHint} from '../../web/ui-skin.js';
const source=fs.readFileSync('web/main.js','utf8');
const assignment=source.match(/^ const hint=\$\('gemNone'\)[^\n]+/m)?.[0];assert.ok(assignment,'actual final field hint writer exists');
function hint(w:any,state:any){const span={textContent:''};vm.runInNewContext(assignment!,{w,state,playing:false,selectionStageHint,$:()=>({querySelector:()=>span})});return span.textContent;}
it('the final field renderer preserves the shared stage guidance instead of overwriting it after skin render',()=>{
 const w={pendingBuilds:[],precisePlacement:false};assert.match(hint(w,{buildCount:3,chosen:false}),/2개/);assert.match(hint(w,{buildCount:5,chosen:false}),/남기기/);assert.match(hint(w,{buildCount:5,chosen:true}),/능력.*강화/);
});
it('accepted queued builds and explicit precision instructions still outrank generic stage guidance',()=>{
 assert.match(hint({pendingBuilds:[{}],precisePlacement:false},{buildCount:1}),/건설 대기 1개.*재개/);assert.match(hint({pendingBuilds:[],precisePlacement:true},{buildCount:1}),/정밀 배치/);
});
