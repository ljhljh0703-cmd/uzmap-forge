import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {extractRecipeBook,recipeBookRows} from '../../web/recipe-book.js';
import {readScriptMap} from '../../src/runtime/session.ts';
import {resolveWtsText} from '../../src/formats/wts.ts';
const mod=(field:string,value:unknown,level=1)=>({field,value,level,column:0});
const object=(kind:string,id:string,mods:any[])=>({kind,baseId:kind==='unit'?'hbla':'Atru',newId:id,mods});
function fixture(){return {objectMods:[
 object('unit','h00E',[mod('uabi','R001,R001,Avul',0)]),
 object('unit','h034',[mod('uabi','R002,Avul',0)]),
 object('ability','R001',[mod('anam','원작 이름',0),mod('atp1','|cff33ff33보석 제목|r'),mod('aub1','효과 3%|n필요한 재료: 합성 A or 합성 B')]),
 object('ability','R002',[mod('atp1','슬레이트 제목'),mod('aub1','필요한 재료: 합성 C\r\n합성 D')]),
 object('ability','NOPE',[mod('atp1','미부여 설명'),mod('aub1','부여되지 않은 문서는 표에 추가하지 않음')])
]};}
function freeze(value:any):any{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
it('indexes only the two source recipe facilities in declared order without duplicate notes or protection abilities',()=>{
 const book=extractRecipeBook(fixture());assert.deepEqual(book.rows.map((r:any)=>r.id),['gem:R001','slate:R002']);assert.deepEqual(book.warnings,[]);
 assert.deepEqual(book.rows[0].source,{unitId:'h00E',abilityId:'R001',titleField:'atp1',descriptionField:'aub1',level:1});
 assert.equal(book.rows[0].category,'gem');assert.equal(book.rows[1].category,'slate');assert.equal(book.rows.some((r:any)=>r.source.abilityId==='NOPE'),false);
});
it('normalizes Warcraft display colors, line breaks and layout padding while retaining the exact raw source text and OR wording',()=>{
 const ir=fixture();ir.objectMods[2].mods[2].value='|cffff0000효과 3%|r     설명|n필요한 재료: 합성 A or 합성 B\r\n  2개';
 const book=extractRecipeBook(ir),r=book.rows[0];assert.equal(r.title,'보석 제목');assert.equal(r.description,'효과 3%\n설명\n필요한 재료: 합성 A or 합성 B\n2개');assert.equal(r.rawTitle,'|cff33ff33보석 제목|r');assert.equal(r.rawDescription,ir.objectMods[2].mods[2].value);
 assert.equal('ownedCount'in r,false);assert.equal('available'in r,false);assert.equal('ingredients'in r,false);
});
it('keeps authored long-space layout as lines while single word spaces and cross-line search remain readable',()=>{
 const ir=fixture(),raw='데미지: 0'+' '.repeat(42)+'쿨다운: 0 초'+' '.repeat(27)+'어빌리티: 범위내 40 데미지'+' '.repeat(51)+'필요한 보석 재료:'+'\t'.repeat(3)+'재료 A or 재료 B';
 ir.objectMods[2].mods[2].value=raw;const book=extractRecipeBook(ir),row=book.rows[0];
 assert.deepEqual(row.description.split('\n'),['데미지: 0','쿨다운: 0 초','어빌리티: 범위내 40 데미지','필요한 보석 재료:','재료 A or 재료 B']);assert.equal(row.rawDescription,raw);assert.equal(ir.objectMods[2].mods[2].value,raw);
 assert.deepEqual(recipeBookRows(book,{query:'쿨다운: 0 초 어빌리티: 범위내 40 데미지'}),[row]);
});
it('resolves supplied WTS tokens using the existing token policy and reports unresolved references instead of inventing text',()=>{
 const ir=fixture();ir.objectMods[2].mods[1].value='TRIGSTR_007';ir.objectMods[2].mods[2].value='재료 TRIGSTR_008';
 const strings=new Map([[7,'|cff00ff00번역 제목|r'],[8,'합성 재료']]),book=extractRecipeBook(ir,{strings});assert.equal(book.rows[0].title,'번역 제목');assert.equal(book.rows[0].description,resolveWtsText('재료 TRIGSTR_008',strings));assert.equal(book.rows[0].rawTitle,'TRIGSTR_007');assert.deepEqual(book.warnings,[]);
 const missing=extractRecipeBook(ir,{strings:new Map([[7,'제목']])});assert.match(missing.rows[0].description,/TRIGSTR_008/);assert.ok(missing.warnings.some((w:any)=>w.code==='missing-string'&&w.token==='TRIGSTR_008'));
});
it('uses first-level note fields and the declared name fallback without borrowing higher-level text',()=>{
 const ir=fixture();ir.objectMods[2].mods.push(mod('atp1','두 번째 레벨',2),mod('aub1','두 번째 재료',2));assert.equal(extractRecipeBook(ir).rows[0].title,'보석 제목');
 ir.objectMods[2].mods=ir.objectMods[2].mods.filter((m:any)=>m.field!=='atp1');assert.equal(extractRecipeBook(ir).rows[0].title,'원작 이름');assert.equal(extractRecipeBook(ir).rows[0].source.titleField,'anam');
});
it('missing and malformed source definitions produce explicit warnings and no fabricated rows',()=>{
 for(const ir of [null,{}, {objectMods:null}]){const book=extractRecipeBook(ir as any);assert.deepEqual(book.rows,[]);assert.ok(book.warnings.length);}
 const missing=fixture();missing.objectMods=missing.objectMods.filter((o:any)=>o.newId!=='R001');const book=extractRecipeBook(missing);assert.equal(book.rows.length,1);assert.ok(book.warnings.some((w:any)=>w.code==='missing-ability'&&w.abilityId==='R001'));
 const malformed=fixture();malformed.objectMods[0].mods[0].value=12;const bad=extractRecipeBook(malformed);assert.equal(bad.rows.length,1);assert.ok(bad.warnings.some((w:any)=>w.code==='invalid-ability-list'));
 const absent=fixture();absent.objectMods[2].mods[2].value=12;const noDescription=extractRecipeBook(absent);assert.equal(noDescription.rows.length,1);assert.ok(noDescription.warnings.some((w:any)=>w.code==='missing-description'));
});
it('filters title and description with Korean/Latin text while preserving source order and both categories',()=>{
 const book=extractRecipeBook(fixture());assert.equal(recipeBookRows(book).length,2);assert.deepEqual(recipeBookRows(book,{category:'gem'}),[book.rows[0]]);assert.deepEqual(recipeBookRows(book,{category:'slate'}),[book.rows[1]]);
 assert.deepEqual(recipeBookRows(book,{query:'  보석 제목 '}),[book.rows[0]]);assert.deepEqual(recipeBookRows(book,{query:'OR 합성 B'}),[book.rows[0]]);assert.deepEqual(recipeBookRows(book,{category:'slate',query:'합성 D'}),[book.rows[1]]);assert.deepEqual(recipeBookRows(book,{category:'unknown'}),[]);assert.deepEqual(recipeBookRows(book,{query:'없는 재료'}),[]);
});
it('extracts and searches frozen input without altering IR, WTS or the returned book and keeps HTML as inert text',()=>{
 const ir=fixture();ir.objectMods[2].mods[2].value='<img src=x onerror=alert(1)> 합성 재료';const before=JSON.stringify(ir);freeze(ir);const strings=new Map([[7,'변하지 않음']]),book=extractRecipeBook(ir,{strings});freeze(book);
 assert.equal(book.rows[0].description,'<img src=x onerror=alert(1)> 합성 재료');assert.equal(recipeBookRows(book,{query:'<img'}).length,1);assert.equal(JSON.stringify(ir),before);assert.equal(strings.get(7),'변하지 않음');assert.notEqual(recipeBookRows(book),book.rows);
});
const mapPath=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url);
it('derives the actual source handbook: eleven gem recipes plus one guide and twelve slate notes, with original bytes unchanged',{skip:!fs.existsSync(mapPath)},()=>{
 const bytes=fs.readFileSync(mapPath),hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,'0c76d191d2ecbbffe0774b300c121d23945abac4169071e9af73ce5eff374339');
 const {ir,strings}=readScriptMap(new Uint8Array(bytes),'recipe-test'),before=JSON.stringify(ir.objectMods),book=extractRecipeBook(ir,{strings});assert.deepEqual(book.warnings,[]);assert.equal(book.rows.length,24);assert.equal(recipeBookRows(book,{category:'gem'}).length,12);assert.equal(recipeBookRows(book,{category:'slate'}).length,12);
 assert.equal(book.rows.filter((r:any)=>r.source.abilityId==='A031').length,1);assert.equal(book.rows[0].title,'스페셜 보석 조합법');assert.equal(book.rows.filter((r:any)=>r.source.abilityId!=='A03A'&&/필요한.*재료/.test(r.description)).length,23);
 for(const row of book.rows){const original=ir.objectMods.find(o=>o.kind==='ability'&&(o.newId??o.baseId)===row.source.abilityId)!;assert.equal(row.rawTitle,original.mods.find(m=>m.field===row.source.titleField&&(m.level??0)<=1)?.value);assert.equal(row.rawDescription,original.mods.find(m=>m.field==='aub1'&&(m.level??0)<=1)?.value);}
 assert.ok(recipeBookRows(book,{category:'slate',query:'하급 다이아몬드 or 하급 자수정'}).some((r:any)=>r.source.abilityId==='A05V'));assert.equal(JSON.stringify(ir.objectMods),before);assert.equal(createHash('sha256').update(fs.readFileSync(mapPath)).digest('hex'),hash);
});
