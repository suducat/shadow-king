import {useEffect,useId,useState} from 'react';
import './opponent-entrance.css';
import './home-court.css';

const chapters=[
 {role:'king',name:'王',color:'#e6c58c',draw:King},
 {role:'guard',name:'影卫',color:'#9acfe8',draw:Guard},
 {role:'martyr',name:'死士',color:'#ba9ac4',draw:Martyr},
];

function King(){
 return <>
  <path className="entrance-cloth" d="M205 133l-52 23-46 143 102-25 75 25-8-111-41-43z"/>
  <path fill="#4a232c" d="m152 165 38-16-35 111-36 29zm86-14 42 44 6 92-52-19 16-56z"/>
  <path className="entrance-metal" d="m169 147 34-18 37 9 28 26-48 12-52-5-19-7z"/>
  <path className="entrance-solid" d="m179 164 37 12 35-13-12 67 10 58-38-14-45 15 15-63z"/>
  <path className="entrance-rim" d="m180 176 33 12 29-10m-60 41 51-4m-49 60 17-45 13 39m16 5-8-46"/>
  <path className="entrance-face" d="m188 104 25-17 28 20-4 29-13 17-19-3-12-15z"/>
  <path className="entrance-solid" d="m188 123-7-24 15-17 37 2 12 19-7 24-7-18-19-6-15 10-2 20zm13 14 12 6 15-8-6 17-13 5z"/>
  <path className="entrance-metal" d="m188 105-10-36 18 8 12-24 12 22 21-16-4 41-21 7z"/>
  <path className="entrance-bright" d="m185 93 24 4 25-7-1 5-23 8-23-5zm25-22 5 9-5 8-5-8z"/>
  <path className="entrance-rim" d="m198 121 10-3m11-1 10 2"/>
  <g className="home-prop">
   <path className="entrance-metal" d="m301 121 6 1-25 168-5-1zm-7 1-8-20 23-20 16 24-17 17z"/>
   <path className="entrance-bright" d="m306 94 9 12-12 10-8-13z"/>
   <path className="entrance-cloth" d="m247 172 27 17 23-18 7 13-27 28-26-8z"/>
   <path className="entrance-face" d="m292 169 10-8 9 8-3 14-11-1z"/>
  </g>
 </>;
}

function Guard(){
 return <>
  <path className="entrance-cloth" d="m205 140-39 17-61 64-47 47 65-7 25-20-18 47 111-25 37-58z"/>
  <path className="entrance-shade" d="m175 168-49 58-33 25 34-6 57-67z"/>
  <path className="entrance-metal" d="m186 211-35 28-28 44-24 13h49l38-42 34-15 36 9-19 31-6 17h52l-18-18 28-41-17-24-49-20z"/>
  <path className="entrance-rim" d="m125 281 20-8m42-27 12-13m72 4-15 30m-8 11 15-3"/>
  <path className="entrance-solid" d="m193 143 39-12 37 27-13 45-36 24-47-10 19-30-20-20z"/>
  <path className="entrance-metal" d="m219 138-30 8-19 21 22 20 29-11 16-29zm10 36 29-22 18 10-6 23-40 20-17 2z"/>
  <path className="entrance-solid" d="m207 128-8-32 18-24 37-10 24 19-4 25-16 30-27 7z"/>
  <path className="entrance-metal" d="m199 100 16-23 38-10 24 14-9 17-29 6-9 23-20-1z"/>
  <path className="entrance-bright" d="m229 105 39-11-5 6-34 10z"/>
  <g className="home-prop">
   <path className="entrance-metal" d="m228 188 27 8 29-14 8 13-30 21-35-6zm38-42 23 5 14 15-11 12-33-11zm9 27 35 28 6-9-34-28z"/>
   <path className="entrance-face" d="m287 167 16-8 9 9-3 13-12 8-10-6zm4 19 16-6 8 8-9 13-16-1z"/>
   <path className="entrance-bright" d="m303 165 58-87 24-20-7 29-62 88z"/>
   <path className="entrance-rim" d="m312 167 66-99"/>
   <g className="home-sword-light" fill="none" stroke="#eaf8ff" strokeWidth="1.25">
    <path d="M335 126q-31 11-40-9m58-11q28 7 52-11m-40-9q-13-20-8-41m9 43 25-24m-53 67 10 4"/>
    <path className="entrance-bright" d="m354 96 7-13 1 10 12-4-15 14-8 11 2-14-8 1z"/>
   </g>
  </g>
 </>;
}

