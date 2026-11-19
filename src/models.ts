import * as T from 'three';
import { mergeGeometries,mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VisibleRole, Side } from './game';
import {surface} from './surfaces';
import {type FigurePose} from './battle-timeline';
import {QUALITY,type Quality} from './quality';
let detail:Quality='high';const segments=(n:number,min=4)=>Math.max(min,Math.round(n*QUALITY[detail].segments));
import { bodyPickMesh } from './interaction';

export type CharacterRig = { body:T.Group;leftLeg:T.Group;rightLeg:T.Group;crown:T.Group;weapon: T.Group; cape: T.Group; leftArm: T.Group; rightArm: T.Group; seal: T.Group };
export type Character = { model: T.Group; pick: T.Mesh; rig: CharacterRig };
const V = (x:number,y:number,z:number) => new T.Vector3(x,y,z);
function sculpt(fn:(u:number,v:number)=>T.Vector3, nu=40,nv=24) {
  nu=segments(nu,6);nv=segments(nv,6);
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++) { const p=fn(i/nu,j/nv);positions.push(p.x,p.y,p.z);uvs.push(i/nu,j/nv); }
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+nu+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function add(parent:T.Object3D,g:T.BufferGeometry,m:T.Material,position=[0,0,0],scale=[1,1,1]) {
  const o=new T.Mesh(g,m);o.position.fromArray(position);o.scale.fromArray(scale);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function ellipsoid(parent:T.Object3D,m:T.Material,p:number[],s:number[]) { return add(parent,new T.SphereGeometry(1,segments(20,8),segments(14,6)),m,p,s); }
function sweep(points:T.Vector3[],r:number|((v:number)=>number),sides=10,segments=20,flatten=1) {
  const curve=new T.CatmullRomCurve3(points),frames=curve.computeFrenetFrames(segments,false);
  return sculpt((u,v)=>{const i=Math.min(segments,Math.round(v*segments)),a=u*Math.PI*2,radius=typeof r==='number'?r:r(v);return curve.getPoint(v).addScaledVector(frames.normals[i],Math.cos(a)*radius).addScaledVector(frames.binormals[i],Math.sin(a)*radius*flatten);},sides,segments);
}
function cord(parent:T.Object3D,m:T.Material,points:number[][],r=.006) {return add(parent,sweep(points.map(p=>V(p[0],p[1],p[2])),r,6,Math.max(8,points.length*3)),m);}
function turned(parent:T.Object3D,m:T.Material,profile:number[][],sides=48) {return add(parent,new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),segments(sides,16)),m);}
function disk(parent:T.Object3D,m:T.Material,r:number,y:number,tube=.006) { const o=add(parent,new T.TorusGeometry(r,tube,4,segments(48,20)),m,[0,y,0]);o.rotation.x=Math.PI/2;return o; }
function emboss(parent:T.Object3D,m:T.Material,shape:T.Shape,depth=.014) {return add(parent,new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:detail==='low'?1:2,steps:1,bevelSize:.008,bevelThickness:.006,curveSegments:segments(12,6)}),m);}
function shieldShape(w:number,h:number){const s=new T.Shape();s.moveTo(0,-h*.55);s.bezierCurveTo(-w*.55,-h*.25,-w*.5,h*.1,-w*.42,h*.42);s.quadraticCurveTo(0,h*.65,w*.42,h*.42);s.bezierCurveTo(w*.5,h*.1,w*.55,-h*.25,0,-h*.55);return s;}
function palette(side:Side){const red=side==='red',tex=detail==='low'?null:surface('fabric'),patina=detail==='low'?null:surface('metal');const m=(color:number,metalness=.7,roughness=.35)=>new T.MeshStandardMaterial({color,metalness,roughness,roughnessMap:patina,bumpMap:patina,bumpScale:.0015,side:T.DoubleSide});return {
  steel:m(red?0xa4a8a4:0x91b4c2,.86,.46),gold:m(0xb89453,.86,.4),shade:m(0x17242a,.55,.59),skin:m(0xad9275,.06,.78),
  cloth:new T.MeshStandardMaterial({color:red?0x68262e:0x203d59,roughness:.95,metalness:0,bumpMap:tex,bumpScale:.006,side:T.DoubleSide}),
  lining:new T.MeshStandardMaterial({color:red?0xa84a44:0x4f829d,roughness:.87,metalness:.02,side:T.DoubleSide}),
  violet:m(0x493951,.08,.9),leather:m(0x302726,.02,.94),
  magic:new T.MeshStandardMaterial({color:red?0xf0c17e:0xa5e3fa,emissive:red?0xbd682e:0x408dae,emissiveIntensity:.65,metalness:.4,roughness:.22}),
  purple:new T.MeshStandardMaterial({color:0xc3a0df,emissive:0x76509d,emissiveIntensity:.85,metalness:.35,roughness:.28}),
};}
type Palette=ReturnType<typeof palette>;
function skirt(parent:T.Object3D,m:T.Material,bottom=.25,top=.13,height=.8,folds=12){
  return add(parent,sculpt((u,v)=>{const a=u*Math.PI*2,r=T.MathUtils.lerp(bottom,top,v)+Math.sin(a*folds+.25)*.018*(1-v*.7);return V(Math.sin(a)*r,.19+v*height+Math.sin(a*3)*.012*(1-v),Math.cos(a)*r*.8);},56,26),m);
}
function cape(parent:T.Group,m:T.Material,trim:T.Material,width=.35,height=.94){
  // Shoulder-to-hem cloth with longitudinal folds and a scalloped bottom.
  const point=(u:number,v:number)=>{const a=(u-.5)*2,w=T.MathUtils.lerp(width,.22,v);return V(a*w,.24+v*height+.025*Math.cos(a*7)*(1-v),-.06-(1-v)*.19-Math.sin(u*Math.PI)*.1+Math.sin(u*Math.PI*10)*.021*(1-v));};
  add(parent,sculpt(point,36,22),m);
  cord(parent,trim,Array.from({length:25},(_,i)=>{const p=point(i/24,0);return[p.x,p.y,p.z-.003];}),.009);
  for(const u of [0,1])cord(parent,trim,Array.from({length:14},(_,i)=>{const p=point(u,i/13);return[p.x,p.y,p.z-.003];}),.007);
}
function arm(parent:T.Group,p:Palette,kind:'royal'|'knight'|'priest',left:boolean){
  const s=left?-1:1;
  const shoulder=V(s*.19,1.07,0),elbow=V(s*.29,kind==='priest'? .91:.86,kind==='priest'?.13:.05),hand=V(s*.20,kind==='priest'?1.02:.72,.23);
  add(parent,sweep([shoulder,elbow,hand],v=>(kind==='priest'?.115:.075)*(1-v*.4),14,24),kind==='priest'?p.cloth:p.steel);
  if(kind!=='priest'){
    const pauldron=add(parent,sculpt((u,v)=>{const a=u*Math.PI*2,ph=v*Math.PI*.65;return V(s*.2+Math.sin(ph)*Math.cos(a)*.145,1.065+Math.cos(ph)*.105,Math.sin(ph)*Math.sin(a)*.13);},24,12),p.steel);
    pauldron.rotation.z=s*.1;
    for(let n=0;n<3;n++)cord(parent,p.gold,Array.from({length:16},(_,i)=>{const a=i/15*Math.PI;return[s*(.20+Math.sin(a)*(.12+n*.008)),1.055-n*.026,Math.cos(a)*.12];}),.006);
    add(parent,sweep([elbow,hand],v=>.071-v*.025,12,12),p.steel);
    cord(parent,p.gold,[[s*.27,.83,.12],[s*.24,.79,.19],[s*.2,.75,.25]],.009);
  } else {
    for(let k=0;k<3;k++)cord(parent,p.gold,[[s*(.27+k*.014),.85,.08],[s*(.29+k*.014),.87,.14],[s*(.26+k*.014),.94,.22]],.006);
  }
  ellipsoid(parent,p.skin,[hand.x,hand.y,hand.z],[.055,.065,.039]);
  for(let i=0;i<4;i++)cord(parent,p.skin,[[hand.x+(i-1.5)*.015,hand.y-.01,hand.z+.025],[hand.x+(i-1.5)*.014,hand.y-.055,hand.z+.033],[hand.x+(i-1.5)*.014,hand.y-.07,hand.z+.01]],.008);
}
function face(parent:T.Group,p:Palette,y=1.27){
  add(parent,sculpt((u,v)=>{const a=u*Math.PI*2,b=v*Math.PI,x=Math.sin(b)*Math.sin(a)*.105;let z=Math.sin(b)*Math.cos(a)*.095;const nose=Math.exp(-Math.pow(x/.022,2)-Math.pow((v-.49)/.13,2));if(Math.cos(a)>0)z+=nose*.043;return V(x,y+Math.cos(b)*.14,z);},32,24),p.skin);
  for(const s of [-1,1]){
    cord(parent,p.shade,[[s*.022,y+.025,.102],[s*.046,y+.027,.095],[s*.069,y+.018,.082]],.006);
    cord(parent,p.skin,[[s*.016,y+.054,.099],[s*.045,y+.058,.096],[s*.077,y+.041,.08]],.011);
  }
  cord(parent,p.shade,[[-.032,y-.059,.091],[0,y-.062,.105],[.032,y-.059,.091]],.004);
  // Sculpted tapered beard and individually engraved strands.
  add(parent,sculpt((u,v)=>{const a=(u-.5)*Math.PI*1.1;const w=.075*(1-v*.8);return V(Math.sin(a)*w,y-.047-v*.17,.068+Math.cos(a)*w*.5-v*.01);},20,16),p.steel);
  for(let i=-2;i<=2;i++)cord(parent,p.gold,[[i*.016,y-.065,.108],[i*.014,y-.13,.098],[i*.006,y-.205,.073]],.003);
}
function hood(parent:T.Group,p:Palette,unknown=false){
  const fn=(u:number,v:number)=>{const a=.57+u*(Math.PI*2-1.14),r=.22*Math.sin(.8+v*(Math.PI-.8));return V(Math.sin(a)*r,.91+v*.62,Math.cos(a)*r*.84-.015);};
  add(parent,sculpt(fn,40,24),p.cloth);
  ellipsoid(parent,p.shade,[0,1.23,.035],[.128,.175,.1]);
  for(const u of [0,1])cord(parent,unknown?p.steel:p.gold,Array.from({length:18},(_,i)=>{const q=fn(u,i/17);return[q.x,q.y,q.z+.007];}),.009);
  if(!unknown){cord(parent,p.skin,[[-.027,1.18,.132],[0,1.165,.143],[.027,1.18,.132]],.006);}
}
function runeRing(parent:T.Group,p:Palette,r=.22,color:T.Material=p.gold){
  disk(parent,color,r,0,.005);disk(parent,color,r+.025,0,.003);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;cord(parent,color,[[Math.sin(a)*r,0,Math.cos(a)*r],[Math.sin(a+.07)*(r-.035),0,Math.cos(a+.07)*(r-.035)],[Math.sin(a+.12)*r,0,Math.cos(a+.12)*r]],.004);}
}
function base(parent:T.Group,p:Palette,role:VisibleRole){
  turned(parent,p.shade,[[0,0],[.315,0],[.35,.025],[.35,.055],[.322,.075],[.322,.105],[.30,.12],[.305,.15],[.28,.175],[0,.175]]);
  disk(parent,p.gold,.338,.06,.010);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;cord(parent,p.gold,[[Math.sin(a)*.326,.08,Math.cos(a)*.326],[Math.sin(a)*.306,.113,Math.cos(a)*.306]],.004);}disk(parent,p.steel,.30,.145,.008);
  const engraving=new T.Group();engraving.position.y=.176;parent.add(engraving);runeRing(engraving,p,.257,role==='martyr'?p.purple:p.gold);
  // Carved plaque at the front of the plinth.
  const plaque=emboss(parent,p.gold,shieldShape(.105,.08),.008);plaque.position.set(0,.077,.326);plaque.scale.setScalar(.8);
  if(role==='king')cord(parent,p.shade,[[-.028,.09,.342],[-.024,.065,.345],[.024,.065,.345],[.028,.09,.342],[.012,.08,.345],[0,.098,.345],[-.012,.08,.345],[-.028,.09,.342]],.004);
  else if(role==='guard')cord(parent,p.shade,[[0,.105,.342],[0,.055,.345],[-.02,.071,.345],[.02,.071,.345]],.004);
  else if(role==='martyr')for(let i=0;i<3;i++){const a=i*Math.PI*2/3;cord(parent,p.shade,[[0,.08,.345],[Math.sin(a)*.027,.08+Math.cos(a)*.023,.345]],.005);}
  else cord(parent,p.shade,[[0,.105,.345],[.019,.08,.345],[0,.055,.345],[-.019,.08,.345],[0,.105,.345]],.004);
}
function breastplate(parent:T.Group,p:Palette,royal=false){
  add(parent,sculpt((u,v)=>{const a=u*Math.PI*2,r=.125+.07*Math.sin(v*Math.PI),front=Math.max(0,Math.cos(a));return V(Math.sin(a)*r,.73+v*.39,Math.cos(a)*r*.66+front*.022*Math.sin(v*Math.PI));},40,20),p.steel);
  const emblem=emboss(parent,p.gold,shieldShape(.105,.14),.009);emblem.position.set(0,.94,.143);
  for(const s of [-1,1])cord(parent,p.gold,[[s*.03,.78,.125],[s*.11,.85,.133],[s*.14,1.02,.11],[s*.08,1.1,.09]],.007);
  turned(parent,p.leather,[[.138,.724],[.15,.736],[.15,.77],[.138,.779]]);
  const buckle=emboss(parent,p.gold,shieldShape(.055,.048),.008);buckle.position.set(0,.753,.143);
  if(royal){for(const s of [-1,1])cord(parent,p.gold,[[s*.02,1.09,.15],[s*.1,1.045,.17],[s*.18,1.07,.09]],.009);}
}
function sword(parent:T.Group,p:Palette){
  const shape=new T.Shape();shape.moveTo(0,.86);shape.lineTo(.043,.72);shape.lineTo(.036,.12);shape.lineTo(-.036,.12);shape.lineTo(-.043,.72);shape.closePath();
  const blade=emboss(parent,p.steel,shape,.014);blade.position.z=-.006;
  cord(parent,p.gold,[[0,.15,.02],[0,.7,.021],[0,.82,.012]],.004);
  cord(parent,p.gold,[[-.12,.11,0],[-.08,.125,0],[0,.105,0],[.08,.125,0],[.12,.11,0]],.017);
  add(parent,sweep([V(0,.08,0),V(0,-.08,0)],.022,10,8),p.leather);
  for(let i=0;i<5;i++)disk(parent,p.gold,.024,-.07+i*.03,.003);
  ellipsoid(parent,p.gold,[0,-.115,0],[.038,.035,.031]);
}
function crystal(parent:T.Group,p:Palette,y:number,purple=false){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,.12,0, -.045,0,.035, .045,0,.035, .045,0,-.035, -.045,0,-.035, 0,-.07,0],3));g.setIndex([0,1,2,0,2,3,0,3,4,0,4,1,5,2,1,5,3,2,5,4,3,5,1,4]);g.computeVertexNormals();add(parent,g,purple?p.purple:p.magic,[0,y,0]);
}
function royal(model:T.Group,rig:CharacterRig,p:Palette){
  skirt(model,p.cloth,.255,.13,.71,14);cape(rig.cape,p.lining,p.gold,.34,.93);breastplate(model,p,true);face(model,p,1.27);
  // Open-work crown: a sculpted circlet, five fleur-shaped leaves and inset gems.
  turned(rig.crown,p.gold,[[.105,1.36],[.135,1.375],[.132,1.425],[.108,1.43]]);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,s=new T.Shape();s.moveTo(-.032,0);s.bezierCurveTo(-.035,.035,-.06,.07,-.019,.097);s.quadraticCurveTo(0,.12,0,.155);s.quadraticCurveTo(0,.12,.019,.097);s.bezierCurveTo(.06,.07,.035,.035,.032,0);s.closePath();
    const leaf=emboss(rig.crown,p.gold,s,.011);leaf.position.set(Math.sin(a)*.124,1.405,Math.cos(a)*.124);leaf.rotation.y=a;
    ellipsoid(rig.crown,p.magic,[Math.sin(a)*.135,1.42,Math.cos(a)*.135],[.018,.025,.015]);
  }
  arm(rig.leftArm,p,'royal',true);arm(rig.rightArm,p,'royal',false);
  rig.weapon.position.set(.29,.24,.22);
  add(rig.weapon,sweep([V(0,0,0),V(0,.87,0)],v=>.017+Math.sin(v*Math.PI*8)*.002,10,28),p.gold);
  for(const y of [.08,.15,.76,.85])disk(rig.weapon,p.gold,.031,y,.008);
  crystal(rig.weapon,p,1.02);for(let i=0;i<4;i++){const a=i*Math.PI/2;cord(rig.weapon,p.gold,[[Math.sin(a)*.03,.87,Math.cos(a)*.03],[Math.sin(a)*.07,1.01,Math.cos(a)*.07],[Math.sin(a)*.035,1.12,Math.cos(a)*.035]],.008);}
  const chain=new T.Group();chain.position.set(-.04,.91,.15);model.add(chain);cord(chain,p.gold,[[-.11,.11,0],[-.08,.02,.03],[0,-.015,.035],[.08,.02,.03],[.13,.11,0]],.008);
}
function knight(model:T.Group,rig:CharacterRig,p:Palette){
  // Two articulated legs establish a recognisable, offset fighting stance.
  for(const s of [-1,1]){
    const leg=s<0?rig.leftLeg:rig.rightLeg;const hip=V(s*.095,.77,0),knee=V(s*.13,.49,s<0?.10:-.035),ankle=V(s*.14,.235,s<0?.13:.01);
    add(leg,sweep([hip,knee,ankle],v=>.073-v*.02,14,24),p.steel);
    ellipsoid(leg,p.steel,[knee.x,knee.y,knee.z+.035],[.079,.072,.047]);
    cord(leg,p.gold,[[ankle.x,ankle.y,ankle.z+.055],[knee.x,knee.y-.04,knee.z+.077]],.007);
    ellipsoid(leg,p.shade,[ankle.x,.205,ankle.z+.05],[.076,.045,.125]);
  }
  breastplate(model,p);cape(rig.cape,p.cloth,p.steel,.27,.85);arm(rig.leftArm,p,'knight',true);arm(rig.rightArm,p,'knight',false);
  add(model,sculpt((u,v)=>{const a=u*Math.PI*2,b=v*Math.PI;const front=Math.max(0,Math.cos(a));return V(Math.sin(b)*Math.sin(a)*.13,1.28+Math.cos(b)*.175,Math.sin(b)*Math.cos(a)*.13+front*.018);},32,20),p.steel);
  const visor=emboss(model,p.shade,shieldShape(.18,.145),.006);visor.position.set(0,1.26,.122);
  for(const s of [-1,1]){cord(model,p.gold,[[s*.105,1.285,.08],[s*.073,1.31,.13],[s*.012,1.3,.15]],.009);for(let i=0;i<3;i++)cord(model,p.shade,[[s*(.025+i*.023),1.245,.147],[s*(.021+i*.019),1.215,.137]],.004);}
  cord(model,p.steel,[[0,1.1,.13],[0,1.31,.16],[0,1.45,.01],[0,1.34,-.13]],.014);
  const crest=add(model,sculpt((u,v)=>V((u-.5)*.021,1.38+Math.sin(v*Math.PI)*.19,-.11+v*.22),6,16),p.lining);crest.rotation.z=-.08;
  rig.weapon.position.set(.19,.72,.25);rig.weapon.rotation.z=-.13;sword(rig.weapon,p);
  const shield=emboss(rig.leftArm,p.steel,shieldShape(.19,.29),.023);shield.position.set(-.28,.76,.18);shield.rotation.y=-.25;
  const inset=emboss(rig.leftArm,p.shade,shieldShape(.142,.232),.007);inset.position.set(-.28,.76,.208);inset.rotation.y=-.25;
  cord(rig.leftArm,p.gold,[[-.28,.87,.223],[-.28,.65,.225],[-.34,.78,.224],[-.22,.78,.224]],.007);
}
function priest(model:T.Group,rig:CharacterRig,p:Palette){
  skirt(model,p.violet,.275,.13,.78,16);cape(rig.cape,p.cloth,p.gold,.36,1.04);hood(model,p);arm(rig.leftArm,p,'priest',true);arm(rig.rightArm,p,'priest',false);
  // Stoles and embroidered hems follow the cloth surface rather than floating cubes.
  for(const s of [-1,1]){
    cord(model,p.gold,[[s*.07,1.08,.13],[s*.09,.88,.16],[s*.11,.6,.20],[s*.14,.24,.23]],.011);
    for(let n=0;n<6;n++){const y=.32+n*.115,x=s*(.14-(y-.24)*.08),z=.235-(y-.24)*.13;cord(model,p.gold,[[x-.013,y,z],[x+.013,y+.023,z],[x-.012,y+.038,z],[x+.01,y+.05,z]],.004);}
  }
  for(let i=0;i<18;i++){const a=i*Math.PI/9;cord(model,p.gold,[[Math.sin(a)*.266,.23,Math.cos(a)*.216],[Math.sin(a+.04)*.262,.26,Math.cos(a+.04)*.21]],.005);}
  rig.weapon.position.set(0,.97,.29);rig.weapon.rotation.x=-.25;
  const book=new T.Shape();book.moveTo(-.135,-.08);book.lineTo(0,-.065);book.lineTo(.135,-.08);book.lineTo(.135,.095);book.lineTo(0,.08);book.lineTo(-.135,.095);book.closePath();
  emboss(rig.weapon,p.leather,book,.035);
  const pages=emboss(rig.weapon,p.skin,book,.015);pages.position.z=.031;pages.scale.set(.91,.9,1);
  for(const s of [-1,1])for(let i=0;i<5;i++)cord(rig.weapon,p.gold,[[s*.025,-.04+i*.024,.058],[s*.106,-.052+i*.026,.058]],.0025);
  rig.seal.position.set(0,1.20,.36);rig.seal.rotation.x=Math.PI/2;
  runeRing(rig.seal,p,.16,p.purple);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3,b=a+Math.PI*4/3;cord(rig.seal,p.gold,[[Math.sin(a)*.14,0,Math.cos(a)*.14],[Math.sin(b)*.14,0,Math.cos(b)*.14]],.004);}
}
function sealed(model:T.Group,rig:CharacterRig,p:Palette){
  skirt(model,p.cloth,.26,.14,.84,12);cape(rig.cape,p.cloth,p.steel,.29,1.06);hood(model,p,true);
  for(const s of [-1,1]){add(model,sweep([V(s*.18,1.04,0),V(s*.22,.83,.08),V(s*.11,.75,.18)],v=>.085-v*.025,12,18),p.cloth);}
  const clasp=emboss(rig.seal,p.steel,shieldShape(.105,.13),.015);clasp.position.set(0,.91,.177);
  crystal(rig.seal,p,.9);rig.seal.children.at(-1)!.position.z=.207;rig.seal.children.at(-1)!.scale.set(.38,.38,.38);
  cord(rig.seal,p.steel,[[-.12,1.09,.11],[0,.98,.18],[.12,1.09,.11]],.008);
}
function batch(group:T.Group){
  for(const c of [...group.children])if(c instanceof T.Group)batch(c);
  group.updateMatrixWorld(true);
  const map=new Map<T.Material,T.Mesh[]>();
  for(const c of group.children)if(c instanceof T.Mesh&&!Array.isArray(c.material)){const a=map.get(c.material)||[];a.push(c);map.set(c.material,a);}
  for(const [material,objects]of map){if(objects.length<2)continue;const geometries=objects.map(o=>{o.updateMatrix();const g=o.geometry.clone().applyMatrix4(o.matrix);if(g.index){const flat=g.toNonIndexed();g.dispose();return flat;}return g;});
    // All custom primitives have normals and UVs; make attributes uniform for merging.
    for(const g of geometries){for(const a of Object.keys(g.attributes))if(!['position','normal','uv'].includes(a))g.deleteAttribute(a);if(!g.getAttribute('uv'))g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));}
    const merged=mergeGeometries(geometries);if(!merged){geometries.forEach(g=>g.dispose());continue;}
    objects.forEach(o=>{group.remove(o);o.geometry.dispose();});geometries.forEach(g=>g.dispose());const indexed=mergeVertices(merged,1e-6);merged.dispose();add(group,indexed,material);
  }
}
function buildCharacter(role:VisibleRole,side:Side):Character {
  const model=new T.Group(),body=new T.Group(),p=palette(side),rig:CharacterRig={body,leftLeg:new T.Group(),rightLeg:new T.Group(),crown:new T.Group(),weapon:new T.Group(),cape:new T.Group(),leftArm:new T.Group(),rightArm:new T.Group(),seal:new T.Group()};
  for(const [name,part]of Object.entries(rig)){part.name=`rig-${name}`;if(part!==body)body.add(part);}model.add(body);base(model,p,role);
  if(role==='king')royal(body,rig,p);else if(role==='guard')knight(body,rig,p);else if(role==='martyr')priest(body,rig,p);else sealed(body,rig,p);
  const pivots:[T.Group,T.Vector3][]=[[rig.leftArm,V(-.19,1.07,0)],[rig.rightArm,V(.19,1.07,0)],[rig.cape,V(0,1.11,-.06)],[rig.leftLeg,V(-.095,.77,0)],[rig.rightLeg,V(.095,.77,0)],[rig.crown,V(0,1.4,0)]];
  if(role==='unknown')pivots.push([rig.seal,V(0,.95,.2)]);
  for(const[part,pivot]of pivots){for(const child of part.children)child.position.sub(pivot);part.position.copy(pivot);}
  if(role==='king'){for(const c of rig.weapon.children)c.position.y-=.48;rig.weapon.position.set(.21,.72,.23);}
  for(const child of body.children)child.position.y-=.78;body.position.y=.78;body.rotation.order='YXZ';
  model.updateMatrixWorld(true);if(role==='guard'||role==='king')rig.rightArm.attach(rig.weapon);
  rig.weapon.userData.contact=role==='guard'?[0,.29,0]:role==='king'?[0,.64,0]:role==='unknown'?[0,.93,.21]:[0,.08,.06];
  rig.weapon.userData.trailEdge=role==='guard'?[0,.79,0]:[0,.42,0];
  for(const part of Object.values(rig)){part.userData.bindPosition=part.position.toArray();part.userData.bindRotation=part.rotation.toArray();}
  batch(model);
  // A uniform scale keeps all base positions and visual footprints tied to one cell.
  model.rotation.y=side==='red'?Math.PI:0;
  const pick=bodyPickMesh(role);
  return {model,pick,rig};
}

