import {it} from 'node:test';
import assert from 'node:assert/strict';
import {SpriteBank} from '../../web/visual-assets.js';
import {createCombatAbilityCatalog} from '../../src/runtime/ability-effects.ts';
import {rawCodeOf} from '../../src/ir/fourcc.ts';
const api=await import('../../web/field-effects.js');
const sourceEffects=[{kind:'venom',damagePerSecondPm:1000,durationTicks:10,targetsMask:3},{kind:'poison',damagePerSecondPm:500,durationTicks:10},{kind:'liquidFire',damagePerSecondPm:1000,durationTicks:10,targetsMask:1},{kind:'immolation',pulseDamagePm:100,intervalTicks:2,radiusU:100,targetsMask:3},{kind:'frost',slowPm:200,durationTicks:10,targetsMask:3},{kind:'enemySlowAura',slowPm:100,radiusU:100,targetsMask:1},{kind:'bash',chancePm:100,durationTicks:0,heroDurationTicks:10,targetsMask:3},{kind:'critical',chancePm:100,multiplierPm:2000}];
const def={attack:{targetsMask:1,splash:{fullU:0,halfU:100,quarterU:200}},secondaryAttack:{targetsMask:2}};
it('eight icons describe only supported nonzero source effects and weapon masks without duplication or mutation',()=>{
 const effects=structuredClone(sourceEffects),weapon=structuredClone(def),before=JSON.stringify({effects,weapon}),models=api.effectIconModels(effects,weapon);
 assert.deepEqual(models.map(m=>m.kind),['poison','fire','slow','stun','critical','splash','air','ground']);
 assert.deepEqual(models.map(m=>m.label),['독','화염','감속','기절','치명타','범위 공격','공중 공격','지상 공격']);
 assert.ok(models.every(m=>m.key==='effect:'+m.kind));assert.equal(JSON.stringify({effects,weapon}),before);
 assert.deepEqual(api.effectIconModels(),[]);
});
it('unknown, zero, expired, inactive or merely named effects never invent a status icon',()=>{
 const empty=[{kind:'venom',damagePerSecondPm:0,durationTicks:10},{kind:'poison',damagePerSecondPm:100,durationTicks:0},{kind:'liquidFire',damagePerSecondPm:100,durationTicks:10,targetsMask:0},{kind:'immolation',pulseDamagePm:0,intervalTicks:2,radiusU:100},{kind:'frost',slowPm:0,durationTicks:10},{kind:'enemySlowAura',slowPm:100,radiusU:0},{kind:'bash',chancePm:100,durationTicks:0,heroDurationTicks:0},{kind:'bash',chancePm:0,durationTicks:10},{kind:'critical',chancePm:100,multiplierPm:1000},{kind:'unknown'},{kind:'armorAura',flatBonus:-10,radiusU:500}];
 assert.deepEqual(api.effectIconModels(empty,{attack:{targetsMask:0,splash:{fullU:0,halfU:0,quarterU:0}}}),[]);
 assert.deepEqual(api.effectIconModels(null,null),[]);
 assert.deepEqual(api.effectIconModels([{kind:'frost',slowPm:NaN,durationTicks:10}]),[]);
});
it('resolved Aspo poison exposes its real slow independently from its damage component',()=>{
 const stock=[{kind:'ability',baseId:'Aspo',newId:null,mods:[{field:'adur',value:3,level:1},{field:'atar',value:'ground,air,enemies',level:1}]}],objects=[{kind:'ability',baseId:'Aspo',newId:'A002',mods:[{field:'Spo1',value:2,level:1},{field:'Spo2',value:.15,level:1}]}];
 const effects=createCombatAbilityCatalog(stock as any,objects as any).effects(new Map([[rawCodeOf('A002'),1]])),before=structuredClone(effects);
 assert.deepEqual(effects,[{kind:'poison',damagePerSecondPm:2000,slowPm:150,durationTicks:60,targetsMask:3}]);
 assert.deepEqual(api.effectIconModels(effects).map(m=>m.kind),['poison','slow']);
 const [poison]=effects;
 assert.deepEqual(api.effectIconModels([{...poison,damagePerSecondPm:0}]).map(m=>m.kind),['slow']);
 assert.deepEqual(api.effectIconModels([{...poison,slowPm:0}]).map(m=>m.kind),['poison']);
 for(const invalid of [{...poison,damagePerSecondPm:0,slowPm:0},{...poison,durationTicks:0},{...poison,targetsMask:0}])assert.deepEqual(api.effectIconModels([invalid]),[]);
 assert.deepEqual(effects,before);
});
function canvasRecorder(){const calls:any[]=[];const ctx:any={globalAlpha:1,save(){},restore(){},clearRect(){}};const sprites={draw(_ctx:any,key:string,x:number,y:number,size:number,options:any){calls.push({key,x,y,size,options,alpha:ctx.globalAlpha});return true;}};return {ctx,sprites,calls};}
it('selected field marks cap at two 6px minimum icons entirely within the supplied footprint',()=>{
 for(const size of [5,6,11,12,18,24,64]){
  const r=canvasRecorder(),input={sprites:r.sprites,effects:sourceEffects,def,x:100,y:100,size},before=JSON.stringify(input);
  const count=api.drawFieldEffectMarks(r.ctx,input);assert.ok(count<=2);assert.equal(count,r.calls.length);
  if(size<6)assert.equal(count,0);else assert.ok(count>=1);
  for(const draw of r.calls){assert.ok(draw.size>=6);assert.ok(draw.x-draw.size/2>=100-size/2&&draw.x+draw.size/2<=100+size/2);assert.ok(draw.y-draw.size/2>=100-size/2&&draw.y+draw.size/2<=100+size/2);assert.equal(draw.options.shadow,false);}
  assert.equal(JSON.stringify(input),before);
 }
});
it('actual atlas draw dimensions remain inside the field mark square without stretching or added shadows',async()=>{
 const entries=Object.fromEntries(api.effectIconModels(sourceEffects,def).map((m,index)=>[m.key,{src:'sprites/test-effect.png',frame:{x:0,y:0,w:index%2?200:150,h:index%2?150:200}}]));
 const bank=new SpriteBank({fetch:async()=>({ok:true,json:async()=>({version:1,entries})}),loadImage:async()=>({width:256,height:256})});await bank.load('https://effect.invalid/assets/manifest.json');assert.deepEqual(bank.errors,[]);
 for(const size of [6,11,12,18,24]){const images:any[]=[],ctx:any={save(){},restore(){},translate(x:number,y:number){this.origin=[x,y];},scale(){},drawImage(source:any,sx:number,sy:number,sw:number,sh:number,dx:number,dy:number,width:number,height:number){images.push({left:this.origin[0]+dx,top:this.origin[1]+dy,width,height,ratio:sw/sh});}};
  const count=api.drawFieldEffectMarks(ctx,{sprites:bank,effects:sourceEffects,def,x:100,y:100,size});assert.equal(count,images.length);
  for(const image of images){assert.ok(image.left>=100-size/2&&image.top>=100-size/2&&image.left+image.width<=100+size/2&&image.top+image.height<=100+size/2);assert.ok(Math.abs(image.width/image.height-image.ratio)<.2);}
 }
});
function domFixture(){
 const make=(tag:string):any=>({tagName:tag.toUpperCase(),children:[],attributes:{},style:{},hidden:false,textContent:'',width:0,height:0,parentNode:null,append(...nodes:any[]){for(const n of nodes){n.parentNode=this;this.children.push(n);}},setAttribute(k:string,v:string){this.attributes[k]=v;},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter((n:any)=>n!==this);},getContext:()=>({clearRect(){}})});
 return {document:{createElement:make},host:make('section')};
}
it('mounted labels survive missing art and retry successfully without duplicate nodes or host damage',()=>{
 const f=domFixture(),other=f.document.createElement('p');f.host.append(other);let ready=false,draws=0;
 const sprites={draw(_ctx:any,key:string,x:number,y:number,size:number,options:any){draws++;assert.equal(size,24);assert.equal(options.shadow,false);return ready;}};
 const mounted=api.mountEffectIcons({...f,sprites}),effects=[sourceEffects[0]],before=JSON.stringify(effects);
 mounted.render({effects});const list=f.host.children[1],row=list.children[0],canvas=row.children[0],label=row.children[1];
 assert.equal(canvas.hidden,true);assert.equal(label.textContent,'독');assert.equal(list.hidden,false);assert.equal(list.attributes['aria-label'],'보석 효과');
 ready=true;mounted.render({effects});assert.equal(canvas.hidden,false);assert.equal(list.children.length,1);assert.equal(draws,2);assert.equal(JSON.stringify(effects),before);
 mounted.render({effects:[]});assert.equal(list.hidden,true);mounted.destroy();assert.deepEqual(f.host.children,[other]);mounted.render({effects});assert.deepEqual(f.host.children,[other]);
});
it('field feedback deduplicates valid keys, bounds active population and expires without late re-emission',()=>{
 let now=0;const f=api.createFieldFeedback({now:()=>now});const event={kind:'gold',key:'run:gold:1',x:1,y:2,space:'world'};
 assert.ok(f.emit(event));assert.equal(f.emit(event),null);const copy=f.snapshot();copy.active[0].x=999;assert.equal(f.snapshot().active[0].x,1);
 for(let n=0;n<20;n++)f.emit({...event,key:'new'+n});assert.equal(f.snapshot().active.length,8);
 now=2000;assert.equal(f.snapshot().active.length,0);assert.equal(f.emit(event),null);assert.equal(f.emit({...event,kind:'requested',key:'bad'}),null);assert.equal(f.emit({...event,x:NaN,key:'invalid'}),null);
});
it('suppressed restore events never replay after recovery or clear and unknown kinds never draw',()=>{
 const f=api.createFieldFeedback({now:()=>0}),event={kind:'combine',key:'restore:1',x:10,y:20,space:'screen'};
 assert.equal(f.emit({...event,suppressed:true}),null);assert.equal(f.emit(event),null);assert.equal(f.snapshot().active.length,0);
 f.emit({...event,key:'ordinary'});f.clear();assert.equal(f.snapshot().active.length,0);assert.equal(f.emit({...event,key:'ordinary'}),null);
 const r=canvasRecorder();f.draw(r.ctx,r.sprites,()=>{throw Error('must not project');});assert.equal(r.calls.length,0);
});
it('world positions project only while drawing and reduced motion remains static, smaller and shadow-free',()=>{
 let now=0,projects=0;const normal=api.createFieldFeedback({now:()=>now,reducedMotion:()=>false}),quiet=api.createFieldFeedback({now:()=>now,reducedMotion:()=>true});
 const event={kind:'life',key:'life:1',x:10,y:20,space:'world'};normal.emit(event);quiet.emit(event);assert.equal(projects,0);
 const n=canvasRecorder(),q=canvasRecorder(),project=(p:any)=>{projects++;return{x:p.x*2,y:p.y*3};};normal.draw(n.ctx,n.sprites,project);quiet.draw(q.ctx,q.sprites,project);now=200;normal.draw(n.ctx,n.sprites,project);quiet.draw(q.ctx,q.sprites,project);
 assert.equal(n.calls[0].x,20);assert.equal(n.calls[0].y,60);assert.ok(n.calls[1].y<n.calls[0].y);assert.equal(q.calls[0].y,q.calls[1].y);assert.ok(q.calls[0].size<n.calls[0].size);assert.ok(q.calls.every(d=>d.options.shadow===false&&d.options.tick===0));
 const screen=api.createFieldFeedback({now:()=>0});screen.emit({...event,key:'s',space:'screen'});screen.draw(q.ctx,q.sprites,()=>{throw Error('screen not projected');});assert.equal(q.calls.at(-1).x,10);
});
it('failed sprite loads can recover within the cue lifetime but never queue an expired celebration',()=>{
 let now=0,ready=false,drawn=0;const f=api.createFieldFeedback({now:()=>now});f.emit({kind:'combine',key:'1',x:10,y:20,space:'screen'});
 const bank={draw(){if(!ready)return false;drawn++;return true;}},r=canvasRecorder();assert.equal(f.draw(r.ctx,bank),0);ready=true;assert.equal(f.draw(r.ctx,bank),1);now=2000;assert.equal(f.draw(r.ctx,bank),0);assert.equal(drawn,1);
});
it('screen feedback stays inside a short canvas after motion while world and canvas-less coordinates remain unchanged',()=>{
 for(const reduced of [false,true]){
  let now=0;const f=api.createFieldFeedback({now:()=>now,reducedMotion:()=>reduced}),r=canvasRecorder();r.ctx.canvas={width:90,height:64};
  const events=[{kind:'gold',key:'lower',x:120,y:122,space:'screen'},{kind:'life',key:'upper',x:-20,y:3,space:'screen'},{kind:'combine',key:'world',x:120,y:122,space:'world'}],before=structuredClone(events);events.forEach(event=>f.emit(event));
  for(const at of [0,200]){now=at;r.calls.length=0;f.draw(r.ctx,r.sprites,(p:any)=>({x:p.x+5,y:p.y+7}));assert.equal(r.calls.length,3);
   for(const d of r.calls.slice(0,2)){const half=d.size/2;assert.ok(d.x>=half&&d.x<=90-half);assert.ok(d.y>=half&&d.y<=64-half);}
   assert.equal(r.calls[2].x,125);assert.equal(r.calls[2].y,129-(reduced?0:at/760*12));
  }
  assert.deepEqual(events,before);assert.equal(f.snapshot().active[0].y,122);
 }
 const free=api.createFieldFeedback({now:()=>0}),r=canvasRecorder();free.emit({kind:'gold',key:'free',x:120,y:122,space:'screen'});free.draw(r.ctx,r.sprites);assert.equal(r.calls[0].x,120);assert.equal(r.calls[0].y,122);
});

