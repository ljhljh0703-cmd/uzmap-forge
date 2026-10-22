import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SpriteBank,spriteFrame} from '../../web/visual-assets.js';

const manifest=JSON.parse(readFileSync(new URL('../../web/assets/manifest.json',import.meta.url),'utf8'));
const spec={frame:{x:0,y:0,w:256,h:256},frames:6,fps:8,trim:{x:68,y:10,w:134,h:112},frameOrder:[0,2,4,5]};
const image={width:1536,height:256};
const makeBank=async(entries:any,loadImage:any=async()=>image)=>new SpriteBank({fetch:async()=>({ok:true,json:async()=>({version:1,entries})}),loadImage}).load('http://local/assets/manifest.json?build=abc');
const context=()=>{const draws:any[]=[];return {draws,save(){},restore(){},translate(){},scale(){},beginPath(){},ellipse(){},fill(){},drawImage(...args:any[]){draws.push(args);}};};

it('walk cycles use complete atlas frames and a stable crop without selecting the second creature row',()=>{
 assert.deepEqual([0,3,5,8,10].map(tick=>spriteFrame(spec,tick).x),[68,580,1092,1348,68]);
 assert.deepEqual(spriteFrame(spec,0),{x:68,y:10,w:134,h:112});
 for(const key of ['creep:flying','creep:boss'])assert.ok(manifest.entries[key].frameOrder,'partly cut frames must be excluded');
 assert.ok(manifest.entries['creep:boss'].trim.y+manifest.entries['creep:boss'].trim.h<=128,'boss must draw only one creature row');
});

it('trimmed sprites keep their aspect ratio and remain inside the requested picture and picking box',async()=>{
 const bank=await makeBank({'creep:boss':spec,'ground':{frame:{x:0,y:0,w:32,h:32},src:'sprites/test.png',trim:{x:2,y:14,w:28,h:14}}});
 // Replace only this synthetic spec path; production frames come from the original manifest.
 assert.ok(bank.get('ground'));
 const ctx=context();assert.equal(bank.draw(ctx,'ground',40,50,40),true);
 assert.deepEqual(ctx.draws[0].slice(1),[2,14,28,14,-20,-10,40,20]);
 for(const size of [8,12,18,24,62]){const c=context();bank.draw(c,'ground',0,0,size,{anchor:.8});const [x,y,w,h]=c.draws[0].slice(-4);assert.ok(x>=-size/2&&x+w<=size/2+.5);assert.ok(y>=-size*.8-.5&&y+h<=size*.2+.5);assert.equal(w/h,2);}
});

it('invalid crops and frame orders fail closed and preserve the renderer fallback',async()=>{
 const base={...spec,src:'sprites/test.png'};
 for(const bad of [{trim:{x:250,y:0,w:20,h:20}},{trim:{x:0,y:0,w:0,h:20}},{frameOrder:[]},{frameOrder:[6]},{frameOrder:[1.5]},{fps:-1}]){
  const bank=await makeBank({'bad':{...base,...bad}});assert.equal(bank.get('bad'),null);assert.equal(bank.draw(context(),'bad',0,0,20),false);assert.ok(bank.errors.length);
 }
});

it('cropping never hides an invalid physical atlas extent',async()=>{
 const bank=await makeBank({'bad':{...spec,src:'sprites/test.png',frames:7}});
 assert.equal(bank.get('bad'),null);assert.match(bank.errors.join(' '),/atlas out of bounds/);
});

it('image and crop tint composites are cached and color variants do not alter original source pixels',async()=>{
 let imageLoads=0,canvases=0;const old=globalThis.document;
 try{globalThis.document={createElement(){canvases++;const c:any=context();c.fillRect=()=>{};return {width:0,height:0,getContext:()=>c};}} as any;
 const base={...spec,src:'sprites/test.png'};const bank=await makeBank({'a':base,'b':{...base,trim:{x:70,y:10,w:132,h:112}}},async()=>{imageLoads++;return image;});
 const ctx=context();bank.draw(ctx,'a',0,0,40,{tint:'#ff0000'});bank.draw(ctx,'a',0,0,40,{tint:'#ff0000'});assert.equal(canvases,1);bank.draw(ctx,'b',0,0,40,{tint:'#ff0000'});assert.equal(canvases,2);bank.draw(ctx,'a',0,0,40,{tint:'#00ff00'});assert.equal(canvases,3);assert.equal(imageLoads,1);assert.equal(bank.drawn,4);
 }finally{globalThis.document=old;}
});

it('invalid picture size and an unavailable tint surface keep the existing shape fallback',async()=>{
 const bank=await makeBank({'a':{...spec,src:'sprites/test.png'}}),ctx=context();
 for(const size of [0,-1,NaN,Infinity])assert.equal(bank.draw(ctx,'a',0,0,size),false);
 const old=globalThis.document;
 try{globalThis.document={createElement:()=>({getContext:()=>null})} as any;assert.equal(bank.draw(ctx,'a',0,0,32,{tint:'#ff0000'}),false);assert.equal(bank.drawn,0);assert.equal(ctx.draws.length,0);}
 finally{globalThis.document=old;}
});

it('all reused PNG bytes still match their credited sources and manifest crops exist for phone silhouettes',()=>{
 for(const credit of manifest.credits){const bytes=readFileSync(new URL('../../web/assets/'+credit.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),credit.sha256,credit.file);}
 for(const key of ['gem:*','special:*','stone','creep:ground','creep:flying','creep:hell','creep:boss'])assert.ok(manifest.entries[key].trim,key+' should exclude measured transparent padding');
 assert.notDeepEqual(manifest.entries['gem:*'].frame,manifest.entries['stone'].frame);
 assert.notEqual(manifest.entries['gem:*'].src,manifest.entries['special:*'].src);
});
