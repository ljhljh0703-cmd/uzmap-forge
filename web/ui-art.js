import {waitGameFonts} from './browser-runtime.js';
import {setData,setStyle} from './dom-state.js';
import {createShareCardController} from './share-card.js';
/** Supplied C artwork, unchanged PNG bytes. Coordinates are runtime atlas frames. */
export const C_PARTS=Object.freeze({
 emblem:{x:450,y:84,w:548,h:446},victory:{x:24,y:552,w:468,h:192},defeat:{x:500,y:552,w:468,h:192},medal:{x:968,y:546,w:164,h:202},
 starFull:{x:1138,y:588,w:102,h:122},starHalf:{x:1232,y:588,w:102,h:122},starEmpty:{x:1322,y:588,w:112,h:122},
 crown:{x:22,y:824,w:108,h:140},flag:{x:146,y:824,w:108,h:140},quality:{x:258,y:824,w:110,h:140},clover:{x:372,y:824,w:108,h:140},angel:{x:488,y:824,w:120,h:140},coins:{x:616,y:824,w:110,h:140},hourglass:{x:740,y:824,w:88,h:140},glove:{x:846,y:824,w:108,h:140},speaker:{x:960,y:824,w:108,h:140},mute:{x:1082,y:824,w:110,h:140},trophy:{x:1200,y:824,w:110,h:140},share:{x:1320,y:824,w:108,h:140}
});
const url=file=>{const u=new URL('./assets/ui/approved/'+file,import.meta.url),build=new URL(import.meta.url).searchParams.get('build');if(build)u.searchParams.set('build',build);return u.href;};
export const C_ART={atlas:url('parts-c-atlas.png'),portrait:url('key-portrait-c.png'),landscape:url('key-landscape-c.png')};
/** Renderer colour key, not a rewritten source file. Only boundary-connected
 * magenta is transparent: enclosed purple gems remain intact. */