it('confirmed damage numbers merge by enemy, remain capped at six and never infer critical from amount',()=>{assert.equal(typeof api.addDamageTag,'function');let tags:any[]=[];for(let i=1;i<=40;i++)tags=api.addDamageTag(tags,{unitId:i,x:50,y:80,amount:10},0);assert.equal(tags.length,6);tags=api.addDamageTag(tags,{unitId:40,x:50,y:80,amount:999},30);assert.equal(tags.at(-1).amount,1009);assert.equal(tags.at(-1).critical,false);assert.equal(api.addDamageTag(tags,{unitId:40,x:50,y:80,amount:-1},40).length,6);});
it('damage labels are laid out above actual creep boxes and omitted if no free position exists',()=>{const boxes=[{id:1,x:20,y:70,width:40,height:40},{id:2,x:48,y:38,width:40,height:40}],tags=[{unitId:1,x:40,y:100,amount:16,born:0,critical:false}];const view=api.damageTagViews(tags,p=>p,{now:100,boxes,viewport:{left:0,top:0,width:160,height:160},measure:()=>24});assert.ok(view.length);for(const row of view){for(const box of boxes)assert.ok(row.left+row.width<=box.x||row.left>=box.x+box.width||row.top+row.height<=box.y||row.top>=box.y+box.height);assert.equal(row.fontSize,12);}const none=api.damageTagViews(tags,p=>p,{now:100,boxes:[{id:1,x:0,y:0,width:160,height:160}],viewport:{left:0,top:0,width:160,height:160},measure:()=>24});assert.equal(none.length,0);});
it('reduced motion keeps damage labels static and gold pickup uses one exact observed aggregate without movement',()=>{const tags=[{unitId:1,x:80,y:90,amount:99,born:0,critical:true}],opts={boxes:[],viewport:{left:0,top:0,width:160,height:160},measure:()=>24,reducedMotion:true};const a=api.damageTagViews(tags,p=>p,{...opts,now:0})[0],b=api.damageTagViews(tags,p=>p,{...opts,now:200})[0];assert.equal(a.y,b.y);assert.equal(a.fontSize,16);assert.deepEqual(api.goldGainView([{amount:7,born:0}],200,true),{text:'+7 골드',dy:0,opacity:1});assert.equal(api.goldGainView([{amount:7,born:0}],900),null);});

it('sixty-creep controlled phone and PC layouts never paint a damage rectangle on a body and keep bounded view slots',()=>{for(const width of [390,1440]){const height=width===390?452:724,boxes=Array.from({length:60},(_,i)=>({id:i+1,x:10+(i%10)*(width-20)/10,y:60+Math.floor(i/10)*48,width:28,height:32})),tags=boxes.slice(0,6).map(b=>({unitId:b.id,x:b.x+14,y:b.y+26,amount:999999,born:0,critical:false}));const views=api.damageTagViews(tags,p=>p,{now:100,boxes,viewport:{left:0,top:0,width,height},measure:t=>t.length*7});assert.ok(views.length>0);assert.ok(views.length<=6);for(const v of views)for(const b of boxes)assert.ok(v.left+v.width<=b.x||v.left>=b.x+b.width||v.top+v.height<=b.y||v.top>=b.y+b.height);}});
