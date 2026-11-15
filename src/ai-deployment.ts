import {ROLES,type Role,type Side} from './game';import type {Difficulty} from './ai';
const layouts:Role[][]=[];
function enumerate(row:Role[]=[],counts={king:1,guard:3,martyr:3}){if(row.length===7){layouts.push([...row]);return;}for(const role of ['king','guard','martyr'] as Role[])if(counts[role]){counts[role]--;row.push(role);enumerate(row,counts);row.pop();counts[role]++;}}
enumerate();
const scores=layouts.map(row=>{const k=row.indexOf('king'),neighbors=[row[k-1],row[k+1]],martyrs=row.flatMap((r,i)=>r==='martyr'?[i]:[]);return Math.exp(neighbors.filter(r=>r==='guard').length*1.1+neighbors.filter(r=>r==='martyr').length*.2+(3-Math.abs(k-3))*.12+(martyrs[2]-martyrs[0])*.035);});
const sum=scores.reduce((a,b)=>a+b,0);
export function deployAdaptive(side:Side,difficulty:Difficulty,rng:()=>number):number[]{
 const preference={easy:0,normal:.35,hard:.6,master:.7}[difficulty];let roll=rng(),index=layouts.length-1;
 for(let i=0;i<layouts.length;i++){roll-=(1-preference)/layouts.length+preference*scores[i]/sum;if(roll<=0){index=i;break;}}
 const row=layouts[index],free=[0,1,2,3,4,5,6];return ROLES.map(role=>{const col=free.find(x=>row[x]===role)!;free.splice(free.indexOf(col),1);return side==='blue'?6-col:col;});
}