function Martyr(){
 return <>
  <path className="entrance-cloth" d="m222 144 43 6 30 43 29 96-49-19-47 26-74-11 24-37 6-61z"/>
  <path className="entrance-solid" d="m203 144 39-12 26 23-17 48-20 24-47-21zm-25 59 36 16-33 29-32-10-7-17 15-14z"/>
  <path className="entrance-shade" d="m247 180 22-21 42 117-33-19-17-48zm-61 57 27-14-11 55-28 4z"/>
  <path className="entrance-cloth" d="m193 123 6-38 27-28 35 16 20 37-8 46-29 21-24-13-30-16z"/>
  <path className="entrance-solid" d="m207 117 14-28 31-8 15 33-10 32-22 12-13-16-14-5z"/>
  <path className="entrance-face" d="m221 118 27-26 10 15-7 20 6 11-19-4-5 13-9-14-17-1z"/>
  <path className="entrance-feature" d="m223 119 17-4-4 5-13 2z"/>
  <path className="entrance-rim" d="m197 116 14-32 19-13m34 20 8 28-11 32m-37 64-14 56m31-36 13 23m-68-31 10-10-5-11"/>
  <path className="entrance-cloth" d="m109 54 70 10-4 49 6 49-16 42 6 98H91V56z"/>
  <path className="entrance-shade" d="m106 57 17 8 7 227-25 10zm39 4 26 8-9 89 3 85-12 53-2-133z"/>
  <path className="entrance-rim" d="m104 62 6 225m38-220 8 91-4 127"/>
  <g className="home-prop">
   <path className="entrance-face" d="m175 206-13-7-8-12 4-5 10 10-3-14 6-3 5 15 5-10 5 3-1 15-7 13z"/>
   <path className="entrance-metal" d="m209 197 13-15 15 13-13 16z"/>
   <path className="entrance-rim" strokeDasharray="1 4" d="M224 174a22 22 0 1 0 .1 0z"/>
  </g>
 </>;
}

function Floor(){
 const point=(column:number,row:number)=>`${220+(column-3.5)*(26+row*7)},${239+row*(6+row*.86)}`;
 return <g className="home-floor">
  {Array.from({length:49},(_,i)=>{
   const x=i%7,y=Math.floor(i/7);
   return <polygon key={i} className={(x+y)%2?'home-pale':''} points={[point(x,y),point(x+1,y),point(x+1,y+1),point(x,y+1)].join(' ')}/>;
  })}
 </g>;
}

export function HomeCourt({reduced}:{reduced:boolean}){
 const [active,setActive]=useState(0);
 const {role,name,color,draw:Portrait}=chapters[active];
 const light=useId();
 useEffect(()=>{
  if(reduced)return;
  const timer=setTimeout(()=>setActive(value=>(value+1)%chapters.length),5500);
  return ()=>clearTimeout(timer);
 },[active,reduced]);
 return <section className="court-hero-art" aria-label="永夜王庭角色演出">
  <svg key={role} className="home-portrait" data-role={role} style={{color}} viewBox="0 0 440 345" role="img" aria-label={name}>
   <defs><radialGradient id={light}><stop stopColor="currentColor" stopOpacity=".28"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></radialGradient></defs>
   <ellipse className="entrance-light" cx="220" cy="151" rx="192" ry="157" fill={`url(#${light})`}/>
   <path className="home-vault" fill="none" stroke="currentColor" d="M44 267V143q12-62 53-90 36 24 53 90v97m-82 23V146m222 95v-98q12-62 53-90 37 24 53 90v124m-25-4V146"/>
   <g className="entrance-sigil" stroke="currentColor" fill="none"><circle cx="220" cy="147" r="105" strokeWidth=".45"/><circle cx="220" cy="147" r="112" strokeWidth=".8" strokeDasharray="2 9"/></g>
   <Floor/>
   <ellipse cx="220" cy="292" rx="129" ry="15" fill="#0b111a" opacity=".75"/>
   <g className="entrance-actor"><Portrait/></g>
  </svg>
 </section>;
}
