import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {MapIR} from '../../src/ir/types.ts';
import {createSession,readScriptMap} from '../../src/runtime/session.ts';
import {createGemTowerSourceDefs} from '../../src/runtime/maps/gemtower.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {ALLIANCE_TYPES} from '../../src/sim/playerstate.ts';
import {vhandle,vint,vreal} from '../../src/jass/vm.ts';
import {rawCodeOf} from '../../src/ir/fourcc.ts';

// Standalone fixture: committed tests must not depend on ignored local helpers.
function irFor(source:string):MapIR{return {irVersion:1,info:{name:'runtime regression',author:'',suggestedPlayers:'1',playableWidth:32,playableHeight:32,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source,nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};}
const baseline=new DefStore();
function boot(source:string){return createSession(irFor(source),{seed:6,defStore:new DefStore({resolve(id){return {...baseline.getDef(id),hpMax:100000,armorValue:0,moveSpeedU:id==='u000'?100:0,attack:id==='h00R'?{dmgBase:10,dmgSpread:0,cooldownTicks:20,rangeU:300,acquireU:300,attackType:'normal',targetsMask:3}:null};}}),gc:makeNeutralGameConstants(),bountyMode:'script'});}
function simpleCombat(victimOwner:number){return boot(`function main takes nothing returns nothing
call CreateUnit(Player(0),'h00R',0.,0.,0.)
call CreateUnit(Player(${victimOwner}),'h01K',50.,0.,0.)
call CreateUnit(Player(11),'h01K',100.,0.,0.)
endfunction`);}

it('replacement retains the live position after ordinary movement and preserves the current owner/facing',()=>{
 const w=boot(`function main takes nothing returns nothing
call CreateUnit(Player(0),'u000',0.,0.,0.)
endfunction`),old=[...w.sim.entities.values()][0]!;
 assert.equal(w.sim.issueMoveOrder(0,old.id,100,0),true);for(let i=0;i<10;i++)w.sim.step();
 assert.equal(old.x,50);assert.equal(w.vm.handles.get(old.id)!.data.x,0,'movement has no redundant handle position authority');
 w.vm.callFunctionSync('SetUnitFacing',[vhandle(old.id),vreal(70)]);
 const replacement=w.vm.callFunctionSync('ReplaceUnitBJ',[vhandle(old.id),vint(rawCodeOf('h007')),vint(3)]);
 assert.equal(replacement.t,'handle');const next=w.sim.getUnit((replacement as {v:number}).v)!;
 assert.equal(next.x,50);assert.equal(next.y,0);assert.equal(next.facing,70);assert.equal(next.owner,0);
 assert.equal(w.sim.getUnit(old.id),undefined);assert.equal(next.hp,next.hpMax);
});

it('automatic acquisition skips a same-owner creep and hits an enemy without changing attack stats',()=>{
 const w=simpleCombat(0),[tower,friendly,enemy]=[...w.sim.entities.values()];w.sim.step();
 assert.equal(friendly!.hp,100000);assert.equal(enemy!.hp,99990);assert.equal(w.defStore.getDef(tower!.typeId).attack!.dmgBase,10);
 assert.deepEqual(w.sim.drainEvents().filter(e=>e.kind==='Attacked').map(e=>e.kind==='Attacked'&&e.targetUnitId),[enemy!.id]);
});
it('automatic acquisition observes existing passive alliances and releases a newly allied retained target',()=>{
 const w=simpleCombat(1),[,ally,enemy]=[...w.sim.entities.values()];w.sim.step();assert.equal(ally!.hp,99990);
 w.sim.playerState.setAlliance(0,1,ALLIANCE_TYPES.ALLIANCE_PASSIVE,true);
 for(let i=0;i<21;i++)w.sim.step();assert.equal(ally!.hp,99990);assert.equal(enemy!.hp,99990);
});
it('an explicit attack on an allied other owner retains the existing order policy',()=>{
 const w=simpleCombat(1),[tower,ally]=[...w.sim.entities.values()];w.sim.playerState.setAlliance(0,1,ALLIANCE_TYPES.ALLIANCE_PASSIVE,true);
 assert.deepEqual(w.vm.callFunctionSync('IssueTargetOrderById',[vhandle(tower!.id),vint(851983),vhandle(ally!.id)]),{t:'bool',v:true});w.sim.step();assert.equal(ally!.hp,99990);
});

for(const id of ['h02S','h02T','h04Q'])it(`hostile ${id} remains targetable through the existing weapon pipeline`,()=>{
 const source=`function main takes nothing returns nothing
call CreateUnit(Player(0),'h00R',0.,0.,0.)
call CreateUnit(Player(11),'${id}',100.,0.,0.)
endfunction`,w=createSession(irFor(source),{seed:6,defStore:baseline,gc:makeNeutralGameConstants(),bountyMode:'engine'}),[tower,enemy]=[...w.sim.entities.values()],hp=enemy!.hp;
 w.sim.step();assert.ok(enemy!.hp<hp);assert.ok(w.sim.drainEvents().some(e=>e.kind==='Attacked'&&e.attackerUnitId===tower!.id&&e.targetUnitId===enemy!.id));
});

for(const id of ['h02S','h02T'])it(`player-owned ${id} keeps its normal weapon and formula stats`,()=>{
 const w=createSession(irFor(`function main takes nothing returns nothing
call CreateUnit(Player(0),'${id}',0.,0.,0.)
call CreateUnit(Player(11),'h01K',100.,0.,0.)
endfunction`),{seed:6,defStore:baseline,gc:makeNeutralGameConstants(),bountyMode:'script'}),[gem,enemy]=[...w.sim.entities.values()],hp=enemy!.hp;
 assert.equal(w.defStore.getDef(id),baseline.getDef(id));w.sim.step();assert.ok(enemy!.hp<hp);
 assert.ok(w.sim.drainEvents().some(e=>e.kind==='Attacked'&&e.attackerUnitId===gem!.id));
});

it('the local source really spawns the dual-role gems as hostile classic event units and their authored stats remain unchanged',t=>{
 const map=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url),stock=new URL('../../fixtures/stock/unit-abilities.json',import.meta.url);
 if(!fs.existsSync(map)||!fs.existsSync(stock)){t.skip('user-local original map/profile required');return;}
 const original=readScriptMap(new Uint8Array(fs.readFileSync(map)),'local'),p=parseUnitAbilityProfile(JSON.parse(fs.readFileSync(stock,'utf8'))),built=createGemTowerSourceDefs(p.units,original.ir.objectMods);
 for(const id of ['h02S','h02T']){
  assert.ok(original.ir.script.source.includes(`CreateNUnitsAtLoc(1,'${id}',Player($B)`));
  const ir=irFor(`function main takes nothing returns nothing
call CreateUnit(Player(0),'h00R',0.,0.,0.)
call CreateUnit(Player(11),'${id}',100.,0.,0.)
endfunction`);ir.objectMods=original.ir.objectMods;
  const w=createSession(ir,{seed:6,defStore:built.defStore,stockUnits:p.units,stockAbilities:p.abilities,gc:makeNeutralGameConstants(),bountyMode:'script'}),enemy=[...w.sim.entities.values()][1]!,hp=enemy.hp;
  assert.deepEqual(w.defStore.getDef(id).attack,built.defStore.getDef(id).attack);assert.equal(w.defStore.getDef(id).hpMax,built.defStore.getDef(id).hpMax);
  w.sim.step();assert.ok(enemy.hp<hp);assert.ok(w.sim.drainEvents().some(e=>e.kind==='Attacked'&&e.targetUnitId===enemy.id));
 }
});

