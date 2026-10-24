import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import * as help from '../../web/source-help.js';

const rows=()=>help.SOURCE_BUTTON_HELP_METADATA;
describe('G3 source-backed one-line button help',()=>{
 it('covers exactly the three research IDs and six source-offerable training targets without adding a new action',()=>{
  assert.deepEqual(Object.keys(rows()).sort(),['R000','R001','R002','h01W','h03Q','h042','h044','h046','h049'].sort());
  for(const id of Object.keys(rows()))assert.equal(help.sourceButtonHelp(id),rows()[id].help);
 });
 it('retains original research names and the distinct effects of quality, chance success and extra kill credit',()=>{
  assert.equal(rows().R000.originalName,'보석 질 향상');
  assert.equal(rows().R001.originalName,'찬스 확률 향상');
  assert.equal(rows().R002.originalName,'천국의 보석 어빌리티');
  assert.match(help.sourceButtonHelp('R000'),/다음 보석.*등급.*확률/);
  assert.match(help.sourceButtonHelp('R001'),/최상급 보석 찬스.*슬레이트 찬스.*성공 확률/);
  assert.match(help.sourceButtonHelp('R002'),/추가 킬수.*확률/);
  assert.doesNotMatch(help.sourceButtonHelp('R002'),/골드|피해|공격력/);
 });
 it('keeps both purchased chances on the next round and its five gems, without promising an immediate or certain reward',()=>{
  for(const id of ['h042','h03Q']){
   assert.match(help.sourceButtonHelp(id),/다음 라운드.*다섯 보석/);
   assert.doesNotMatch(help.sourceButtonHelp(id),/즉시|확정|반드시|100%/);
  }
  assert.match(help.sourceButtonHelp('h042'),/슬레이트/);
  assert.match(help.sourceButtonHelp('h03Q'),/최상급 보석/);
 });
 it('uses the original life cap and coin/exit meanings without inventing a purchase increment or payout',()=>{
  assert.match(help.sourceButtonHelp('h01W'),/생명.*최대 100/);
  assert.doesNotMatch(help.sourceButtonHelp('h01W'),/1씩|1 증가|한 번.*1/);
  assert.match(help.sourceButtonHelp('h044'),/코인.*빠칭코/);
  assert.doesNotMatch(help.sourceButtonHelp('h044'),/당첨|배율|확률|\d/);
  assert.match(help.sourceButtonHelp('h046'),/기계.*나와요/);
  assert.equal(rows().h046.sourceStatus,'short-tooltip-only');
  assert.ok(rows().h046.sourceFields.includes('war3map.w3u:h046.utip'));
 });
 it('leaves the unclear blackjack-start effect empty and preserves why the source cannot explain it',()=>{
  assert.equal(help.sourceButtonHelp('h049'),'');
  assert.equal(rows().h049.originalName,'시작');
  assert.equal(rows().h049.sourceStatus,'meaning-unresolved');
  assert.match(rows().h049.emptyReason,/행운을 빕니다/);
  assert.ok(rows().h049.sourceFields.includes('war3map.w3u:h049.utub'));
 });
 it('returns empty help for unknown, inherited-looking and non-string IDs without throwing',()=>{
  for(const id of ['', 'R999','h999','toString','constructor','__proto__',null,undefined,{},1,Symbol('R000')])assert.equal(help.sourceButtonHelp(id),'');
 });
 it('keeps metadata and nested field lists frozen so rendering cannot rewrite source-backed copy or its provenance',()=>{
  const before=JSON.stringify(rows());assert.equal(Object.isFrozen(rows()),true);
  for(const row of Object.values(rows())){
   assert.equal(Object.isFrozen(row),true);assert.equal(Object.isFrozen(row.sourceFields),true);
   assert.ok(row.sourceFields.length>=2);assert.ok(row.sourceFields.every(field=>/^war3map\.w3[qu]:[A-Za-z0-9]{4}\.[a-z0-9]{4}$/.test(field)));
   if(row.help)assert.equal(row.emptyReason,'');
  }
  assert.throws(()=>{rows().R000.help='임의 보상';},TypeError);
  assert.throws(()=>{rows().h049.sourceFields.push('invented');},TypeError);
  for(let i=0;i<40;i++)for(const id of Object.keys(rows()))help.sourceButtonHelp(id);
  assert.equal(JSON.stringify(rows()),before);
 });
});
