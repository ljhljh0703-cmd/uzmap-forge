/** Build/test-only decoders using existing Node zlib. No browser/runtime import. */
import {inflateSync,brotliDecompressSync} from 'node:zlib';
const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
export function decodePng(input){
 const bytes=Buffer.from(input);if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('invalid PNG');
 let width,height,depth,type,palette,alpha;const pieces=[];
 for(let p=8;p+12<=bytes.length;){const length=bytes.readUInt32BE(p),tag=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,p+8+length);if(p+12+length>bytes.length)throw Error('PNG chunk out of bounds');if(tag==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];if(data[12]!==0)throw Error('interlaced PNG unsupported');}if(tag==='IDAT')pieces.push(data);if(tag==='PLTE')palette=data;if(tag==='tRNS')alpha=data;p+=12+length;if(tag==='IEND')break;}
 const channels={0:1,2:3,3:1,4:2,6:4}[type];if(depth!==8||!channels||!width||!height||width*height>32000000)throw Error('unsupported PNG format');
 const raw=inflateSync(Buffer.concat(pieces)),stride=width*channels;if(raw.length!==(stride+1)*height)throw Error('PNG raster size differs');const pixels=Buffer.alloc(stride*height);
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('invalid PNG filter');for(let x=0;x<stride;x++){const a=x>=channels?pixels[y*stride+x-channels]:0,b=y?pixels[(y-1)*stride+x]:0,c=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0,predict=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];pixels[y*stride+x]=(raw[y*(stride+1)+1+x]+predict)&255;}}
 const rgba=Buffer.alloc(width*height*4);for(let i=0;i<width*height;i++){const p=i*channels,o=i*4;if(type===6){pixels.copy(rgba,o,p,p+4);}else if(type===2){pixels.copy(rgba,o,p,p+3);rgba[o+3]=255;}else if(type===3){const n=pixels[p];if(!palette||n*3+2>=palette.length)throw Error('invalid PNG palette');palette.copy(rgba,o,n*3,n*3+3);rgba[o+3]=alpha?.[n]??255;}else{rgba[o]=rgba[o+1]=rgba[o+2]=pixels[p];rgba[o+3]=type===4?pixels[p+1]:255;}}
 return {width,height,rgba};
}
export function cropRgba(image,{x,y,w,h}){if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||w<=0||h<=0||x+w>image.width||y+h>image.height)throw Error('crop out of bounds');const rgba=Buffer.alloc(w*h*4);for(let row=0;row<h;row++)image.rgba.copy(rgba,row*w*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+w)*4);return {width:w,height:h,rgba};}
export function woff2Codepoints(input){
 const bytes=Buffer.from(input);if(bytes.toString('ascii',0,4)!=='wOF2')throw Error('invalid WOFF2');let offset=48;const tables=[];
 const uint128=()=>{let value=0;for(let i=0;i<5;i++){const n=bytes[offset++];if(n===undefined||i===0&&n===128||value&0xfe000000)throw Error('invalid WOFF2 base128');value=(value*128+(n&127))>>>0;if(!(n&128))return value;}throw Error('long WOFF2 base128');};
 let tableOffset=0;
 for(let i=0;i<bytes.readUInt16BE(12);i++){const flags=bytes[offset++],index=flags&63,version=flags>>>6;let tag={0:'cmap',3:'hmtx',10:'glyf',11:'loca'}[index]??'other';if(index===63){tag=bytes.toString('ascii',offset,offset+4);offset+=4;}const originalLength=uint128(),transformed=tag==='glyf'||tag==='loca'?version!==3:version!==0,length=transformed?uint128():originalLength;tables.push({tag,offset:tableOffset,length,transformed});tableOffset+=length;}
 const decoded=brotliDecompressSync(bytes.subarray(offset,offset+bytes.readUInt32BE(20)));if(decoded.length!==tableOffset)throw Error('WOFF2 table lengths differ');const record=tables.find(t=>t.tag==='cmap');if(!record||record.transformed)throw Error('missing Unicode cmap');const cmap=decoded.subarray(record.offset,record.offset+record.length),result=new Set();
 for(let i=0;i<cmap.readUInt16BE(2);i++){const p=4+i*8,platform=cmap.readUInt16BE(p),encoding=cmap.readUInt16BE(p+2);if(platform!==0&&!(platform===3&&(encoding===1||encoding===10)))continue;const at=cmap.readUInt32BE(p+4),format=cmap.readUInt16BE(at);
  if(format===12){const count=cmap.readUInt32BE(at+12);for(let j=0;j<count;j++){const p=at+16+j*12,start=cmap.readUInt32BE(p),end=cmap.readUInt32BE(p+4),gid=cmap.readUInt32BE(p+8);if(end>0x10ffff||end<start)throw Error('invalid cmap12 range');for(let cp=start;cp<=end;cp++)if(gid+cp-start)result.add(cp);}}
  if(format===4){const count=cmap.readUInt16BE(at+6)/2,endAt=at+14,startAt=endAt+count*2+2,deltaAt=startAt+count*2,rangeAt=deltaAt+count*2;for(let j=0;j<count;j++){const end=cmap.readUInt16BE(endAt+j*2),start=cmap.readUInt16BE(startAt+j*2),delta=cmap.readInt16BE(deltaAt+j*2),range=cmap.readUInt16BE(rangeAt+j*2);for(let cp=start;cp<=end&&cp<65535;cp++){let gid;if(range){const address=rangeAt+j*2+range+2*(cp-start);if(address+2>cmap.length)throw Error('invalid cmap4 address');gid=cmap.readUInt16BE(address);if(gid)gid=(gid+delta)&65535;}else gid=(cp+delta)&65535;if(gid)result.add(cp);}}}
 }
 return result;
}
