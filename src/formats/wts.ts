/** Runtime adaptation of scripts/dissect/extract_meta.mjs's existing WTS extraction.
 * Caller-owned strings stay input data; UI uses textContent, never executes their text. */
export function parseWts(bytes:Uint8Array):ReadonlyMap<number,string>{
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 const entries=new Map<number,string>(),pattern=/STRING (\d+)(?:\r\n|\n|\r)\{(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)\}/g;
 for(const match of text.matchAll(pattern)){const id=Number(match[1]);if(entries.has(id))throw Error('duplicate WTS id '+id);entries.set(id,match[2]!);}
 const leftover=text.replace(pattern,'').replace(/^\s*\/\/.*$/gm,'').trim();if(leftover)throw Error('invalid WTS record');return entries;
}
export function resolveWtsText(text:string,strings:ReadonlyMap<number,string>):string{return text.replace(/TRIGSTR_(\d+)/g,(token,id)=>strings.get(Number(id))??token);}
