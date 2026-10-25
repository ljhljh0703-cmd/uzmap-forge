/** Source glyph collection reuses the existing JASS lexer; no regex string parser. */
import {readFileSync,existsSync,readdirSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {readScriptMap} from '../../src/runtime/session.ts';import {tokenize} from '../../src/jass/lexer.ts';
export const sha=data=>createHash('sha256').update(data).digest('hex');
export const glyphHash=cps=>sha(JSON.stringify([...cps].sort((a,b)=>a-b)));
export function mapGlyphs(ir,strings){let text=[...strings.values()].join('');for(const object of ir.objectMods??[])for(const mod of object.mods??[])if(typeof mod.value==='string')text+=mod.value;for(const token of tokenize(ir.script.source))if(token.kind==='STRING')text+=String(token.value??token.text);return new Set([...text].map(c=>c.codePointAt(0)));}
export function currentGlyphInputs(root,proof,read=readFileSync,{has=existsSync}={}){
 const uiFiles=['web/index.html','web/play.css',...readdirSync(join(root,'web')).filter(f=>f.endsWith('.js')).sort().map(f=>'web/'+f)],ui=new Set();for(const rel of uiFiles)for(const c of read(join(root,rel)).toString('utf8'))ui.add(c.codePointAt(0));
 const decoder=new TextDecoder('euc-kr',{fatal:true}),ks=new Set();for(let a=0xb0;a<=0xc8;a++)for(let b=0xa1;b<=0xfe;b++)ks.add(decoder.decode(Uint8Array.of(a,b)).codePointAt(0));if(ks.size!==2350)throw Error('KS2350 decoding differs');
 const mapPath=join(root,'fixtures/maps/GemTower_Max_7C.w3x');let map=new Set(proof.inputs.mapCodepoints),mapSha=proof.inputs.mapSha256;if(has(mapPath)){const bytes=read(mapPath);mapSha=sha(bytes);const loaded=readScriptMap(new Uint8Array(bytes),'F-font-verification');map=mapGlyphs(loaded.ir,loaded.strings);}
 const required=new Set([...ks,...ui,...map,...Array.from({length:95},(_,i)=>i+32)].filter(cp=>cp>=32&&!(cp>=127&&cp<160)));return {uiFiles,ui,map,mapSha,ks,required};
}
