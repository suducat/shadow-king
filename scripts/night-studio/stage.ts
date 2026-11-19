// Offline plate photography. Only the resulting WebP plates ship to the menu.
import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createCharacter} from '../../src/models';
import {surface} from '../../src/surfaces';
import {BattleEffects} from '../../src/battle-effects';

export function photograph(view: 'hall'|'altar'|'unlit'|'easy'|'normal'|'hard'|'master'|'omniscient') {
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(1536,1024);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFSoftShadowMap;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1.5,.05,65);
  const night=0x101a22;
  scene.background=new T.Color(night);
  scene.fog=new T.FogExp2(night,.082);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
  scene.environment=pmrem.fromScene(room,.08).texture;
  scene.environmentIntensity=.34;
  const stone=(color:number)=>new T.MeshStandardMaterial({color,map:surface('stone',true),roughness:.66,bumpMap:surface('stone'),bumpScale:.019,metalness:.19});
  const basalt=stone(0x22272c),lightStone=stone(0x47515a),darkStone=stone(0x202931);
  const brass=new T.MeshStandardMaterial({color:0x9a7647,metalness:.79,roughness:.42,roughnessMap:surface('metal')});
  function solid(g:T.BufferGeometry,m:T.Material,x:number,y:number,z:number) {
    const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);return mesh;
  }
  function box(w:number,h:number,d:number,m:T.Material,x:number,y:number,z:number) {
    return solid(new T.BoxGeometry(w,h,d),m,x,y,z);
  }
  const boardZ=-2.35;
  box(7.36,.47,7.36,basalt,0,-.285,boardZ);
  box(7.31,.023,7.31,brass,0,-.085,boardZ);
  box(7.20,.08,7.20,basalt,0,-.036,boardZ);
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)box(.988,.052,.988,(x+z)%2===0?lightStone:darkStone,x,.004,boardZ+z);
  for(const s of [-1,1]){
    box(.013,.012,7.12,brass,s*3.55,.013,boardZ);
    box(7.12,.012,.013,brass,0,.013,boardZ+s*3.55);
  }
  // A receding arcade; the silhouettes remain readable through the fog.
  for(const z of [-5.7,-9,-13])for(const x of [-5.8,-2.9,0,2.9,5.8]){
    solid(new T.CylinderGeometry(.26,.34,5,12),basalt,x,1.7,z);
    for(const y of [-.35,-.18,2.7,2.8])solid(new T.CylinderGeometry(.39,.39,.10,12),basalt,x,y,z);
    if(x<5){
      for(const s of [-1,1]){
        const curve=new T.QuadraticBezierCurve3(new T.Vector3(x+1.45+s*1.4,2.8,z),new T.Vector3(x+1.45+s*1.26,4.4,z),new T.Vector3(x+1.45,5.1,z));
        solid(new T.TubeGeometry(curve,25,.15,8,false),basalt,0,0,0);
      }
    }
  }
  scene.add(new T.HemisphereLight(0xabc7df,0x403128,.65));
  function spot(color:number,power:number,at:number[],to:number[],angle:number,shadow=false){
    const l=new T.SpotLight(color,power,22,angle,.72,2);
    l.position.fromArray(at);l.target.position.fromArray(to);l.castShadow=shadow;l.shadow.mapSize.set(2048,2048);l.shadow.normalBias=.005;
    scene.add(l,l.target);
  }
  spot(0xaaceff,85,[2.2,3.4,-1.8],[.77,.85,.5],.32,true);
  spot(0xffcd88,62,[-2.8,3.7,1.3],[-1.03,1.4,-.35],.30,true);
  spot(0x8ea5c3,90,[-3.7,4,-6],[0,1,-7],.84);
  const king=createCharacter('king','red').model,mask=createCharacter('unknown','blue').model;
  king.rotation.y=1.03;mask.rotation.y=-.30;
  if(view==='hall'){
    king.position.set(-1.0,.033,-.55);mask.position.set(.82,.033,.58);
    king.scale.setScalar(1.14);mask.scale.setScalar(1.12);
    scene.add(king,mask);
    camera.position.set(1.30,1.37,4.55);camera.lookAt(-.02,.89,0);
  }else if(view!=='altar'&&view!=='unlit'){
    const cast={easy:'guard',normal:'guard',hard:'martyr',master:'king',omniscient:'unknown'} as const;
    const figure=createCharacter(cast[view],view==='easy'||view==='master'?'red':'blue').model;
    const tint={easy:0xb19b76,normal:0xaccfe8,hard:0xd2b38c,master:0xf6d18a,omniscient:0xe1efff}[view];
    figure.position.set(0,.033,.58);
    figure.rotation.y={easy:-.80,normal:.63,hard:-.35,master:.42,omniscient:.06}[view];
    scene.add(figure);
    spot(tint,52,[-1.5,2.5,1.6],[0,1,.58],.42,true);
    camera.position.set(.33,1.26,3.98);camera.lookAt(0,.90,.58);
  }else{
    king.position.set(-2,.033,boardZ+2);mask.position.set(2,.033,boardZ-2);
    scene.add(king,mask);
    const altar=new T.Group();altar.position.set(0,-.124,boardZ);scene.add(altar);
    const fx=new BattleEffects(altar);
    fx.update('ritual',{red:{phase:view==='altar'?'open':'dormant'},blue:{phase:'dormant'}},[],[],null,undefined,0,true);
    fx.tick(1000,true,new Map());
    fx.altar.children.filter(o=>o.name==='offering-seal').forEach(o=>o.visible=false);
    // Three raised, individually engraved offering seals on the far altar row.
    for(let i=0;i<3;i++){
      const seal=new T.Group();scene.add(seal);seal.position.set(i-1,.08,boardZ-.87);
      const ink=new T.MeshStandardMaterial({color:0xbca373,emissive:0xa777cf,emissiveIntensity:view==='altar'?.9:.015,metalness:.55,roughness:.38});
      for(const r of [.24,.30]){
        const m=new T.Mesh(new T.TorusGeometry(r,.014,8,48),ink);m.rotation.x=-Math.PI/2;seal.add(m);
      }
      const n=3+i,vertices=Array.from({length:n+1},(_,k)=>new T.Vector3(Math.sin(k*2*Math.PI/n)*.2,0,Math.cos(k*2*Math.PI/n)*.2));
      for(let k=0;k<n;k++)seal.add(new T.Mesh(new T.TubeGeometry(new T.LineCurve3(vertices[k],vertices[k+1]),1,.016,6,false),ink));
    }
    spot(0xe2b9ff,88,[0,4,-1],[0,0,boardZ],.59,true);
    camera.position.set(1.9,4.1,3.45);camera.lookAt(0,.06,boardZ);
  }
  renderer.render(scene,camera);
  const data=renderer.domElement.toDataURL('image/webp',.94);
  renderer.dispose();renderer.forceContextLoss();room.dispose();pmrem.dispose();
  return data;
}
