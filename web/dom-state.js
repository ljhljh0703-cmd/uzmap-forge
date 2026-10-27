/** Reflected DOM state is written only on a real transition. Keep this local
 * to our UI; never replace browser prototypes or cache a possibly stale value. */
export function setHidden(node,value){const next=Boolean(value);if(node.hidden!==next)node.hidden=next;return value;}
export function setText(node,value){const next=String(value??'');if(node.textContent!==next)node.textContent=next;return value;}
export function setData(node,key,value){const next=String(value);if(node.dataset[key]!==next)node.dataset[key]=next;return value;}
// CSSStyleDeclaration may serialize a fractional value differently from its
// input. Remember that accepted serialization, while detecting external edits.
const styleWrites=new WeakMap();
export function setStyle(node,key,value){
 const next=String(value),current=node.style[key],cache=styleWrites.get(node),last=cache?.get(key);
 if(current===next||last?.requested===next&&last.applied===current)return value;
 node.style[key]=next;const writes=cache??new Map();if(!cache)styleWrites.set(node,writes);
 writes.set(key,{requested:next,applied:node.style[key]});return value;
}
export function setProperty(node,key,value){if(node[key]!==value)node[key]=value;return value;}
export function setAttribute(node,key,value){const next=String(value);if(node.getAttribute?.(key)!==next)node.setAttribute(key,next);}
