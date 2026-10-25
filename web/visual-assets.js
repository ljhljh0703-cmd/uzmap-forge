/** Reuses ClaudeCraft's manifest -> cached Image -> atlas frame -> drawImage/fallback flow.
 * Adapted for the existing GemTower view; gameplay never imports this module.
 * Asset derivation is recorded separately. Runtime tint variants are cached Canvas composites.
 */
export function resolveVisualKey(entries, aliases, input) {
  const key=aliases?.[input]??input;
  const parts=key.split(':');
  for(const candidate of [key,...parts.slice(0,-1).map((_,i)=>parts.slice(0,parts.length-1-i).join(':')+':*')])if(entries[candidate])return candidate;
  return null;
}
// trim is relative to one physical atlas cell. frameOrder can omit incomplete
// generated frames while keeping the original PNG and its physical stride intact.
function spriteSpec(spec){
 const f=spec?.frame,count=spec?.frames??1,fps=spec?.fps??0;
 if(!f||![f.x,f.y,f.w,f.h,count].every(Number.isInteger)||f.x<0||f.y<0||f.w<=0||f.h<=0||count<=0||!Number.isFinite(fps)||fps<0)throw Error('invalid sprite frame');
 const trim=spec.trim??{x:0,y:0,w:f.w,h:f.h};
 if(!trim||![trim.x,trim.y,trim.w,trim.h].every(Number.isInteger)||trim.x<0||trim.y<0||trim.w<=0||trim.h<=0||trim.x+trim.w>f.w||trim.y+trim.h>f.h)throw Error('invalid sprite trim');
 const order=spec.frameOrder;
 if(order!==undefined&&(!Array.isArray(order)||!order.length||order.some(index=>!Number.isInteger(index)||index<0||index>=count)))throw Error('invalid sprite frame order');
 return {f,count,fps,trim,order};
}
export function spriteFrame(spec,tick=0){
 const {f,count,fps,trim,order}=spriteSpec(spec);
 const step=Math.floor((Number.isFinite(tick)?Math.max(0,tick):0)*.05*fps);
 const frame=order?order[step%order.length]:step%count;
 return {x:f.x+frame*f.w+trim.x,y:f.y+trim.y,w:trim.w,h:trim.h};
}
const browserImage=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('sprite load failed: '+src));image.src=src;});
export class SpriteBank{
 constructor(options={}){this.fetch=options.fetch??globalThis.fetch?.bind(globalThis);this.loadImage=options.loadImage??browserImage;this.onRevision=options.onRevision??(()=>{});this.entries={};this.aliases={};this.loaded=new Map();this.images=new Map();this.tints=new Map();this.catalog=new Map();this.bySrc=new Map();this.fileJobs=new Map();this.errors=[];this.drawn=0;this.ready=false;this.revision=0;this.epoch=0;}
 _notify(src,keys,kind){this.revision++;this.tints.clear();try{this.onRevision({src,keys:[...keys],revision:this.revision,kind});}catch{}}
 _request(src){
  if(this.fileJobs.has(src))return this.fileJobs.get(src);
  const epoch=this.epoch,records=this.bySrc.get(src)??[];
  if(!this.images.has(src)){let promise;try{promise=Promise.resolve(this.loadImage(src));}catch(error){promise=Promise.reject(error);}this.images.set(src,promise);}
  const job=this.images.get(src).then(image=>{
   if(epoch!==this.epoch)return;
   const width=image.naturalWidth??image.width,height=image.naturalHeight??image.height,keys=[];
   if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('invalid sprite image');
   for(const {key,spec,f,count}of records){if(f.x+f.w*count>width||f.y+f.h>height){this.errors.push(key+': atlas out of bounds');continue;}this.loaded.set(key,{spec,image,key,src});keys.push(key);}
   this._notify(src,keys,keys.length?'loaded':'error');
  }).catch(error=>{if(epoch!==this.epoch)return;for(const {key}of records)this.errors.push(key+': '+error.message);this._notify(src,[],'error');});
  this.fileJobs.set(src,job);return job;
 }
 async ensure(keys=[]){const files=new Set();for(const input of typeof keys==='string'?[keys]:keys){const key=resolveVisualKey(this.entries,this.aliases,input),item=key&&this.catalog.get(key);if(item)files.add(item.src);}await Promise.all([...files].map(src=>this._request(src)));return this;}
 async load(url,{lazy=false,preload}={}){
  const epoch=++this.epoch;this.ready=false;this.loaded.clear();this.catalog.clear();this.bySrc.clear();this.fileJobs.clear();this.errors=[];
  try{
   const res=await this.fetch(url);if(!res.ok)throw Error('sprite manifest HTTP error');const manifest=await res.json();
   if(epoch!==this.epoch)return this;
   if(manifest.version!==1||!manifest.entries||typeof manifest.entries!=='object')throw Error('invalid sprite manifest');
   this.entries=manifest.entries;this.aliases=manifest.aliases??{};
   for(const [key,spec]of Object.entries(this.entries)){try{
    if(typeof spec.src!=='string'||!/^sprites\/[a-zA-Z0-9_/-]+\.png$/.test(spec.src)||spec.src.includes('..'))throw Error('invalid sprite path');
    const {f,count}=spriteSpec(spec),imageURL=new URL(spec.src,url),build=new URL(url).searchParams.get('build');if(build)imageURL.searchParams.set('build',build);
    const src=imageURL.href,record={key,spec,f,count,src};this.catalog.set(key,record);if(!this.bySrc.has(src))this.bySrc.set(src,[]);this.bySrc.get(src).push(record);
   }catch(error){this.errors.push(key+': '+error.message);}}
   const required=lazy?(preload??manifest.preload??[]):Object.keys(this.entries);await this.ensure(Array.isArray(required)?required:[]);
  }catch(error){if(epoch===this.epoch)this.errors.push(error.message);}
  if(epoch===this.epoch){this.ready=true;this._notify(null,[],'ready');}return this;
 }
 get(key){const resolved=resolveVisualKey(this.entries,this.aliases,key);if(!resolved)return null;const item=this.loaded.get(resolved);if(item)return item;const entry=this.catalog.get(resolved);if(entry)void this._request(entry.src);return null;}
 draw(ctx,key,x,y,size,options={}){
  if(!Number.isFinite(size)||size<=0)return false;const sprite=this.get(key);if(!sprite)return false;
  const frame=spriteFrame(sprite.spec,options.tick??0);let source=sprite.image,rect=frame;
  if(options.tint){
   const cacheKey=sprite.src+JSON.stringify(frame)+options.tint;
   if(!this.tints.has(cacheKey)){
    const off=document.createElement('canvas');off.width=frame.w;off.height=frame.h;const c=off.getContext('2d');if(!c)return false;
    c.drawImage(source,frame.x,frame.y,frame.w,frame.h,0,0,frame.w,frame.h);
    c.globalCompositeOperation='color';c.fillStyle=options.tint;c.fillRect(0,0,frame.w,frame.h);
    c.globalCompositeOperation='destination-in';c.drawImage(source,frame.x,frame.y,frame.w,frame.h,0,0,frame.w,frame.h);
    this.tints.set(cacheKey,off);
   }
   source=this.tints.get(cacheKey);rect={x:0,y:0,w:frame.w,h:frame.h};
  }
  ctx.save();ctx.imageSmoothingEnabled=false;
  if(options.shadow!==false){ctx.fillStyle=options.shadowColor??'rgba(14,31,20,.26)';ctx.beginPath();ctx.ellipse(x,y+size*.18,size*.26,size*.09,0,0,Math.PI*2);ctx.fill();}
  ctx.translate(Math.round(x),Math.round(y));if(options.flip)ctx.scale(-1,1);
  // Fit the visible art inside the existing size/picking box without stretching.
  const anchor=options.anchor??.5,scale=size/Math.max(rect.w,rect.h);
  const width=Math.max(1,Math.round(rect.w*scale)),height=Math.max(1,Math.round(rect.h*scale));
  ctx.drawImage(source,rect.x,rect.y,rect.w,rect.h,Math.round(-width/2),Math.round(-height*anchor),width,height);
  ctx.restore();this.drawn++;return true;
 }
}