for(const id of ['h02S','h02T'])it(`hostile ${id} death retains single killer, bounty and original-trigger dispatch`,()=>{
 const source=`globals
integer deaths=0
integer killerOwner=-1
endglobals
function Died takes nothing returns nothing
set deaths=deaths+1
set killerOwner=GetPlayerId(GetOwningPlayer(GetKillingUnit()))
call AdjustPlayerStateBJ(7,Player(0),PLAYER_STATE_RESOURCE_GOLD)
endfunction
function main takes nothing returns nothing
local trigger t=CreateTrigger()
call TriggerRegisterAnyUnitEventBJ(t,EVENT_PLAYER_UNIT_DEATH)
call TriggerAddAction(t,function Died)
call SetPlayerFlagBJ(PLAYER_STATE_GIVES_BOUNTY,true,Player(11))
call CreateUnit(Player(0),'h00R',0.,0.,0.)
call CreateUnit(Player(11),'${id}',100.,0.,0.)
endfunction`;
 // Synthetic nonzero reward verifies the common settlement seam; it is not a claim about the original bounty.
 const w=createSession(irFor(source),{seed:6,defStore:baseline,stockUnits:[{kind:'unit',baseId:id,newId:null,mods:[{field:'ubba',value:20},{field:'ubdi',value:1},{field:'ubsi',value:1}]}],gc:makeNeutralGameConstants(),bountyMode:'source'});
 const enemy=[...w.sim.entities.values()][1]!;
 for(let i=0;i<100;i++)w.sim.step();assert.equal(w.sim.getUnit(enemy.id),undefined);
 assert.equal(w.vm.getGlobal('deaths').v,1);assert.equal(w.vm.getGlobal('killerOwner').v,0);
 assert.equal(w.sim.ledger.bySource().bounty.in,21);assert.equal(w.sim.ledger.bySource().script.in,7);assert.equal(w.sim.ledger.gold(0),28);
 assert.equal(w.sim.drainEvents().filter(e=>e.kind==='UnitDied'&&e.unitId===enemy.id).length,1);
});

it('the repaired special-enemy path remains deterministic for equal seeds and inputs',()=>{
 const run=()=>{const w=createSession(irFor(`function main takes nothing returns nothing
call CreateUnit(Player(0),'h00R',0.,0.,0.)
call CreateUnit(Player(11),'h02S',100.,0.,0.)
call CreateUnit(Player(11),'h02T',120.,0.,0.)
endfunction`),{seed:6,defStore:baseline,gc:makeNeutralGameConstants(),bountyMode:'engine'});for(let i=0;i<65;i++)w.sim.step();return {hash:w.sim.stateHash(),events:w.sim.drainEvents()};};
 assert.deepEqual(run(),run());
});
