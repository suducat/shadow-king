export type BattleCue={kind:'release'|'dash'|'impact'|'recover';at:number;index?:number};
// Absolute, ordered cues: crossing several boundaries in one slow frame still
// processes every impact once. Rendering never determines the logical path.
export function battleCues(steps:number,execution:boolean,attack:boolean):BattleCue[]{
 if(execution)return [{kind:'release',at:0},{kind:'dash',at:.18},...Array.from({length:steps},(_,index)=>({kind:'impact' as const,index,at:.18+(index+.72)*.56/steps})),{kind:'recover',at:.78}];
 return attack?[{kind:'impact',index:0,at:.4}]:[];
}
export const impactAt=(index:number,steps:number,execution:boolean)=>execution?.18+(index+.72)*.56/steps:.4;
export function pathProgress(t:number,steps:number,execution:boolean){
 const travel=execution?Math.min(1,Math.max(0,(t-.18)/.56)):t;
 const index=Math.min(steps-1,Math.floor(travel*steps));
 return {index,t:travel===1?1:travel*steps-index};
}
