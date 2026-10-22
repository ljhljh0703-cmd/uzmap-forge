import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Sim} from '../../src/sim/sim.ts';
import {JassVm} from '../../src/jass/vm.ts';
import {parseJass} from '../../src/jass/parser.ts';
import {installNatives} from '../../src/jass/natives/index.ts';
import {GEMTOWER_BALANCE} from '../../src/sim/balance/configs/gemtower.ts';
import {researchCostForLevel} from '../../src/sim/balance/config.ts';
const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
const fn=(name:string)=>source.match(new RegExp('^function '+name+'\\([^\\n]*\\{[\\s\\S]*?^\\}','m'))?.[0]??'';
const start=source.indexOf('  for (const techId of RESEARCH_IDS) {'),end=source.indexOf('  // G-6(DISPATCH_SONNET_G3_G6',start),researchRender=source.slice(start,end);
const hstart=source.indexOf('for (const techId of RESEARCH_IDS) {',end),hend=source.indexOf('const goRestart',hstart),handlers=source.slice(hstart,hend);
function fixture(playing=true){
 const ir:any={irVersion:1,info:{},terrain:{width:1,height:1,tiles:[]},placedUnits:[],objectMods:[],regions:[],script:{source:'',nativesUsed:{}},meta:{}};
 const sim=new Sim(ir,6),jass=JassVm.fromParseResult(parseJass(''));jass.attachToSim(sim);installNatives(jass,sim);sim.researchConfig=GEMTOWER_BALANCE.researches;sim.ledger.adjustGold(0,1000,'script');
 const nodes:any={gameDrawer:{hidden:true},drawerScrim:{hidden:true},researchToggle:{setAttribute(){},focus(){}},drawerClose:{focus(){}},researchStatus:{textContent:''}};
 for(const id of ['R000','R001','R002']){const cost:any={textContent:'',hidden:false,previousSibling:{textContent:''},nextSibling:{textContent:''}};nodes['rs'+id+'Lv']={textContent:''};nodes['rs'+id+'Cost']=cost;nodes['rs'+id+'Btn']={disabled:false,title:'',attrs:{},setAttribute(k:string,v:string){this.attrs[k]=v;}};}
 const world:any={sim,gameOver:null,inputLog:[]},messages:string[]=[];
 const c:any={world,w:world,playing,restoring:false,loadingRun:false,runtimeFailed:false,RESEARCH_IDS:['R000','R001','R002'],GEMTOWER_BALANCE,researchCostForLevel,RESEARCH_REJECT_LABEL:{'insufficient-gold':'골드 부족'},$:(id:string)=>nodes[id],frameClock:{reset(){}},clearPlacement(){},checkpointRun(){},refreshSavedRuns(){},renderControls(){},flash:(s:string)=>messages.push(s),recordInput:(w:any,x:any)=>w.inputLog.push(x),trainingTechName:(_w:any,id:string)=>id};
 c.render=()=>vm.runInNewContext(researchRender,c);vm.runInNewContext(fn('requestResearch')+'\n'+fn('observeResearchResult')+'\n'+fn('setDrawer')+'\n'+handlers,c);c.render();
 return{c,world,sim,nodes,messages,click:()=>nodes.rsR000Btn.onclick(),step(){sim.step();for(const event of sim.drainEvents())if(c.observeResearchResult)c.observeResearchResult(world,event);c.render();}};
}
it('menu navigation preserves both running and deliberately paused state, without stepping the simulation',()=>{
 for(const running of [true,false]){const f=fixture(running),tick=f.sim.tickCount;f.c.setDrawer(true);assert.equal(f.c.playing,running);assert.equal(f.nodes.gameDrawer.hidden,false);f.c.setDrawer(false);assert.equal(f.c.playing,running);assert.equal(f.sim.tickCount,tick);}
});
it('the actual research control accepts one request until the original bridge settles it and then supports the next level with the menu still open',()=>{
 const f=fixture();f.c.setDrawer(true);const gold=f.sim.ledger.gold(0),button=f.nodes.rsR000Btn;f.click();f.click();assert.equal(f.world.inputLog.length,1,'double click cannot queue the next cost before it is displayed');assert.equal(button.disabled,true);assert.equal(button.attrs['aria-busy'],'true');assert.equal(f.sim.getResearchLevel(0,'R000'),0,'no view-owned immediate result');assert.equal(f.sim.ledger.gold(0),gold);
 f.step();assert.equal(f.sim.getResearchLevel(0,'R000'),1);assert.equal(f.sim.ledger.gold(0),gold-20);assert.equal(f.nodes.rsR000Cost.textContent,50);assert.equal(button.disabled,false);assert.equal(f.nodes.rsR000Btn,button);assert.equal(f.nodes.gameDrawer.hidden,false);assert.match(f.nodes.researchStatus.textContent,/1.*레벨/);
 f.click();f.step();assert.equal(f.sim.getResearchLevel(0,'R000'),2);assert.equal(f.sim.ledger.gold(0),gold-70);assert.equal(f.world.inputLog.length,2);assert.equal(f.nodes.rsR000Cost.textContent,80);assert.equal(f.c.playing,true);
});
it('a source rejection releases the pending control and explains the actual failure',()=>{
 const f=fixture();f.click();f.sim.ledger.adjustGold(0,-1000,'script');f.step();assert.equal(f.sim.getResearchLevel(0,'R000'),0);assert.equal(f.world.pendingResearch,null);assert.equal(f.nodes.rsR000Btn.attrs['aria-busy'],'false');assert.match(f.nodes.researchStatus.textContent,/골드/);assert.equal(f.nodes.rsR000Btn.disabled,true);
});
it('a deliberately paused research stays visibly pending until explicit resume, without duplicate orders',()=>{
 const f=fixture(false);f.c.setDrawer(true);f.click();f.click();assert.equal(f.c.playing,false);assert.equal(f.world.inputLog.length,1);assert.match(f.nodes.researchStatus.textContent,/재개/);assert.equal(f.sim.tickCount,0);f.c.playing=true;f.step();assert.equal(f.sim.getResearchLevel(0,'R000'),1);
});
it('research cannot be queued from ended, loading, restoring, failed or other-player views',()=>{
 for(const flag of ['gameOver','restoring','loadingRun','runtimeFailed','spectating']){const f=fixture();if(flag==='gameOver')f.world.gameOver={winner:null};else if(flag==='spectating')f.world.viewPlayerId=1;else f.c[flag]=true;f.click();assert.equal(f.world.inputLog.length,0,flag);assert.equal(f.sim.drainResearchRequests().length,0);}
});
it('the running game event observer wires actual research results back to the existing control',()=>{assert.match(source,/observeResearchResult\(w,\s*ev\)/);});

it('restoring an accepted final-tick research keeps its stale price locked until the source queue completes',()=>{
 const f=fixture(false);f.click();f.world.inputLog[0].tick=0;const before=f.sim.stateHash();f.world.pendingResearch=null;
 const block=source.match(/  \/\/ Restore only the presentation lock[\s\S]*?\/\/ End research presentation restore/);assert.ok(block);vm.runInNewContext(block[0],f.c);f.c.render();assert.equal(f.sim.stateHash(),before);assert.equal(f.nodes.rsR000Btn.disabled,true);f.click();assert.equal(f.world.inputLog.length,1);f.c.playing=true;f.step();assert.equal(f.sim.getResearchLevel(0,'R000'),1);
});
