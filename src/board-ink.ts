import {Vector3,type Camera} from 'three';

type InkKind='slide'|'dash'|'impact'|'shatter'|'soul'|'charge'|'rite';
const svgNS='http://www.w3.org/2000/svg';
const blue='#c7eaff', white='#f7f4e9';
const artwork:Record<InkKind,[string,number]> = {
 slide:[`<path fill="currentColor" d="M0 -7Q-13 -10 -54 -1L-19 -1ZM-9 4Q-26 4 -72 12L-24 10ZM-14 13L-52 19L-29 14Z"/>`,340],
 dash:[`<path fill="#86b8e6" opacity=".65" d="M0 8Q47 -17 100 -3Q61 3 21 13Z"/><path fill="currentColor" d="M0 5Q52 -13 100 -3Q58 -2 15 9Z"/><path d="M10 -3Q54 -21 94 -10M8 14Q44 4 74 5" stroke="currentColor" stroke-width=".9" fill="none"/>`,245],
 impact:[`<path fill="currentColor" d="M-22 4l15-5-6-13 13 8 14-17-5 18 18 3-18 8 4 11L0 12l-12 10 3-13Z"/><path d="M-29 -9l-7 -4m58 -3 8 -5m-8 34 11 4" fill="none" stroke="currentColor" stroke-width="2"/>`,205],
 shatter:[`<path d="M-8 7l-6-17 9 4 4-9 3 12 13-8-6 12 6 7-12 0-5 10-1-8Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m-26 -20 12 4-7 8Zm46 -4 11 9-14 1Zm3 31 13 6-16 9Zm-46 2-5 14 15-7Zm23 -31 4-11 6 10Z" fill="currentColor"/>`,320],
 soul:[`<path d="M0 -22c10 0 14 9 11 14C8 -1 1 -5 -1 7c-4-4-12-8-12-16 0-7 6-13 13-13Z" fill="#243861" stroke="currentColor" stroke-width="1.9"/><path d="M-4 -12v3m8 -3v3m-15 16-3 5m25 -11 3 5" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>`,540],
 charge:[`<path d="M0 -21v42m-17-21h34M-11-11l22 22M11-11l-22 22M-28-14l13 8m34 15 13 8m-49 8 8-14m16-25 10-12" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="m0 -12 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="currentColor"/>`,460],
 rite:[`<path d="M-49 0 0-22 49 0 0 22Z M-32 0 0-13 32 0 0 13Z" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="m-21 0 4-4 4 4-4 4Zm17 0 4-4 4 4-4 4Zm17 0 4-4 4 4-4 4Z" fill="#e8c98a"/>`,680],
};
type Mark={
 kind:InkKind; at:number; life:number; node:SVGGElement; reduced:boolean;
 anchor:Vector3; direction?:Vector3; end?:Vector3; follow?:()=>Vector3;
};
const offset=new Vector3(), boardUnit=new Vector3(0,1,0);
export class BoardInk {
 readonly element=document.createElementNS(svgNS,'svg');
 private marks:Mark[]=[];
 private point=new Vector3();
 constructor(host:HTMLElement){
  this.element.classList.add('board-ink');
  this.element.setAttribute('aria-hidden','true');
  host.append(this.element);
 }
 get active(){return this.marks.length>0;}
 add(kind:InkKind,at:number,anchor:Vector3,options:{direction?:Vector3;end?:Vector3;follow?:()=>Vector3;reduced?:boolean;color?:string}={}){
  if(options.reduced&&['slide','dash','soul'].includes(kind))return;
  if(this.marks.length>=14)this.marks.shift()?.node.remove();
  const node=document.createElementNS(svgNS,'g');
  const [shape,life]=artwork[kind];
  node.innerHTML=shape;
  node.dataset.ink=kind;
  node.style.color=options.color??(kind==='rite'?'#e7bbfb':kind==='impact'?white:blue);
  this.element.append(node);
  this.marks.push({kind,at,life:options.reduced?165:life,node,anchor:anchor.clone(),direction:options.direction?.clone(),end:options.end?.clone(),follow:options.follow,reduced:!!options.reduced});
 }
 tick(now:number,camera:Camera,width:number,height:number){
  if(!this.active)return;
  if(document.hidden||width<=0||height<=0){this.clear();return;}
  camera.updateMatrixWorld();
  const project=(point:Vector3)=>{
   this.point.copy(point).project(camera);
   return {x:(this.point.x+1)*width/2,y:(1-this.point.y)*height/2};
  };
  for(let i=this.marks.length-1;i>=0;i--){
   const m=this.marks[i], t=Math.max(0,(now-m.at)/m.life);
   if(t>=1){m.node.remove();this.marks.splice(i,1);continue;}
   const world=m.follow?.()??m.anchor, origin=project(world);
   const tip=m.end?project(m.end):m.direction?project(offset.copy(world).add(m.direction)):null;
   const dx=tip?tip.x-origin.x:0,dy=tip?tip.y-origin.y:0;
   const unit=project(offset.copy(world).add(boardUnit)).y-origin.y;
   const scale=Math.max(.32,Math.min(1.65,Math.abs(unit)/55));
   const grow=m.reduced?1:m.kind==='shatter'?.55+t*.8:m.kind==='charge'?1.25-t*.55:1;
   const angle=tip?Math.atan2(dy,dx)*180/Math.PI:0;
   const y=origin.y-(m.kind==='soul'?t*34*scale:0);
   const opacity=m.reduced?.68:Math.min(1,(1-t)*2.35)*(m.kind==='slide'?.74:1);
   const stretch=m.end?Math.hypot(dx,dy)/100:scale*grow;
   m.node.setAttribute('transform',`translate(${origin.x} ${y}) rotate(${angle}) scale(${stretch} ${scale*grow})`);
   m.node.setAttribute('opacity',String(opacity));
  }
 }
 clear(){this.element.replaceChildren();this.marks.length=0;}
 destroy(){this.clear();this.element.remove();}
}
