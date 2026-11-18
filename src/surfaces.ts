import * as T from 'three';
const textures=new Map<string,T.CanvasTexture>();let sampling=4;
export function setSurfaceSampling(value:number){sampling=value;for(const t of textures.values())if(t.anisotropy!==value){t.anisotropy=value;t.needsUpdate=true;}}
// Authored in code: deterministic, tile-sized mineral grain, hammered metal,
// and woven fabric. Linear scalar maps are separate from sRGB albedo maps.
export function surface(kind:'stone'|'metal'|'fabric',color=false){
 const key=kind+color;let texture=textures.get(key);if(texture)return texture;
 const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d')!;let seed=kind==='stone'?1051:kind==='metal'?883:719;const rnd=()=>{seed=Math.imul(seed,1664525)+1013904223;return(seed>>>0)/4294967296;};
 x.fillStyle=kind==='stone'?'#c6c5bf':kind==='metal'?'#959595':'#888888';x.fillRect(0,0,256,256);
 for(let i=0;i<18000;i++){const v=Math.floor((kind==='stone'?100:85)+rnd()*100);x.fillStyle=`rgba(${v},${v},${v},${kind==='stone'?.17:.12})`;x.fillRect(rnd()*256,rnd()*256,kind==='metal'?.7:1,1);}
 if(kind==='stone')for(let i=0;i<5;i++){const start=rnd()*256;x.strokeStyle='rgba(65,71,71,.16)';x.lineWidth=.4+rnd()*.7;x.beginPath();x.moveTo(start,0);x.bezierCurveTo(start+15,95,start-25,170,start+8,256);x.stroke();}
 if(kind==='metal')for(let i=0;i<100;i++){x.strokeStyle='rgba(225,221,202,.1)';x.lineWidth=.3;x.beginPath();const a=rnd()*256,b=rnd()*256;x.moveTo(a,b);x.lineTo(a+rnd()*12,b+rnd()*2);x.stroke();}
 if(kind==='fabric')for(let i=0;i<256;i+=3){x.strokeStyle=i%2?'#999':'#777';x.lineWidth=.5;x.beginPath();x.moveTo(i,0);x.lineTo(i,256);x.moveTo(0,i);x.lineTo(256,i);x.stroke();}
 texture=new T.CanvasTexture(c);texture.anisotropy=sampling;if(color)texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;if(kind==='fabric')texture.repeat.set(2,4);texture.userData.shared=true;textures.set(key,texture);return texture;
}
export function disposeSurfaces(){textures.forEach(t=>t.dispose());textures.clear();}
