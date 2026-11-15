import {createGame,startGame,type Game,type Side} from './game';
export type RitualFixture='charge'|'ready'|'empty'|'one-step'|'opening'|'counter'|'ai-execution'|'edge'|'execute-open'|'purge'|'single';
export function ritualFixture(name:RitualFixture):Game{
 let g=createGame('ritual');
 const put=(id:string,x:number,y:number)=>{g={...g,pieces:g.pieces.map(p=>p.id===id?{...p,x,y}:p)};};
 const eliminate=(side:Side,role:'guard'|'martyr',keep?:string)=>{const removed=g.pieces.filter(p=>p.side===side&&p.role===role&&p.id!==keep);g={...g,pieces:g.pieces.filter(p=>!removed.includes(p)),captures:[...g.captures,...removed.map(p=>({side,role,by:(side==='red'?'blue':'red') as Side,ply:1,at:'A1'}))]};};
 put('red-0',3,3);put('blue-0',3,2);put('blue-2',3,1);
 if(name==='single'||name==='edge'||name==='execute-open'||name==='purge'||name==='ready'||name==='empty'||name==='one-step'||name==='counter')g.pieces=g.pieces.map(p=>p.id==='red-0'?{...p,revealed:true,charging:{readyPly:2}}:p);
 if(name==='empty'){put('red-0',3,4);put('blue-0',0,0);put('blue-2',2,0);}
 if(name==='one-step'){put('blue-2',2,0);put('red-2',3,1);}
 if(name==='opening'){
  put('blue-0',0,0);put('blue-2',2,0);put('blue-1',3,2);put('blue-3',4,3);eliminate('blue','martyr','blue-1');
 }
 if(name==='counter'){
  put('red-0',4,4);put('blue-3',4,3);put('blue-0',4,2);eliminate('blue','martyr');g.ritual!.blue={phase:'occupied',openedPly:0,occupiedPly:1};g.pieces=g.pieces.map(p=>p.id==='blue-3'?{...p,revealed:true}:p);
 }
 if(name==='single'){put('blue-2',2,0);}
 if(name==='edge'){put('red-0',3,1);put('blue-0',0,0);put('blue-2',2,0);put('blue-3',6,2);}
 if(name==='execute-open'){put('blue-0',0,0);put('blue-1',3,2);put('blue-3',4,3);eliminate('blue','martyr','blue-1');}
 if(name==='purge'){eliminate('blue','guard','blue-0');put('blue-1',3,1);}
 if(name==='ai-execution'){
  put('blue-0',3,2);put('blue-2',2,0);put('red-0',3,3);put('red-3',3,4);eliminate('red','martyr');g.turn='blue';g.ritual!.red={phase:'open',openedPly:0};g.pieces=g.pieces.map(p=>p.id==='blue-0'?{...p,revealed:true,charging:{readyPly:2}}:p.id==='red-3'?{...p,revealed:true}:p);
 }
 g.ply=2;return startGame(g);
}
