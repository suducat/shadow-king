import * as T from 'three';
import type {BoardScene} from './scene';
import {fixture} from './qa';
import {ritualFixture} from './ritual-qa';
import {modelState} from './lifecycle-qa';
import {act,move,viewFor,type Game} from './game';
// Test-build only. Advance the real renderer at reproducible frame intervals;
// no production repair or hidden game controls are linked into the final UI.
export async function stressV04(scene:BoardScene){
 const failures:string[]=[],cases:{kind:string;fps:number;impacts:number;expected:number}[]=[];let moves=0,captures=0,skips=0,restarts=0,midFrameChecks=0;
 const step=(time:number)=>{(scene as unknown as{stepMove:(now:number)=>void}).stepMove(time);const tr=scene.transition;if(!tr)return;midFrameChecks++;const a=tr.actor;let bad=false;a.model.traverse(o=>{if(o instanceof T.Mesh){if(!o.visible)bad=true;for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m.opacity<.99||m.userData.released)bad=true;}});const bounds=new T.Box3().setFromObject(a.model);if(bad||!a.model.visible||!a.group.visible||a.group.scale.x!==1||a.model.scale.x!==1||bounds.max.y-bounds.min.y<.8||scene.actors.get(tr.id)!==a||a.group.parent!==scene.root)failures.push(`mid-frame ${tr.id}/${time-tr.start}`);};
 const update=(g:Game)=>scene.update({pieces:viewFor(g,'red'),viewer:'red',selected:null,legal:[],cinematic:true,reduced:false,deployment:false,active:true,mode:g.mode??'classic',ritual:g.ritual});
 const audit=(g:Game,label:string)=>{
  const states=modelState(scene);if(states.length!==g.pieces.length)failures.push(`${label}: actor inventory`);
  if(scene.root.children.filter(c=>c.userData.actorId).length!==states.length)failures.push(`${label}: duplicate or orphan actor`);
  for(const a of states){const p=g.pieces.find(p=>p.id===a.id);if(!p||a.zeroOpacity||a.hidden||a.disposed||!a.visible||a.modelScale.some(v=>v!==1)||a.scale.some(v=>v!==1))failures.push(`${label}: invisible ${a.id}`);
   if(p&&new T.Vector3(...a.position).distanceTo(new T.Vector3(p.x-3,.18,p.y-3))>.01)failures.push(`${label}: position ${a.id}`);
   const actor=scene.actors.get(a.id)!;const bounds=new T.Box3().setFromObject(actor.model);if(bounds.max.y-bounds.min.y<.8)failures.push(`${label}: body missing ${a.id}`);
  }
  if(scene.transition||scene.fx.action)failures.push(`${label}: action leaked`);
 };
 for(const fps of [60,15,3]){
  for(const role of ['king','guard','martyr'] as const){
   scene.resetActors();restarts++;let g=fixture('capture',role),attacker=g.pieces.find(p=>p.side==='red'&&p.x===3&&p.y===3)!;update(g);
   const victim=g.pieces.find(p=>p.x===3&&p.y===2)!;const promise=scene.animateMove(attacker.id,role,{x:3,y:2},victim.id),tr=scene.transition!;g=move(g,attacker.id,3,2);update(g);
   for(let elapsed=0;elapsed<tr.duration;elapsed+=1000/fps)step(tr.start+elapsed);step(tr.start+tr.duration+1);await promise;captures++;audit(g,`${role}/${fps}`);
   // 36 moves per role across the three frame rates = 108 ordinary moves.
   for(let j=0;j<12;j++){const x=j%2?3:4,p=scene.animateMove(attacker.id,role,{x,y:2}),motion=scene.transition!;g={...g,pieces:g.pieces.map(p=>p.id===attacker.id?{...p,x,y:2}:p)};update(g);
    if(j%4===0){scene.skipMove();skips++;}else{for(let elapsed=0;elapsed<motion.duration;elapsed+=1000/fps)step(motion.start+elapsed);step(motion.start+motion.duration+1);}await p;moves++;audit(g,`move/${role}/${fps}/${j}`);
   }
  }
  for(const name of ['ready','single','edge','execute-open','purge','counter'] as const){
   scene.resetActors();restarts++;let g=ritualFixture(name);update(g);const a=g.pieces.find(p=>p.id==='red-0')!,target=name==='edge'?0:name==='counter'?2:1;
   const next=act(g,{id:a.id,x:a.x,y:target,kind:'execute'});if(next===g){failures.push(`fixture ${name} invalid`);continue;}
   const before=scene.cueLog.length,promise=scene.animatePath(a.id,'guard',next.lastAction!.steps,false,true),tr=scene.transition!;update(next);
   // Some runs skip directly over both hit boundaries: both still fire once.
   if(fps===3){scene.skipMove();skips++;}else{for(let elapsed=0;elapsed<tr.duration;elapsed+=1000/fps)step(tr.start+elapsed);step(tr.start+tr.duration+1);}await promise;
   const impacts=scene.cueLog.slice(before).filter(c=>c.kind==='impact').length;cases.push({kind:name,fps,impacts,expected:next.lastAction!.steps.length});if(impacts!==next.lastAction!.steps.length)failures.push(`lost cue ${name}/${fps}`);
   captures+=next.captures.length-g.captures.length;audit(next,`execute/${name}/${fps}`);
  }
 }
 scene.fx.clearTransient();scene.renderer.render(scene.scene,scene.camera);
 return{moves,captures,skips,restarts,midFrameChecks,frameRates:[60,15,3],cases,failures,states:modelState(scene)};
}
