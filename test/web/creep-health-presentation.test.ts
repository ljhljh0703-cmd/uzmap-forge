import {it} from 'node:test';
import assert from 'node:assert/strict';
import * as art from '../../web/field-units.js';
import {createSession} from '../../src/runtime/session.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {makeSyntheticIr} from '../sim/helpers.ts';
import {vint,vreal} from '../../src/jass/vm.ts';
import {rawCodeOf} from '../../src/ir/fourcc.ts';
import {GEMTOWER_BALANCE} from '../../src/sim/balance/configs/gemtower.ts';
const options={sourceMode:2,difficulty:1,creepLifePercent:25};
const role=(wave=1)=>({kind:'creep',wave});
const entity=(hp=3,hpMax=13,typeId='h00D')=>({id:17,typeId,hp,hpMax});
const view=(e:any,o:any=options,...roles:any[])=>{assert.equal(typeof (art as any).creepHealthPresentation,'function');return (art as any).creepHealthPresentation(e,o,roles.length?roles[0]:role());};
it('a fresh source-scaled easy creep is full relative to its original post-spawn life without changing the entity',()=>{
 const e=Object.freeze(entity()),before=JSON.stringify(e);assert.deepEqual(view(e),{hp:3,maxHp:3});assert.equal(JSON.stringify(e),before);
});
it('normal only scales authored wave35 onward; later current round cannot change an older creep',()=>{
 const e=Object.freeze(entity(776082,776082,'h03K'));
 assert.equal(view(e,{sourceMode:2,difficulty:2,creepLifePercent:50,currentRound:50},role(34)).maxHp,776082);
 assert.equal(view(e,{sourceMode:2,difficulty:2,creepLifePercent:50,currentRound:1},role(35)).maxHp,388041);
 assert.equal(view(entity(13),{sourceMode:2,difficulty:2,creepLifePercent:50,currentRound:50},role(1)).maxHp,13);
 assert.equal(view(e,{sourceMode:2,difficulty:3,creepLifePercent:25},role(35)).maxHp,776082);
});
it('classic, unknown mode or difficulty and unconfirmed roles keep their raw source maximum',()=>{
 for(const sourceMode of [undefined,null,0,1,'2'])assert.deepEqual(view(entity(),{...options,sourceMode}),{hp:3,maxHp:13});
 for(const difficulty of [undefined,null,0,3,4,'1'])assert.equal(view(entity(),{...options,difficulty}).maxHp,13);
 for(const r of [undefined,null,{}, {kind:'static',wave:1},{kind:'creep'},{kind:'creep',wave:0},{kind:'creep',wave:51},{kind:'creep',wave:1.5}])assert.equal(view(entity(),options,r).maxHp,13);
});
it('the two Wae exceptions remain raw even if a caller supplies a creep role',()=>{
 for(const typeId of ['h04Q','H04B'])for(const difficulty of [1,2])assert.deepEqual(view(entity(50,100,typeId),{...options,difficulty},role(35)),{hp:50,maxHp:100});
});
it('same-tick damage, healing above initial life and rederived restored views do not learn a damaged frame as a maximum',()=>{
 const first=Object.freeze(entity(2));assert.deepEqual(view(first),{hp:2,maxHp:3});
 const healing=Object.freeze(entity(7));assert.deepEqual(view(healing),{hp:7,maxHp:3});
 const restored=JSON.parse(JSON.stringify(first));assert.deepEqual(view(restored),view(first));
 assert.deepEqual(view(entity(1)),{hp:1,maxHp:3});assert.deepEqual(view(entity(3)),{hp:3,maxHp:3});
});
it('missing or nonfinite scale data is not guessed and invalid source maxima are retained for renderer rejection',()=>{
 for(const creepLifePercent of [undefined,null,NaN,Infinity,'25'])assert.equal(view(entity(),{...options,creepLifePercent}).maxHp,13);
 for(const hpMax of [0,-1,NaN,Infinity,undefined])assert.equal(view({hp:1,hpMax,typeId:'h00D'}).maxHp,hpMax);
 assert.deepEqual(view(null),{hp:undefined,maxHp:undefined});
});
it('denominators exactly match the real native multiplication, rounding and clamp at scalar boundaries',()=>{
 for(const maximum of [1,2,3,13,100,101,776082]){
  const ir=makeSyntheticIr(),base=new DefStore().getDef('h007'),s=createSession(ir,{seed:6,defStore:new DefStore({resolve:()=>({...base,hpMax:maximum})}),gc:makeNeutralGameConstants()});
  for(const percent of [-10,0,.1,12.5,25,33.333333,50,99.9,100,150]){
   const h=s.vm.callFunctionSync('CreateUnit',[s.vm.callFunctionSync('Player',[vint(11)]),vint(rawCodeOf('h007')),vreal(0),vreal(0),vreal(0)]);assert.equal(h.t,'handle');const e=s.sim.getUnit(h.v)!;assert.equal(e.hpMax,maximum);
   s.vm.callFunctionSync('SetUnitLifePercentBJ',[h,vreal(percent)]);
   const hash=s.sim.stateHash(),result=view(e,{...options,creepLifePercent:percent});assert.equal(result.maxHp,e.hp,`${maximum} x ${percent}%`);assert.equal(s.sim.stateHash(),hash,'view derivation does not alter entity, handles or RNG');
  }
 }
});

// Scalar source facts only, not a bundled Warcraft file. Direct original b[1..50]
// audit and its input SHA are preserved in health-audit/VIEW-PARITY.json.
it('all fifty pinned source wave IDs have a unique matching immutable role wave for presentation',()=>{
 const ids=["h00D", "h00Z", "h010", "h011", "h012", "h013", "h01C", "h01D", "h01E", "h01F", "h01G", "h01H", "h01I", "h01J", "h01K", "h01L", "h02I", "h037", "h038", "h01R", "h039", "h03A", "h03B", "h01X", "h03C", "h03D", "h03E", "h021", "h03F", "h03G", "h03H", "h025", "h03I", "h03J", "h03K", "h02B", "h03L", "h03M", "h03N", "h02F", "h03O", "h03P", "h04K", "h04I", "h04L", "h04M", "h04N", "h04J", "h04O", "h04P"];
 assert.equal(new Set(ids).size,50);
 for(const [index,id] of ids.entries()){const role=GEMTOWER_BALANCE.roleTable[id];assert.equal(role?.kind,'creep');assert.equal(role?.wave,index+1,id);}
});
