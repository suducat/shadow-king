import type {BoardScene} from './scene';import {fixture} from './qa';import {viewFor,move} from './game';import {modelState} from './lifecycle-qa';
export async function qualityProbe(scene:BoardScene){
 const failures:string[]=[];scene.resetActors();scene.setQuality('high');let g=fixture('capture','guard');const p=g.pieces.find(p=>p.side==='red'&&p.x===3&&p.y===3)!,victim=g.pieces.find(p=>p.x===3&&p.y===2)!;
 const update=()=>scene.update({pieces:viewFor(g,'red'),viewer:'red',selected:null,legal:[],active:true,deployment:false,reduced:true,cinematic:false});update();
 const promise=scene.animateMove(p.id,'guard',{x:3,y:2},victim.id),tr=scene.transition!,before=tr.actor.model;g=move(g,p.id,3,2);update();
 const step=(t:number)=>(scene as unknown as{stepMove:(t:number)=>void}).stepMove(t);step(tr.start+tr.duration*.5);scene.setQuality('low');if(scene.transition!==tr||scene.actors.get(p.id)?.model!==before)failures.push('quality interrupted active capture');step(tr.start+tr.duration+1);await promise;
 scene.setQuality('low');for(const q of ['medium','high','low'] as const){scene.setQuality(q);const a=scene.actors.get(p.id)!;if(scene.quality!==q||!a||Math.abs(a.group.position.x+3-3)>.001||Math.abs(a.group.position.z+3-2)>.001||modelState(scene).some(s=>s.hidden||s.zeroOpacity||s.disposed||!s.visible))failures.push(`quality ${q} corrupted survivors`);}
 const masks=[...scene.actors.values()].filter(a=>a.role==='unknown'),signature=(a:typeof masks[number])=>{const parts:number[]=[];a.model.traverse(o=>{const m=o as import('three').Mesh;if(m.isMesh)parts.push(m.geometry.attributes.position.count);});return parts.join('/');};if(new Set(masks.map(signature)).size>1)failures.push('hidden identity silhouette mismatch');
 return{failures,quality:scene.quality,actors:scene.actors.size,states:modelState(scene)};
}
