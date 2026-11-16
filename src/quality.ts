export type Quality='high'|'medium'|'low';
export const QUALITY={high:{label:'高',description:'完整雕刻 · 1.5× 像素上限 · 动态接触阴影',pixelRatio:1.5,segments:1,shadow:1024,particles:100},medium:{label:'中',description:'平衡雕刻 · 1.25× 像素上限 · 柔和接触投影',pixelRatio:1.25,segments:.75,shadow:0,particles:55},low:{label:'低',description:'精简曲面与微纹理 · 1× 像素上限 · 保留全部关键标记',pixelRatio:1,segments:.45,shadow:0,particles:20}} as const;
export const isQuality=(x:unknown):x is Quality=>x==='high'||x==='medium'||x==='low';
export function defaultQuality():Quality{return typeof navigator!=='undefined'&&(navigator.hardwareConcurrency<=4||typeof matchMedia!=='undefined'&&matchMedia('(pointer: coarse)').matches)?'low':'medium';}
