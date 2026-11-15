import fs from 'node:fs';import {createGame,startGame,move,type Game,type Side} from '../src/game';import {observe,decide,deploy,random,type Difficulty,type PublicAction} from '../src/ai';
const levels:Difficulty[]=['easy','normal','hard','master'],pairs=Number(process.env.PAIRS||4),timed=!!process.env.TIMED,records:unknown[]=[],stats:unknown[]=[];
const began=performance.now();let games=0,moves=0,maxThink=0,illegal=0,truncated=0;
for(let i=0;i<levels.length;i++)for(let j=i+1;j<levels.length;j++){
 const low=levels[i],high=levels[j];let lowWins=0,highWins=0,draws=0,plies=0;
 for(let seed=0;seed<pairs;seed++)for(const reversed of [false,true]){
  const rng=random(107+seed),names:Record<Side,Difficulty>={red:reversed?high:low,blue:reversed?low:high};let g:Game=createGame();
  for(const side of ['red','blue'] as Side[]){const xs=deploy(side,names[side],rng);let n=0;g={...g,pieces:g.pieces.map(p=>p.side===side?{...p,x:xs[n++]}:p)};}g=startGame(g);
  const history:PublicAction[]=[];
  while(!g.result&&g.ply<240){
   const side=g.turn,level=names[side],d=decide(observe(g,side,history),level,{seed:Math.floor(rng()*0xffffffff),maxMillis:timed?undefined:Infinity});maxThink=Math.max(maxThink,d.elapsed);
   if(!d.action){illegal++;break;}const a=d.action,p=g.pieces.find(p=>p.id===a.id)!,next=move(g,a.id,a.x,a.y);if(next===g){illegal++;break;}
   history.push({id:a.id,side,from:{x:p.x,y:p.y},to:{x:a.x,y:a.y},...(next.captures.length>g.captures.length?{captured:next.captures.at(-1)!.role}:{})});g=next;moves++;
  }
  records.push({seed,reversed,red:names.red,blue:names.blue,plies:g.ply,result:g.result});games++;plies+=g.ply;if(!g.result)truncated++;if(!g.result?.winner)draws++;else if(names[g.result.winner]===low)lowWins++;else highWins++;
 }
 const row={low,high,games:pairs*2,lowWins,highWins,draws,averagePlies:Math.round(plies/(pairs*2))};stats.push(row);console.log(JSON.stringify(row));
 fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync(timed?'artifacts/ai-tournament-timed.json':'artifacts/ai-tournament.json',JSON.stringify({games,moves,illegal,truncated,maxThink,elapsed:performance.now()-began,pairs,records,search:timed?'production node budgets and wall-clock deadlines':'production node budgets; deterministic seeded search with wall-clock deadline disabled for reproducibility',stats},null,2));
}
