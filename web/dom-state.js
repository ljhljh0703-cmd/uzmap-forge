/** Reflected DOM state is written only on a real transition. Keep this local
 * to our UI; never replace browser prototypes or cache a possibly stale value. */
export function setHidden(node,value){const next=Boolean(value);if(node.hidden!==next)node.hidden=next;return value;}
export function setText(node,value){const next=String(value??'');if(node.textContent!==next)node.textContent=next;return value;}
export function setData(node,key,value){const next=String(value);if(node.dataset[key]!==next)node.dataset[key]=next;return value;}
export function setStyle(node,key,value){const next=String(value);if(node.style[key]!==next)node.style[key]=next;return value;}
export function setProperty(node,key,value){if(node[key]!==value)node[key]=value;return value;}
export function setAttribute(node,key,value){const next=String(value);if(node.getAttribute?.(key)!==next)node.setAttribute(key,next);}
