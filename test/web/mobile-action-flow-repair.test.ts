import * as domState from '../../web/dom-state.js';
import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {gemActions} from '../../web/gem-actions.js';
import {cancelGemTarget} from '../../web/gem-targeting.js';
import {gemActionConditions,showGemAction} from '../../web/play-ui.js';
const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../web/play.css',import.meta.url),'utf8');
function fn(name:string){const body=source.match(new RegExp('function '+name+'\\([^\\n]*\\{[\\s\\S]*?\\n\\}'))?.[0];assert.ok(body,name);return body;}
function selectionFixture(){
 const rock={id:22,alive:true,owner:0,typeId:'h00G'};
 const nodes:any={pathWarning:{},findCombination:{},gameDrawer:{hidden:true},drawerScrim:{hidden:true},researchToggle:{setAttribute(){}},drawerClose:{focus(){}},ownedExplorer:{open:false},gemRoster:{querySelector:()=>({focus(){}})}};
 const world:any={selectedGemId:11,availableComboIds:[22],pendingPointAbility:{unitId:11,abilityId:'A02J'},pendingCombatFocus:true,showRocks:false,sim:{getUnit:(id:number)=>id===22?rock:null},vm:{}};
 const calls:any={renders:0,targets:0,revealed:[]};
 const context:any={gameMenu:{reveal:(id:string)=>calls.revealed.push(id)},world,playing:false,$:(id:string)=>nodes[id],refreshSavedRuns(){},render(){calls.renders++;},cancelGemTarget,gemTowerPlayerGemIds:()=>[],requestGemTarget:()=>{calls.targets++;return true;},availableGemCombinations:()=>[22]};
 vm.runInNewContext(fn('clearPlacement')+'\n'+fn('setDrawer')+'\n'+fn('selectGemById'),Object.assign(context,domState));
 return {world,nodes,calls,context};
}
it('blocked-path rock entry opens the real drawer and explorer before the existing roster selection',()=>{
 const f=selectionFixture();
 const path=source.split('\n').find(line=>line.startsWith('$("pathWarning").onclick='));assert.ok(path);
 const a=source.indexOf('$("gemRoster").addEventListener("click"'),b=source.indexOf('// S-A2d',a);
 f.nodes.gemRoster.addEventListener=(_kind:string,handler:Function)=>f.nodes.gemRoster.click=handler;
 vm.runInNewContext(path+'\n'+source.slice(a,b),Object.assign(f.context,domState));f.nodes.pathWarning.onclick();
 assert.deepEqual(f.calls.revealed,['ownedExplorer']);assert.equal(f.world.showRocks,true);assert.equal(f.nodes.gameDrawer.hidden,false);assert.equal(f.nodes.drawerScrim.hidden,false);assert.equal(f.nodes.ownedExplorer.open,true);
 f.nodes.gemRoster.click({target:{closest:()=>({dataset:{unitId:'22'}})}});assert.equal(f.world.selectedGemId,22,'advertised rock is selectable through the existing roster handler');
});
it('combination candidate selection reuses the common selection cleanup instead of leaving an old move or target armed',()=>{
 for(const pendingTarget of [null,{unitId:11,abilityId:'A05L'}]){
  const f=selectionFixture();f.world.pendingTargetAbility=pendingTarget;
  const a=source.indexOf('$("findCombination").onclick=()=>{'),b=source.indexOf('$("showRocks").onclick',a);
  vm.runInNewContext(source.slice(a,b),Object.assign(f.context,domState));f.nodes.findCombination.onclick();
  assert.equal(f.world.selectedGemId,22);assert.equal(f.world.pendingPointAbility,null);assert.equal(f.world.pendingTargetAbility,null);assert.equal(f.world.pendingCombatFocus,false);assert.equal(f.calls.targets,0);
 }
});
function renderedActions(reason:string){
 const nodes:any={gemCombineGate:{textContent:''}};
 for(const id of ['A009','A007','A00R','A03M','A02G','A008','A02J'])nodes['cast'+id]={};
 const w:any={sim:{mapIr:{objectMods:['A009','A007','A00R','A03M','A02G','A008','A02J'].map(id=>({kind:'ability',newId:id,mods:[{field:'anam',value:'보유 능력 '+id}]}))},validateAbilityOrder:(_p:number,_u:number,id:string)=>['A03M','A02J','A02G','A008'].includes(id)?reason:'missing-ability'}};
 const a=source.indexOf('    const actions = gemActions(w, selected.id);'),b=source.indexOf('\n\n  } else {',a);assert.ok(a>0&&b>a);
 const context:any={w,selected:{id:22},gemActions,$:(id:string)=>nodes[id],showGemAction,gemActionConditions};
 vm.runInNewContext(fn('abilityOrderReason')+'\n'+source.slice(a,b),Object.assign(context,domState));
 return {nodes,reasonText:context.abilityOrderReason(reason)};
}
it('acquired blocked auxiliary actions stay visible with a touch-readable reason instead of a title-only or CSS-hidden reason',()=>{
 for(const reason of ['missing-ability-data','busy','paused']){
  const f=renderedActions(reason);
  for(const id of ['A03M','A02J','A02G','A008']){
   const button=f.nodes['cast'+id];assert.equal(button.disabled,true);assert.equal(button.hidden,false);
   assert.ok(button.textContent.includes(f.reasonText),id+' must expose its reason without hover');
   assert.doesNotMatch(css,new RegExp('#cast'+id+':disabled[^}]*display\\s*:\\s*none'),id+' disabled visibility must follow its acquired state');
  }
 }
});
it('source-unacquired actions remain hidden when the auxiliary visibility rules are repaired',()=>{
 const f=renderedActions('missing-ability');
 for(const id of ['A03M','A02J','A02G','A008'])assert.equal(f.nodes['cast'+id].hidden,true);
});
