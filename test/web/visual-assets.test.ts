import {it} from 'node:test';import assert from 'node:assert/strict';import {SpriteBank,resolveVisualKey,spriteFrame} from '../../web/visual-assets.js';
it('reuses logical fallbacks and map aliases without raw IDs in generic drawing code',()=>{
 const entries={'gem:ruby:*':{},'gem:*':{},'creep:ground':{}};
 assert.equal(resolveVisualKey(entries,{},'gem:ruby:3'),'gem:ruby:*');assert.equal(resolveVisualKey(entries,{h002:'gem:ruby:0'},'h002'),'gem:ruby:*');assert.equal(resolveVisualKey(entries,{},'special:missing'),null);
});
it('animation frames come from simulation ticks and declared atlas bounds',()=>{
 const s={frame:{x:0,y:32,w:32,h:32},frames:4,fps:8};assert.deepEqual(spriteFrame(s,20),{x:0,y:32,w:32,h:32});assert.equal(spriteFrame(s,3).x,32);assert.throws(()=>spriteFrame({...s,frames:0},0));
});
it('missing manifest, failed image and invalid atlas safely keep the shape fallback',async()=>{
 const missing=new SpriteBank({fetch:async()=>{throw Error('offline');},loadImage:async()=>({width:64,height:64})});await missing.load('http://local/assets/manifest.json');assert.equal(missing.get('gem:ruby:0'),null);assert.ok(missing.errors.length);
 const failed=new SpriteBank({fetch:async()=>({ok:true,json:async()=>({version:1,entries:{'gem:*':{src:'sprites/missing.png',frame:{x:0,y:0,w:32,h:32}}}})}),loadImage:async()=>{throw Error('missing image');}});await failed.load('http://local/assets/manifest.json');assert.equal(failed.get('gem:ruby:0'),null);
 const invalid=new SpriteBank({fetch:async()=>({ok:true,json:async()=>({version:1,entries:{'gem:*':{src:'../private.png',frame:{x:0,y:0,w:32,h:32}}}})}),loadImage:async()=>({width:8,height:8})});await invalid.load('http://local/assets/manifest.json');assert.equal(invalid.get('gem:ruby:0'),null);
});
it('valid atlas is cached once per source and rejects out-of-bounds rectangles',async()=>{
 let loads=0;const bank=new SpriteBank({fetch:async()=>({ok:true,json:async()=>({version:1,entries:{'gem:*':{src:'sprites/props.png',frame:{x:0,y:0,w:32,h:32}},'special:*':{src:'sprites/props.png',frame:{x:32,y:0,w:32,h:32}},'bad':{src:'sprites/props.png',frame:{x:64,y:0,w:32,h:32}}}})}),loadImage:async()=>{loads++;return {width:64,height:64};}});await bank.load('http://local/assets/manifest.json');assert.equal(loads,1);assert.ok(bank.get('gem:ruby:0'));assert.ok(bank.get('special:gold'));assert.equal(bank.get('bad'),null);
});
it('default browser fetch keeps its required global receiver',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async function(){assert.equal(this,globalThis,'native Window.fetch rejects a SpriteBank receiver');return {ok:true,json:async()=>({version:1,entries:{}})} as any;};
 const bank=new SpriteBank();await bank.load('http://local/assets/manifest.json');assert.deepEqual(bank.errors,[]);
 }finally{globalThis.fetch=original;}
});

it('composited field layers suppress duplicate shadows and flying art can request a black shadow',async()=>{
 const bank=new SpriteBank({fetch:async()=>({ok:true,json:async()=>({version:1,entries:{a:{src:'sprites/a.png',frame:{x:0,y:0,w:20,h:20}}}})}),loadImage:async()=>({width:20,height:20})});await bank.load('http://local/assets/manifest.json');const fills:any[]=[],ctx:any={save(){},restore(){},beginPath(){},ellipse(){fills.push('ellipse');},fill(){fills.push(this.fillStyle);},translate(){},scale(){},drawImage(){}};assert.equal(bank.draw(ctx,'a',0,0,20,{shadow:false}),true);assert.deepEqual(fills,[]);bank.draw(ctx,'a',0,0,20,{shadowColor:'rgba(0,0,0,.35)'});assert.deepEqual(fills,['ellipse','rgba(0,0,0,.35)']);
});