export function edgeKeyAlpha(input,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4000000||input.length!==width*height*4)throw Error('invalid atlas raster');
 const out=new Uint8ClampedArray(input),seen=new Uint8Array(width*height),queue=new Uint32Array(width*height);let head=0,tail=0;
 const add=i=>{if(seen[i])return;seen[i]=1;const p=i*4,r=out[p],g=out[p+1],b=out[p+2];if(out[p+3]===0||r>40&&b>40&&g<Math.min(r,b)*.65){out[p+3]=0;queue[tail++]=i;}};
 for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
 while(head<tail){const i=queue[head++],x=i%width;if(x>0)add(i-1);if(x+1<width)add(i+1);if(i>=width)add(i-width);if(i+width<width*height)add(i+width);}
 return out;
}
const images=new Map(),listeners=new Set();let sheet=null,sheetJob=null;
function imageAt(src){if(!images.has(src))images.set(src,new Promise((resolve,reject)=>{if(typeof Image!=='function'){reject(Error('no image decoder'));return;}const image=new Image();image.decoding='async';image.fetchPriority='low';image.onload=()=>resolve(image);image.onerror=()=>reject(Error('art unavailable'));image.src=src;}));return images.get(src);}
function atlas(){if(sheet)return sheet;if(typeof document==='undefined'||document.documentElement?.dataset.loadState!=='ready')return null;if(!sheetJob)sheetJob=imageAt(C_ART.atlas).then(image=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d');if(!c)return null;c.drawImage(image,0,0);const pixels=c.getImageData(0,0,canvas.width,canvas.height);pixels.data.set(edgeKeyAlpha(pixels.data,canvas.width,canvas.height));c.putImageData(pixels,0,0);sheet=canvas;for(const fn of listeners)fn();return sheet;}).catch(()=>null);return sheet;}
export function onCArtReady(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function drawCPart(ctx,key,x,y,width,height){const f=C_PARTS[key],image=atlas();if(!f||!image||!ctx)return false;const scale=Math.min(width/f.w,height/f.h),w=Math.max(1,Math.floor(f.w*scale)),h=Math.max(1,Math.floor(f.h*scale));ctx.imageSmoothingEnabled=false;ctx.drawImage(image,f.x,f.y,f.w,f.h,Math.floor(x+(width-w)/2),Math.floor(y+(height-h)/2),w,h);return true;}
/** One image node is moved between the two existing screens, so re-entering
 * setup reuses its decoded picture and never assigns the source again. */
export function mountPortraitScene(doc,{observe=fn=>typeof MutationObserver==='function'?new MutationObserver(fn):null}={}){
 const loading=doc.getElementById('loadingScreen'),mode=doc.getElementById('modeSelect');
 if(!loading&&!mode)return{destroy(){}};
 const image=doc.createElement('img');image.alt='';image.className='c-key-portrait';image.decoding='async';image.fetchPriority='low';image.setAttribute('aria-hidden','true');
 for(const host of [loading,mode])host?.classList.add('c-key-scene');
 const win=doc.defaultView??globalThis;
 const place=()=>{const ready=doc.documentElement?.dataset.loadState==='ready',host=ready?mode:loading;if(ready){const selected=win.innerWidth>900&&win.innerWidth>win.innerHeight?C_ART.landscape:C_ART.portrait;if(image.src!==selected)image.src=selected;}if(host&&image.parentNode!==host)host.prepend(image);};place();
 win.addEventListener?.('resize',place);
 const watcher=observe(place);if(doc.documentElement)watcher?.observe(doc.documentElement,{attributes:true,attributeFilter:['data-load-state']});
 return{destroy(){watcher?.disconnect();win.removeEventListener?.('resize',place);}};
}
export function mountCArtwork(doc){
 const by=id=>doc.getElementById(id),canvases=[],icons=[],urls=new Map(),share=createShareCardController({loadBackground:()=>imageAt(C_ART.landscape),createCanvas:()=>doc.createElement('canvas'),fonts:()=>waitGameFonts(doc)});let outcome='defeat',sound=false;
 const canvas=(key,width,height)=>{const node=doc.createElement('canvas');node.width=width;node.height=height;node.setAttribute('aria-hidden','true');canvases.push({node,key});return node;};
 const decorate=(host,key)=>{if(!host)return;host.dataset.cIcon=key;icons.push({node:host,key});};
 for(const host of [doc.querySelector('.loading-content'),doc.querySelector('#modeSelect .mode-card')])if(host){const c=canvas('emblem',120,98);c.className='c-title-emblem';host.prepend(c);}
 const brand=doc.querySelector('.brand');if(brand){const c=canvas('emblem',32,28);brand.prepend(c);brand.dataset.cArt='true';}
 const portraitScene=mountPortraitScene(doc);
 const title=by('goTitle');if(title){const wrap=doc.createElement('div');wrap.className='c-result-banner';const c=canvas('defeat',468,192);wrap.append(c,title);by('gameOver')?.children?.[0]?.prepend(wrap);}
 decorate(by('goMedal'),'medal');decorate(by('gemSpecialBadge'),'crown');decorate(by('rsR000Btn'),'quality');decorate(by('quickResearch'),'quality');decorate(by('rsR001Btn'),'clover');decorate(by('rsR002Btn'),'angel');decorate(by('prep'),'hourglass');decorate(by('castA009'),'glove');decorate(by('feedbackSound'),'mute');decorate(by('personalRecords')?.querySelector('summary'),'trophy');decorate(by('goShare'),'share');
 function paint(){
  for(const item of canvases){const c=item.node.getContext?.('2d');if(c){c.clearRect(0,0,item.node.width,item.node.height);setData(item.node,'cArtReady',String(drawCPart(c,item.key==='defeat'?outcome:item.key,0,0,item.node.width,item.node.height)));}}
  for(const item of icons){const key=item.node.id==='feedbackSound'?(sound?'speaker':'mute'):item.key;if(!urls.has(key)){const c=doc.createElement('canvas');c.width=c.height=64;const ctx=c.getContext?.('2d');if(!ctx||!drawCPart(ctx,key,0,0,64,64))continue;urls.set(key,c.toDataURL());}item.node.style.setProperty('--c-icon',`url("${urls.get(key)}")`);setData(item.node,'cIcon',key);}
 }
 const off=onCArtReady(paint);paint();
 return {sound(enabled){if(sound===enabled)return;sound=enabled;paint();},result(model){if(!model){share.clear();return;}const next=model.winner===0?'victory':'defeat';if(next!==outcome){outcome=next;paint();}void share.prepare(model);},file:id=>share.file(id),destroy(){off();portraitScene.destroy();share.clear();}};
}
