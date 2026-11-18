import {QUALITY,type Quality} from './quality';
// Detail and display density are separate: a light model need not look like a
// low-resolution video. Only viewport / display / settings changes reallocate.
export function renderResolution(width:number,height:number,dpr:number,quality:Quality){
 const tier=QUALITY[quality],density=Number.isFinite(dpr)&&dpr>0?dpr:1;
 const ratio=Math.min(density,tier.pixelRatio,Math.sqrt(tier.pixelBudget/Math.max(1,width*height)));
 return{ratio,width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio))};
}