// Immutable render resources survive perspective handoffs. Only the currently
// visible clone is attached to the scene; no hidden-role model is rendered.
const templates=new Map<string,Character>();
export function createCharacter(role:VisibleRole,side:Side,quality:Quality='high'):Character {
  detail=quality;
  const key=side+':'+role+':'+quality;let source=templates.get(key);
  if(!source){
    source=buildCharacter(role,side);
    source.model.traverse(o=>{if(o instanceof T.Mesh){o.geometry.userData.shared=true;for(const m of (Array.isArray(o.material)?o.material:[o.material])){m.userData.shared=true;for(const v of Object.values(m))if(v instanceof T.Texture)v.userData.shared=true;}}});
    templates.set(key,source);
  }
  const model=source.model.clone(true),part=(name:string)=>model.getObjectByName('rig-'+name) as T.Group,rig:CharacterRig={body:part('body'),leftLeg:part('leftLeg'),rightLeg:part('rightLeg'),crown:part('crown'),weapon:part('weapon'),cape:part('cape'),leftArm:part('leftArm'),rightArm:part('rightArm'),seal:part('seal')};
  // Object3D.clone copies the quaternion. Retain the authored yaw too:
  // decomposing a half-turn can otherwise introduce 180° roll and pitch.
  model.rotation.copy(source.model.rotation);
  // Geometry/textures are immutable and cached. Opacity and other material
  // properties belong to ONE actor, including after a perspective replacement.
  const materials=new Map<string,T.Material>();
  model.traverse(o=>{if(o instanceof T.Mesh){
    let scope='base';for(let p:T.Object3D|null=o.parent;p&&p!==model;p=p.parent){if(p.name==='rig-crown'){scope='crown';break;}if(p.name==='rig-body')scope='body';}
    const clone=(source:T.Material)=>{const key=source.uuid+'/'+scope;let own=materials.get(key);if(!own){own=source.clone();own.userData={...source.userData,shared:false,scope};if(import.meta.env.DEV||import.meta.env.MODE==='test')own.addEventListener('dispose',()=>{own!.userData.released=true;});materials.set(key,own);}return own;};
    o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
  }});
  return {model,rig,pick:bodyPickMesh(role)};
}
export function disposeCharacters(){
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  for(const {model,pick} of templates.values())for(const object of [model,pick])object.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material])){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture)textures.add(v);}}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());templates.clear();
}

