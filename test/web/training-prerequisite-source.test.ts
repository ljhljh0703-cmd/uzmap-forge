import {it} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {readScriptMap} from '../../src/runtime/session.ts';import {resolveWtsText} from '../../src/formats/wts.ts';
it('original R000 prerequisite names follow the required level instead of borrowing its final-level title',()=>{
 const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),file=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url),loaded=readScriptMap(new Uint8Array(fs.readFileSync(file)),'GemTower_Max_7C.w3x');
 const read=(name:string)=>{const f=source.match(new RegExp('function '+name+'\\([^\\n]*\\{[\\s\\S]*?\\n\\}'));assert.ok(f);return f[0];};
 const c:any={resolveWtsText,fullName:(_w:any,id:string)=>id};vm.runInNewContext(read('sourceText')+'\n'+read('trainingTechName'),c);const w={sim:{mapIr:loaded.ir},strings:loaded.strings};
 assert.equal(c.trainingTechName(w,'R000',1),'보석 질 향상');assert.equal(c.trainingTechName(w,'R000',8),'보석 질 향상');assert.equal(c.trainingTechName(w,'R000',9),'보석 질 향상 최대치');
});
