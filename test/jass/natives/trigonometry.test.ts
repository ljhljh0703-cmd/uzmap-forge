import {it} from 'node:test';
import assert from 'node:assert/strict';
import {parseJass} from '../../../src/jass/parser.ts';
import {JassVm,vreal,vint} from '../../../src/jass/vm.ts';
import {Sim} from '../../../src/sim/sim.ts';
import {installNatives} from '../../../src/jass/natives/index.ts';
import {makeSyntheticIr} from '../../sim/helpers.ts';
const boot=(source='')=>{const vm=JassVm.fromParseResult(parseJass(source)),sim=new Sim(makeSyntheticIr(),6);vm.attachToSim(sim);installNatives(vm,sim);return{vm,sim};};
it('radian sine/cosine accept integer and real inputs without consuming game RNG',()=>{const {vm,sim}=boot(),state=sim.rng.getState();for(const [angle,cos,sin]of [[0,1,0],[Math.PI/2,0,1],[Math.PI,-1,0],[-Math.PI/2,0,-1]]){for(const [name,want]of [['Cos',cos],['Sin',sin]]as const){const v=vm.callFunctionSync(name,[vreal(angle)]);assert.equal(v.t,'real');assert.ok(Math.abs(Number(v.v)-want)<1e-10,name+':'+angle);}}assert.deepEqual(vm.callFunctionSync('Cos',[vint(0)]),vreal(1));assert.equal(sim.rng.getState(),state);assert.equal(vm.drainEvents().some(e=>e.kind==='UnimplementedNative'),false);});
it('degree conversion is installed alongside trig, so polar offsets retain all four directions',()=>{const{vm}=boot(`function X takes real d returns real
return 100.+400.*Cos(d*bj_DEGTORAD)
endfunction
function Y takes real d returns real
return 200.+400.*Sin(d*bj_DEGTORAD)
endfunction`);for(const [deg,x,y]of [[0,500,200],[90,100,600],[180,-300,200],[270,100,-200]]){assert.ok(Math.abs(Number(vm.callFunctionSync('X',[vreal(deg)]).v)-x)<.002,'source 1.28 degree conversion');assert.ok(Math.abs(Number(vm.callFunctionSync('Y',[vreal(deg)]).v)-y)<.002,'source 1.28 degree conversion');}assert.equal(vm.drainEvents().some(e=>e.kind==='UndefinedGlobal'),false);});
it('a nearby-slate retry using the same native path separates instead of retrying forever',()=>{const src=`globals
real x=0.
real y=0.
integer retries=0
endglobals
function Separate takes nothing returns nothing
loop
exitwhen SquareRoot(x*x+y*y)>220.
set retries=retries+1
set x=x+400.*Cos(90.*bj_DEGTORAD)
set y=y+400.*Sin(90.*bj_DEGTORAD)
call TriggerSleepAction(.1)
endloop
endfunction`;const{vm,sim}=boot(src);vm.spawnThread('Separate',[]);for(let i=0;i<200;i++)sim.step();assert.deepEqual(vm.getGlobal('retries'),vint(1));assert.ok(Math.abs(Number(vm.getGlobal('y').v)-400)<.002,'source 1.28 degree conversion');assert.equal(vm.drainEvents().some(e=>e.kind==='ThreadBudgetExceeded'||e.kind==='ThreadCrashed'),false);});
it('attack-start callbacks expose zero event damage rather than unit attack power',()=>{const{vm}=boot();assert.deepEqual(vm.callFunctionSync('GetEventDamage',[]),vreal(0));assert.equal(vm.drainEvents().some(e=>e.kind==='UnimplementedNative'),false);});
