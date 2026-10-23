import {it} from 'node:test';
import assert from 'node:assert/strict';
import {SpriteBank} from '../../web/visual-assets.js';
const units=await import('../../web/field-units.js');

function recorder(){
 const images:any[]=[],ellipses:any[]=[],draws:any[]=[];
 const ctx:any={save(){},restore(){},translate(x:number,y:number){this.origin=[x,y];},scale(){},beginPath(){},ellipse(...args:any[]){ellipses.push({args,color:this.fillStyle});},fill(){},drawImage(...args:any[]){images.push({args,origin:this.origin});}};
 const bank={get:(key:string)=>({spec:{frame:{x:0,y:0,w:80,h:key.startsWith('pedestal')?32:80}}}),draw(_ctx:any,key:string,x:number,y:number,size:number,options:any){draws.push({key,x,y,size,options});return true;}};
 return {ctx,images,ellipses,draws,bank};
}

it('six source grade names and existing perfect alias select distinct rings without grading unknown objects',()=>{
 const labels=['최하급','하급','중급','상급','최상급','완벽한'];
 labels.forEach((label,index)=>{
  assert.equal(units.fieldGradeIndex(label),index);
  assert.equal(units.fieldGradeIndex(`|cffff0000${label} 루비|r`),index);
  assert.equal(units.fieldGradeIndex(index),index);
 });
 assert.equal(units.fieldGradeIndex('퍼펙트 루비'),5);
 assert.equal(units.fieldGradeIndex('완벽한'),5);
 for(const unknown of [undefined,null,'슬레이트','보석','중급처럼 보이는 바위','unknown',-1,6,NaN])assert.equal(units.fieldGradeIndex(unknown),null);
 assert.deepEqual(units.FIELD_GRADE_COLORS,['#ada99c','#46a250','#368ac6','#a66ec7','#e6bb46','#d95d50']);
 assert.equal(new Set(units.FIELD_GRADE_COLORS).size,6);
});

it('gem plans retain the native gem square and keep the pedestal inside the exact same footprint',()=>{
 for(const size of [12,18,19.5,24,64])for(let grade=0;grade<6;grade++)for(const selected of [false,true]){
  const input={x:100,y:100,size,grade,selected},before=structuredClone(input),plan=units.fieldGemPlan(input);
  assert.deepEqual(plan.gem,{x:100,y:100,size,anchor:.5});
  assert.equal(plan.pedestalKey,`pedestal:${selected?'selected:':''}${grade}`);
  const box=plan.pedestal;
  assert.ok(box.width>0&&box.height>0);
  assert.ok(box.x-box.width/2>=100-size/2&&box.x+box.width/2<=100+size/2);
  assert.ok(box.y-box.height/2>=100-size/2&&box.y+box.height/2<=100+size/2);
  assert.deepEqual(input,before);
 }
 assert.equal(units.fieldGemPlan({x:0,y:0,size:0}),null);
 assert.equal(units.fieldGemPlan({x:NaN,y:0,size:18}),null);
 assert.equal(units.fieldGemPlan({x:0,y:0,size:18,grade:'슬레이트'}).pedestalKey,null);
});

it('pedestal draws first while the original gem logical key, tint, tick and size remain intact',()=>{
 const r=recorder(),input={sprites:r.bank,logical:'gem:ruby:3',x:40,y:50,size:18,grade:'상급 루비',selected:true,tint:'#cc3344',tick:70},before=JSON.stringify(input);
 assert.equal(units.drawFieldGem(r.ctx,input),true);
 assert.deepEqual(r.draws.map(d=>d.key),['pedestal:selected:3','gem:ruby:3']);
 assert.deepEqual(r.draws[1],{key:'gem:ruby:3',x:40,y:50,size:18,options:{tick:70,tint:'#cc3344',anchor:.5,shadow:false}});
 assert.equal(r.draws[0].options.shadow,false);
 assert.equal(JSON.stringify(input),before);
});

