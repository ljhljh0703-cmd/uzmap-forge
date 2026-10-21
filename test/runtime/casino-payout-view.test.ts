import {it} from 'node:test';import assert from 'node:assert/strict';
import {createSession} from '../../src/runtime/session.ts';import {gemTowerCasinoState} from '../../src/runtime/maps/gemtower.ts';import {DefStore} from '../../src/sim/def-store.ts';import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';import {makeSyntheticIr} from '../sim/helpers.ts';
function fixture(missing=false){const ir=makeSyntheticIr();ir.script.source=`globals
unit array qv
boolean array Qv
boolean array uv
unit bO=null
unit aO=null
${missing?'':'integer array GR\ninteger array hR\ninteger array HR\ninteger array eI\ninteger array zR'}
endglobals
function Bonus takes nothing returns nothing
${missing?'':'set eI[1]=6\nset zR[1]=4'}
endfunction
function main takes nothing returns nothing
set qv[1]=CreateUnit(Player(8),'h043',0.,0.,0.)
set qv[7]=CreateUnit(Player(8),'h043',1.,0.,0.)
set bO=CreateUnit(Player(8),'n007',10.,0.,0.)
set aO=CreateUnit(Player(8),'n007',20.,0.,0.)
${missing?'':'set GR[1]=35\nset hR[1]=80\nset HR[1]=200\nset GR[7]=30\nset hR[7]=90\nset HR[7]=230\nset eI[1]=5\nset eI[2]=6\nset zR[1]=0\nset zR[2]=2'}
endfunction`;return createSession(ir,{seed:6,defStore:new DefStore({resolve:()=>({hpMax:100,mana:0,armorValue:0,armorType:'none',attack:null,moveSpeedU:0,collisionU:0,goldCost:0,bounty:{base:0,spreadPm:0},regenPmPerSec:0,meta:{role:{kind:'static',archetype:'test'},source:'formula'}})}),gc:makeNeutralGameConstants(),bountyMode:'script'});}
it('observes each original station base and current player factors without spending, advancing or changing state',()=>{
 const w=fixture(),hash=w.sim.stateHash(),gold=w.sim.ledger.gold(0),tick=w.sim.tickCount,c=gemTowerCasinoState(w.vm,w.sim);
 assert.deepEqual(c.stations.map(s=>[s.index,s.payout.base,s.payout.two,s.payout.three,s.payout.jackpot]),[[1,{two:35,three:80,jackpot:200},175,400,{min:600,max:1200}],[7,{two:30,three:90,jackpot:230},150,450,{min:690,max:1380}]]);
 assert.equal(c.stations[0]!.payout.factor,5);assert.deepEqual(c.stations[0]!.payout.jackpotMultiplier,{min:3,max:6});assert.equal(w.sim.stateHash(),hash);assert.equal(w.sim.tickCount,tick);assert.equal(w.sim.ledger.gold(0),gold);
});
it('uses live bonuses and the viewing player rather than a fixed factor or the neutral station owner',()=>{
 const w=fixture();w.vm.callFunctionSync('Bonus',[]);const hash=w.sim.stateHash(),p=gemTowerCasinoState(w.vm,w.sim).stations[0]!.payout;
 assert.equal(p.two,210);assert.equal(p.three,480);assert.deepEqual(p.jackpot,{min:600,max:2000});assert.deepEqual(p.jackpotMultiplier,{min:3,max:10});assert.equal(w.sim.stateHash(),hash);
 const other=gemTowerCasinoState(w.vm,w.sim,1).stations[0]!.payout;assert.equal(other.two,210);assert.deepEqual(other.jackpot,{min:600,max:1600});
});
it('missing source arrays remain unknown instead of borrowing static defaults or inventing zero prizes',()=>{
 const w=fixture(true),p=gemTowerCasinoState(w.vm,w.sim).stations[0]!.payout;
 assert.equal(p.two,null);assert.equal(p.three,null);assert.deepEqual(p.base,{two:null,three:null,jackpot:null});assert.equal(p.factor,null);assert.deepEqual(p.jackpot,{min:null,max:null});
});