// Absolute local poses, never additive mutations: skipped/late frames and
// interrupted actions cannot leave a scale, wrist rotation or cloak drift.
export function poseFigure(rig:CharacterRig,p:FigurePose,yaw=0){
 for(const part of Object.values(rig)){part.position.fromArray(part.userData.bindPosition);part.rotation.fromArray(part.userData.bindRotation);part.scale.setScalar(1);}
 rig.body.position.y+=p.heave;rig.body.position.x+=Math.sin(yaw)*p.sway;rig.body.position.z+=Math.cos(yaw)*p.sway;rig.body.rotation.set(p.lean,yaw,p.roll,'YXZ');
 rig.weapon.position.y+=p.weaponHeight;rig.weapon.rotation.x+=p.weaponPitch;rig.weapon.rotation.z+=p.weaponRoll;rig.cape.rotation.x+=p.capeDrag;
 rig.leftArm.rotation.x+=p.leftArm;rig.rightArm.rotation.x+=p.rightArm;rig.leftLeg.rotation.x+=p.leftLeg;rig.rightLeg.rotation.x+=p.rightLeg;
 rig.seal.scale.setScalar(p.sealScale);rig.seal.position.y+=p.sealLift;rig.crown.position.y+=p.crownLift;rig.crown.rotation.z+=p.crownRoll;
}