it('the real atlas draw preserves source aspect and stays within 18px field footprint',async()=>{
 const manifest={version:1,entries:{'gem:ruby:*':{src:'sprites/test-gem.png',frame:{x:0,y:0,w:40,h:80}},'pedestal:3':{src:'sprites/test-base.png',frame:{x:0,y:0,w:80,h:32}}}};
 const bank=new SpriteBank({fetch:async()=>({ok:true,json:async()=>manifest}),loadImage:async()=>({width:80,height:80})});
 await bank.load('https://test.invalid/assets/manifest.json');
 const r=recorder();
 assert.equal(units.drawFieldGem(r.ctx,{sprites:bank,logical:'gem:ruby:3',x:100,y:100,size:18,grade:'상급'}),true);
 assert.equal(r.images.length,2);
 for(const {args,origin} of r.images){const [,sx,sy,sw,sh,dx,dy,dw,dh]=args;assert.ok(sx>=0&&sy>=0);assert.ok(Math.abs(dw/dh-sw/sh)<.16);assert.ok(origin[0]+dx>=91&&origin[0]+dx+dw<=109);assert.ok(origin[1]+dy>=91&&origin[1]+dy+dh<=109);}
});

it('upright B pedestals stay legible behind the unchanged gem rather than being compressed into a tiny dot',()=>{
 const r=recorder();r.bank.get=(key:string)=>({spec:{frame:{x:0,y:0,w:256,h:256}}});
 units.drawFieldGem(r.ctx,{sprites:r.bank,logical:'gem:ruby:3',x:100,y:100,size:18,grade:'상급'});
 assert.ok(r.draws[0].size>=18*.75);
 assert.equal(r.draws[1].size,18);
});

it('optional B art failures retain old gem and stone/slate/placement fallbacks',()=>{
 const r=recorder(),available=new Set(['gem:ruby:3','stone','slate:h00T','gem:unknown:0']);
 r.bank.get=(key:string)=>available.has(key)?{spec:{frame:{x:0,y:0,w:20,h:20}}}:null;
 r.bank.draw=(_ctx:any,key:string,x:number,y:number,size:number,options:any)=>{r.draws.push({key,x,y,size,options});return available.has(key);};
 assert.equal(units.drawFieldGem(r.ctx,{sprites:r.bank,logical:'gem:ruby:3',x:0,y:0,size:18,grade:'상급'}),true);
 assert.deepEqual(r.draws.map(d=>d.key),['gem:ruby:3']);
 assert.equal(units.drawFieldStone(r.ctx,{sprites:r.bank,x:0,y:0,size:18}),true);
 assert.equal(units.drawFieldSlate(r.ctx,{sprites:r.bank,logical:'slate:h00T',x:0,y:0,size:18}),true);
 assert.equal(units.drawFieldPlacement(r.ctx,{sprites:r.bank,x:0,y:0,size:18}),true);
 assert.deepEqual(r.draws.slice(1).map(d=>d.key),['stone','slate:h00T','gem:unknown:0']);
 assert.ok(r.draws.every(d=>d.options.shadow===false));
 available.clear();
 assert.equal(units.drawFieldGem(r.ctx,{sprites:r.bank,logical:'gem:ruby:3',x:0,y:0,size:18,grade:'상급'}),false);
 assert.equal(units.drawFieldStone(r.ctx,{sprites:r.bank,x:0,y:0,size:18}),false);
});

it('a missing selected base keeps the matching regular grade and never paints an orphan base for a missing gem',()=>{
 const r=recorder(),available=new Set(['gem:ruby:3','pedestal:3']);
 r.bank.get=(key:string)=>available.has(key)?{spec:{frame:{x:0,y:0,w:256,h:256}}}:null;
 r.bank.draw=(_ctx:any,key:string,x:number,y:number,size:number,options:any)=>{r.draws.push({key,x,y,size,options});return available.has(key);};
 assert.equal(units.drawFieldGem(r.ctx,{sprites:r.bank,logical:'gem:ruby:3',x:0,y:0,size:18,grade:3,selected:true}),true);
 assert.deepEqual(r.draws.map(d=>d.key),['pedestal:3','gem:ruby:3']);
 r.draws.length=0;available.delete('gem:ruby:3');
 assert.equal(units.drawFieldGem(r.ctx,{sprites:r.bank,logical:'gem:ruby:3',x:0,y:0,size:18,grade:3,selected:true}),false);
 assert.deepEqual(r.draws.map(d=>d.key),['gem:ruby:3']);
});

