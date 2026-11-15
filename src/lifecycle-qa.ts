import type { BoardScene } from './scene';
import { fixture } from './qa';
import { viewFor, move, type VisiblePiece } from './game';
export function modelState(scene:BoardScene){
 return Array.from(scene.actors,([id,a])=>{let meshes=0,hidden=0,zeroOpacity=0,disposed=0;const materials=new Set<string>();
  a.model.traverse(o=>{const m=o as import('three').Mesh;if(!m.isMesh)return;meshes++;if(!m.visible)hidden++;for(const mat of(Array.isArray(m.material)?m.material:[m.material])){materials.add(mat.uuid);if(mat.opacity<.99)zeroOpacity++;if(mat.userData.released)disposed++;}});
  return{id,role:a.role,weaponZ:a.rig?.weapon.rotation.z,meshes,hidden,zeroOpacity,disposed,visible:a.model.visible&&a.group.visible,scale:a.group.scale.toArray(),modelScale:a.model.scale.toArray(),position:a.group.position.toArray(),materials:[...materials]};
 });
}
export async function replacementProbe(scene:BoardScene){
 scene.resetActors();
 const game=fixture('capture','guard'),id=game.pieces.find(p=>p.side==='red'&&p.x===3&&p.y===3)!.id,victim=game.pieces.find(p=>p.side==='blue'&&p.x===3&&p.y===2)!.id;
 const update=(pieces:VisiblePiece[],viewer:'red'|'blue')=>scene.update({pieces,viewer,selected:null,legal:[],cinematic:false,reduced:false,deployment:false,active:true});
 update(viewFor(game,'red'),'red');
 const promise=scene.animateMove(id,'guard',{x:3,y:2},victim,false);
 const tr=scene.transition!;
 const step=(time:number)=>(scene as unknown as {stepMove:(now:number)=>void}).stepMove(time);
 update(viewFor(move(game,id,3,2),'red'),'red');
 step(tr.start+tr.duration*.62);
 // A legitimate renderer reconciliation: same IDs, fresh perspective/board,
 // while the old capture still has pending frames. No material is mutated here.
 update(viewFor(game,'blue'),'blue');
 step(tr.start+tr.duration*.86);step(tr.start+tr.duration*1.1);
 update(viewFor(game,'blue'),'blue');
 await promise;scene.renderer.render(scene.scene,scene.camera);
 const states=modelState(scene);
 return{states,corrupted:states.filter(a=>a.zeroOpacity||!a.visible||a.scale.some(v=>v<.9)),id,victim};
}
export async function stressModels(scene:BoardScene){
 const failures:string[]=[];let moves=0,captures=0,interruptions=0;
 const update=(game:import('./game').Game)=>scene.update({pieces:viewFor(game,'red'),viewer:'red',selected:null,legal:[],cinematic:false,reduced:false,deployment:false,active:true});
 const step=(time:number)=>(scene as unknown as {stepMove:(now:number)=>void}).stepMove(time);
 for(const role of ['king','guard','martyr'] as const){
  for(let i=0;i<12;i++){
   scene.resetActors();let g=fixture('capture',role);const attacker=g.pieces.find(p=>p.side==='red'&&p.x===3&&p.y===3)!;
   // Victim variants do not affect the presentation contract.
   g={...g,pieces:g.pieces.map(p=>p.side==='blue'&&p.x===3&&p.y===2?{...p,role:(['king','guard','martyr'] as const)[i%3]}:p)};
   update(g);const promise=scene.animateMove(attacker.id,role,{x:3,y:2},g.pieces.find(p=>p.x===3&&p.y===2)!.id,false);const tr=scene.transition!;
   update(move(g,attacker.id,3,2));step(tr.start+tr.duration*.65);
   if(i%4===0){scene.cancelMove();interruptions++;}else step(tr.start+tr.duration+1);
   await promise;captures++;
   let a=scene.actors.get(attacker.id)!;
   if(!a||a.group.position.distanceTo(tr.to)>.001||modelState(scene).some(s=>s.zeroOpacity||s.disposed||s.hidden||!s.visible||s.modelScale.some(v=>v<.9)))failures.push(`capture ${role}/${i}`);
   // One stable actor, repeatedly animated through empty cells (renderer stress,
   // independent of whose turn the rule engine would schedule next).
   const reference=a.model;
   for(let j=0;j<6;j++){
    const to={x:j%2?3:4,y:2};const p=scene.animateMove(attacker.id,role,to,undefined,false),motion=scene.transition!;
    step(motion.start+motion.duration+1);await p;moves++;
    a=scene.actors.get(attacker.id)!;
    if(a.model!==reference||a.group.position.distanceTo(motion.to)>.001||a.group.scale.x!==1||a.model.scale.x!==1)failures.push(`move ${role}/${i}/${j}`);
   }
  }
 }
 // The same attacker survives six captures without a renderer reset.
 scene.resetActors();let chain=fixture('capture','guard');const champion=chain.pieces.find(p=>p.side==='red'&&p.x===3&&p.y===3)!;
 const cells=[[3,2],[4,2],[4,3],[4,4],[3,4],[2,4]];
 chain={...chain,pieces:chain.pieces.filter(p=>p.side==='red').concat(chain.pieces.filter(p=>p.side==='blue').slice(0,6).map((p,i)=>({...p,x:cells[i][0],y:cells[i][1]})))};
 update(chain);const stable=scene.actors.get(champion.id)!.model;
 for(const [x,y] of cells){
  const victim=chain.pieces.find(p=>p.side==='blue'&&p.x===x&&p.y===y)!;
  const promise=scene.animateMove(champion.id,'guard',{x,y},victim.id,false),motion=scene.transition!;
  chain={...chain,pieces:chain.pieces.filter(p=>p!==victim).map(p=>p.id===champion.id?{...p,x,y}:p)};update(chain);step(motion.start+motion.duration+1);await promise;captures++;
  if(scene.actors.get(champion.id)?.model!==stable||modelState(scene).some(s=>s.zeroOpacity||s.disposed||s.hidden||!s.visible||s.modelScale.some(v=>v<.9)))failures.push('consecutive capture');
 }
 const states=modelState(scene),sets=states.map(s=>new Set(s.materials));
 for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++)if([...sets[i]].some(m=>sets[j].has(m)))failures.push('shared mutable material');
 scene.renderer.render(scene.scene,scene.camera);
 return{moves,captures,interruptions,failures,states};
}
