export type Quality='high'|'medium'|'low';
export const QUALITY={high:{label:'高',description:'完整雕刻 · 最高3×清晰度 · 动态接触阴影',pixelRatio:3,pixelBudget:4000000,idleFps:30,anisotropy:8,segments:1,shadow:1024,particles:100},medium:{label:'中',description:'平衡雕刻 · 最高2×清晰度 · 柔和接触投影',pixelRatio:2,pixelBudget:2500000,idleFps:24,anisotropy:4,segments:.75,shadow:0,particles:55},low:{label:'低',description:'精简曲面与微纹理 · 最高2×清晰度 · 保留全部关键标记',pixelRatio:2,pixelBudget:1200000,idleFps:15,anisotropy:2,segments:.45,shadow:0,particles:20}} as const;
export const isQuality=(x:unknown):x is Quality=>x==='high'||x==='medium'||x==='low';
export function defaultQuality():Quality{return typeof matchMedia!=='undefined'&&matchMedia('(pointer: coarse)').matches?'low':'medium';}