it('new stone, slate and preview keys take precedence without changing dimensions or source state',()=>{
 const r=recorder(),input={sprites:r.bank,x:50,y:60,size:18,tick:30},before=JSON.stringify(input);
 units.drawFieldStone(r.ctx,input);units.drawFieldSlate(r.ctx,{...input,logical:'slate:h00T'});units.drawFieldPlacement(r.ctx,input);
 assert.deepEqual(r.draws.map(d=>d.key),['field:stone','field:slate','field:placement']);
 assert.ok(r.draws.every(d=>d.x===50&&d.y===60&&d.size===18&&d.options.shadow===false));
 assert.equal(JSON.stringify(input),before);
});

it('stable type-only monster variants stay in authored flight families and never consume RNG',()=>{
 const ground=new Set(),air=new Set();
 for(const typeId of ['h00D','h00Z','h010','h011','h012','h013','h01C','h01D','h01E']){
  const source={typeId,band:'ground',airborne:false},before=structuredClone(source),key=units.monsterArtKey(source);
  assert.equal(key,units.monsterArtKey({...source}));ground.add(key);assert.deepEqual(source,before);
  air.add(units.monsterArtKey({...source,airborne:true}));
 }
 assert.deepEqual([...ground].sort(),['creep:mine:beetle','creep:mine:goblin','creep:mine:rat']);
 assert.deepEqual([...air].sort(),['creep:mine:bat','creep:mine:wisp']);
 for(const band of ['boss','hell'])for(const airborne of [true,false])assert.equal(units.monsterArtKey({typeId:'h04P',band,airborne}),'creep:mine:ogre');
 assert.equal(units.monsterArtKey({band:'flying',typeId:'h011'}).startsWith('creep:mine:'),true);
});

it('air sprites retain health baseline, .8 anchor and reduced-motion frame with black ground shadow',()=>{
 const r=recorder(),source={sprites:r.bank,typeId:'h011',band:'flying',airborne:true,x:80,y:90,groundY:93,size:30,tick:99,flip:true,reducedMotion:true},before=JSON.stringify(source);
 assert.equal(units.drawMineCreep(r.ctx,source),true);
 assert.equal(r.ellipses.length,1);
 assert.equal(r.ellipses[0].color,'rgba(0,0,0,.3)');
 assert.equal(r.ellipses[0].args[0],80);
 assert.equal(r.ellipses[0].args[1],93+30*.18);
 assert.equal(r.draws[0].y,90);
 assert.deepEqual(r.draws[0].options,{tick:0,anchor:.8,flip:true,shadow:false});
 assert.equal(JSON.stringify(source),before);
});

it('unloaded monster replacements use old band art and no art keeps caller shape fallback',()=>{
 const r=recorder();r.bank.get=(key:string)=>key==='creep:ground'?{spec:{frame:{x:0,y:0,w:40,h:40}}}:null;
 assert.equal(units.drawMineCreep(r.ctx,{sprites:r.bank,typeId:'h00D',band:'ground',airborne:false,x:0,y:0,size:30,tick:18}),true);
 assert.equal(r.draws[0].key,'creep:ground');assert.equal(r.draws[0].options.tick,18);assert.equal(r.draws[0].options.shadowColor,'rgba(0,0,0,.3)');
 r.bank.get=()=>null;
 assert.equal(units.drawMineCreep(r.ctx,{sprites:r.bank,typeId:'h00D',band:'ground',x:0,y:0,size:30}),false);
 assert.equal(r.draws.length,1);
});
