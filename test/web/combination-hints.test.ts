import {it} from 'node:test';import assert from 'node:assert/strict';
import {combinationHints} from '../../web/combination-hints.js';
import {gemActions} from '../../web/gem-actions.js';import {rawCodeOf} from '../../src/ir/fourcc.ts';
const empty=()=>({combinableIds:[],specialType:null,priorityRecipeIds:[]});
function fixture(){
 const units=new Map<number,any>(),calls:any[]=[],cReads:any[]=[];let sourceC:any={t:'int',v:rawCodeOf('h03X')};
 const w:any={viewPlayerId:0,gameOver:null,recipeBook:{rows:[{id:'gem:A03G',title:'공작석'},{id:'gem:A02Z',title:'은'}]},sim:{gameOver:null,mapIr:{objectMods:[]},getUnit:(id:number)=>units.get(id),abilityRange:()=>500,validateAbilityOrder(_player:number,id:number,ability:string){calls.push([id,ability]);const u=units.get(id);return !u?.alive?'missing-unit':u.owner!==0?'not-owner':!u.abilities.has(rawCodeOf(ability))?'missing-ability':u.reasons?.[ability]??null;}},vm:{getGlobalIndexed(name:string,index:number){cReads.push([name,index]);return sourceC;}}};
 const add=(id:number,abilities:string[]=[],over:any={})=>{const unit={id,typeId:'h007',owner:0,alive:true,abilities:new Map(abilities.map(a=>[rawCodeOf(a),1])),...over};units.set(id,unit);return unit;};
 const run=(ids:any[],options:any={ready:true})=>combinationHints(w,ids,options);
 return {w,units,calls,cReads,add,run,setC:(c:any)=>sourceC=c};
}
it('defaults to hidden until the source hand is ready and never queries commands or result state',()=>{
 const f=fixture();f.add(1,['A00R']);assert.deepEqual(combinationHints(f.w,[1]),empty());assert.deepEqual(f.run([1],{ready:false}),empty());assert.equal(f.calls.length,0);assert.equal(f.cReads.length,0);
});
it('uses actual gemActions enabled results for A007, A00R and A03M in current slot order',()=>{
 const f=fixture();f.add(1,['A007']);f.add(2,['A00R']);f.add(3,['A03M']);f.add(4,['A009']);f.add(5,['A007'],{reasons:{A007:'busy'}});
 const ids=[1,2,3,4,5],before=structuredClone([...f.units]);const actual=f.run(ids);
 assert.deepEqual(actual.combinableIds,ids.filter(id=>gemActions(f.w,id).some((a:any)=>['A007','A00R','A03M'].includes(a.abilityId)&&!a.disabled)));
 assert.deepEqual(actual.combinableIds,[1,2,3]);assert.deepEqual([...f.units],before);assert.deepEqual(ids,[1,2,3,4,5]);assert.deepEqual(f.cReads,[['c',1]]);
});
it('never leaks retained gems outside five supplied slots, dead IDs or duplicates into slot hints',()=>{
 const f=fixture();for(let id=1;id<=7;id++)f.add(id,['A007']);f.units.get(3).alive=false;
 assert.deepEqual(f.run([1,1,3,4,5,6,7]).combinableIds,[1,4,5]);assert.ok(f.calls.every(([id])=>![3,6,7].includes(id)));
 assert.deepEqual(f.run([0,-1,NaN,99,2]).combinableIds,[2]);
});
it('hides hints on game over, spectator fields and non-local player options without changing control state',()=>{
 for(const kind of ['view','player','ui-ended','sim-ended']){
  const f=fixture();f.add(1,['A00R']);if(kind==='view')f.w.viewPlayerId=1;if(kind==='ui-ended')f.w.gameOver={winner:null};if(kind==='sim-ended')f.w.sim.gameOver={winner:null};
  assert.deepEqual(f.run([1],{ready:true,playerId:kind==='player'?1:0}),empty(),kind);assert.equal(f.calls.length,0);assert.equal(f.cReads.length,0);
 }
});
it('normal combination and slate-only actions do not read a stale special-gem c slot',()=>{
 const f=fixture();f.add(1,['A007']);f.add(2,['A03M']);f.w.vm.getGlobalIndexed=()=>{throw Error('stale c must not be consulted');};
 assert.deepEqual(f.run([1,2]),{combinableIds:[1,2],specialType:null,priorityRecipeIds:[]});
});
it('a source-enabled special combine reads its original c result and prioritizes the matching original handbook row only',()=>{
 const f=fixture();f.add(1,['A00R']);assert.deepEqual(f.run([1]),{combinableIds:[1],specialType:'h03X',priorityRecipeIds:['gem:A03G']});
 f.setC({t:'int',v:rawCodeOf('h01A')});assert.deepEqual(f.run([1]).priorityRecipeIds,['gem:A02Z']);
 f.w.recipeBook.rows=[];assert.deepEqual(f.run([1]),{combinableIds:[1],specialType:'h01A',priorityRecipeIds:[]});
});
it('all eleven source-result/handbook identity links are metadata, while two source recipes remain absent from the book',()=>{
 const f=fixture();f.add(1,['A00R']);const declared=[['h01B','A038'],['h018','A031'],['h017','A033'],['h016','A030'],['h019','A037'],['h014','A035'],['h01A','A02Z'],['h01O','A036'],['h01N','A034'],['h029','A032'],['h03X','A03G']];
 f.w.recipeBook.rows=declared.map(([,ability])=>({id:'gem:'+ability}));
 for(const [type,ability]of declared){f.setC({t:'int',v:rawCodeOf(type)});assert.deepEqual(f.run([1]).priorityRecipeIds,['gem:'+ability]);}
 for(const type of ['h015','h040']){f.setC({t:'int',v:rawCodeOf(type)});assert.deepEqual(f.run([1]),{combinableIds:[1],specialType:type,priorityRecipeIds:[]});}
});
it('invalid c values do not invent a result or hide legitimately acquired combination actions',()=>{
 const f=fixture();f.add(1,['A00R']);for(const value of [{t:'real',v:rawCodeOf('h03X')},{t:'int',v:0},{t:'int',v:-1},{t:'int',v:NaN},{t:'int',v:Infinity},{t:'int',v:1},{t:'int',v:0x100000000}]){f.setC(value);assert.deepEqual(f.run([1]),{combinableIds:[1],specialType:null,priorityRecipeIds:[]});}
});
it('source validator ownership and rejection changes immediately govern hints without granting or casting an ability',()=>{
 const f=fixture();const unit=f.add(1,['A00R'],{owner:9});assert.deepEqual(f.run([1]),empty());unit.owner=0;assert.equal(f.run([1]).specialType,'h03X');unit.reasons={A00R:'busy'};assert.deepEqual(f.run([1]),empty());
 assert.deepEqual([...unit.abilities],[[rawCodeOf('A00R'),1]]);
});
it('repeated queries preserve world observations and return independent result arrays',()=>{
 const f=fixture();f.add(1,['A00R']);const before=structuredClone({units:[...f.units],book:f.w.recipeBook}),first=f.run([1]);first.combinableIds.length=0;first.priorityRecipeIds.push('bogus');
 for(let i=0;i<20;i++)assert.deepEqual(f.run([1]),{combinableIds:[1],specialType:'h03X',priorityRecipeIds:['gem:A03G']});assert.deepEqual({units:[...f.units],book:f.w.recipeBook},before);
});

it('optional badge kinds use only already-enabled source action identities and leave the default API intact',()=>{const f=fixture();f.add(1,['A007']);f.add(2,['A00R']);f.add(3,['A007','A00R','A03M']);f.add(4,['A007'],{reasons:{A007:'busy'}});const result=f.run([1,2,3,4],{ready:true,includeKinds:true});assert.deepEqual(result.kindsById,{'1':['A007'],'2':['A00R'],'3':['A007','A00R','A03M']});assert.deepEqual(result.combinableIds,[1,2,3]);assert.ok(!Object.hasOwn(f.run([1]),'kindsById'));assert.deepEqual(f.run([1],{ready:false,includeKinds:true}).kindsById,{});});
