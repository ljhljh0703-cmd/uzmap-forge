import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createFieldFeedback} from '../../web/field-effects.js';
const source=readFileSync('web/main.js','utf8');
it('a confirmed source combination emits one sparkle at the actual result, while replay, failures and absent results emit none',()=>{
 const code=source.match(/^function showActionSuccess\([^\n]*\{[\s\S]*?^\}/m)?.[0];assert.ok(code);
 const unit={id:3,typeId:'h005',x:12,y:34,alive:true},fieldFeedback=createFieldFeedback({now:()=>0});
 const w:any={sim:{tickCount:10,getUnit:(id:number)=>id===3?unit:null},runId:'test',fieldFeedback};
 const c:any={world:w,restoring:false,loadingRun:false,runtimeFailed:false,document:{hidden:false},actionFeedback:{confirm:()=>true},fullName:()=> '루비'};vm.runInNewContext(code,c);
 c.restoring=true;c.showActionSuccess(w,'combine',unit);c.restoring=false;
 c.showActionSuccess(w,'place',unit);c.showActionSuccess(w,'upgrade',unit);c.showActionSuccess(w,'combine',{id:7,typeId:'h005'});
 assert.equal(fieldFeedback.snapshot().active.length,0);
 c.showActionSuccess(w,'combine',unit);c.showActionSuccess(w,'combine',unit);
 const active=fieldFeedback.snapshot().active;assert.equal(active.length,1);assert.equal(active[0].kind,'combine');assert.deepEqual([active[0].x,active[0].y,active[0].space],[12,34,'world']);
});
