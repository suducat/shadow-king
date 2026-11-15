import {createGame,startGame,other,type Game,type Side,type Role} from '../src/game';
export type Tactic='A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I';
export function strategicFixture(name:Tactic):Game{
 let g=createGame('ritual');const put=(id:string,x:number,y:number)=>{g.pieces=g.pieces.map(p=>p.id===id?{...p,x,y}:p);};
 const remove=(side:Side,role:Role,keep?:string)=>{const victims=g.pieces.filter(p=>p.side===side&&p.role===role&&p.id!==keep);g.pieces=g.pieces.filter(p=>!victims.includes(p));g.captures.push(...victims.map(p=>({id:p.id,side,role,by:other(side),ply:1,at:'A1'})));};
 const reveal=(id:string)=>{g.pieces=g.pieces.map(p=>p.id===id?{...p,revealed:true,executionUsed:p.role==='guard'?true:p.executionUsed}:p);};
 if(name==='A'){remove('blue','martyr','blue-1');put('red-0',0,4);put('red-5',6,4);put('red-3',3,5);}
 if(name==='B'){remove('blue','martyr');put('blue-3',3,1);reveal('blue-3');g.ritual!.blue={phase:'open',openedPly:1};put('red-0',2,3);put('red-2',4,3);put('red-5',0,5);put('red-3',6,5);}
 if(name==='D'){put('red-0',3,4);g.pieces=g.pieces.map(p=>p.id==='red-0'?{...p,revealed:true,charging:{readyPly:8}}:p);}
 if(name==='E'){put('blue-3',0,1);put('blue-0',3,2);reveal('blue-0');put('red-3',3,3);}
 if(name==='F'||name==='G'){
  remove('blue','martyr','blue-1');put('blue-1',0,2);put('blue-3',3,3);for(const id of ['blue-0','blue-2','blue-5'])reveal(id);
  put('red-0',0,3);put('red-2',6,4);put('red-5',4,5);put('red-3',6,5);
 }
 if(name==='H'){remove('blue','guard','blue-0');put('red-0',3,3);put('blue-0',3,2);reveal('blue-0');}
 if(name==='I'){remove('blue','martyr');put('red-0',3,3);put('blue-3',3,2);reveal('blue-3');g.ritual!.blue={phase:'open',openedPly:1};}
 g.ply=name==='F'||name==='G'?24:8;return startGame(g);
}
export function baitHistory(){const path=[[0,1],[1,2],[2,1],[1,2],[2,1],[1,2]];return path.map(([from,to])=>({id:'blue-1',side:'blue' as const,from:{x:0,y:from},to:{x:0,y:to}}));}
