import {useId} from 'react';
import type {GameMode} from './ritual';
import './rule-entrance.css';

function CourtBoard(){
  const point=(col:number,row:number)=>{
    const width=30+row*5;
    return `${320+(col-3.5)*width},${287+row*row*2.6}`;
  };
  return <g className="rule-board">
    {Array.from({length:49},(_,i)=>{
      const x=i%7,y=Math.floor(i/7);
      return <polygon key={i} className={(x+y)%2?'rule-tile pale':'rule-tile'} points={[point(x,y),point(x+1,y),point(x+1,y+1),point(x,y+1)].join(' ')}/>;
    })}
  </g>;
}

function Duel(){
  return <>
    <path className="rule-distant" d="M116 302V151l38-58 39 58v151m-61-115v115m376 0V151l-38-58-39 58v151m61-115v115"/>
    <CourtBoard/>
    <g className="rule-guard">
      <ellipse cx="210" cy="341" rx="101" ry="16" fill="#080d16" opacity=".72"/>
      <path className="rule-cloth" d="M201 154c-29 17-62 33-108 26l31 46-61 28c46 13 104-4 143-24l27-42z"/>
      <path className="rule-cel" d="m96 251 67-30 47-48-15 49-48 24z"/>
      <path className="rule-steel" d="m187 235-28 40-61 44-12 19 45 2 66-44 42-52zm31-10 48 18 25 36-31 48 13 11h-46l-6-16 27-44-47-22z"/>
      <path className="rule-cloth" d="m191 148 35-16 30 29-2 41-27 45-47-14 16-39-23-17z"/>
      <path className="rule-steel" d="m180 165 19-24 21 5 22 20-10 26-35 9-17-13zm29 39 44-16-12 34-15 16-38-10z"/>
      <path className="rule-face" d="m216 103 38-12 18 21 1 16 10 12-17 5-7 19-21-7-10-10-10-15z"/>
      <path className="rule-steel" d="m211 130-9-27 18-25 35-2 20 17 5 18-30-1-19 11 11 35-17-10z"/>
      <path className="rule-ink" d="m215 102 12-13 38 1m-24 29 27-4m-8 20 11-3m-92 89 41 12m-108 92 22-1m96 0 23 1"/>
      <g className="rule-blade">
        <path className="rule-steel" d="m222 171 32 18 44-23 15 15-53 30-34-9z"/>
        <path className="rule-face" d="m292 166 12-8 15 8 5 12-12 11-13-7z"/>
        <path className="rule-metal" d="m292 167 40 14 4-8-40-14z"/>
        <path className="rule-silver" d="m313 166 38-85 14-17 2 25-43 81z"/>
        <path className="rule-ink" d="m320 158 43-83"/>
      </g>
    </g>
    <g className="rule-martyr">
      <ellipse cx="447" cy="340" rx="95" ry="16" fill="#0a0a13" opacity=".69"/>
      <path className="rule-cloth" d="M433 152c43 0 80 25 110 13l-26 36 66 29c-37 20-69 27-109-2l-25-44z"/>
      <path className="rule-cloth" d="m422 156-27 29-15 71-37 80h63l41-65 13 54 52 13-17-40-18-78-23-63z"/>
      <path className="rule-cel" d="m419 187-17 63-37 78 33-13 37-59 6-57zm37 60 10 66 31 16-18-29-10-51z"/>
      <path className="rule-cloth" d="m391 137 10-37 31-31 40 24 16 53-21 29-50-6z"/>
      <path className="rule-face" d="m417 133-19 3 11-16 4-11 18-14 22 17-4 24-19 21-12-10z"/>
      <path className="rule-cel" d="m405 122 7-22 20-17 31 21 2 40-29 21 12-32-16-27z"/>
      <path className="rule-ink" d="m411 119 14 3m-12 18 11 6m45 36 18 42m-69-38-14 40"/>
      <path className="rule-cloth" d="m418 181-31 26-44-18-8 20 53 25 35-11 25-29z"/>
      <path className="rule-face" d="m347 190-10-8-11-2-9 4 16 8-9 5 8 7 11-1z"/>
      <path className="rule-metal" d="m405 227 18 8-10 17-17-9z"/>
    </g>
    <g className="rule-duel-seal" fill="none" stroke="#d1a1ed">
      <circle cx="343" cy="171" r="27" strokeOpacity=".6"/>
      <path d="m343 148 21 35h-42zm0 46-20-35h40z"/>
    </g>
    <g className="rule-duel-flare">
      <path d="m339 151 29-32-15 35 37 8-37 9-18 43-1-34-38 18 24-29-35-14 38-2 15-35z" fill="#f5ebff"/>
      <path d="m310 145-38-22m100 26 38-29m-46 70 31 25m-74-21-19 38" fill="none" stroke="#d5b7f4" strokeWidth="2"/>
    </g>
  </>;
}

function Coronation(){
  return <>
    <path className="rule-distant" d="M98 348V161l42-71 43 71v187m-68 0V174m427 174V161l-42-71-43 71v187m68 0V174"/>
    <g className="rule-altar-aura" fill="none" stroke="#e8bf82">
      <circle cx="320" cy="192" r="143" strokeOpacity=".5"/>
      <circle cx="320" cy="192" r="130" strokeDasharray="1 7"/>
      <path d="m320 65 109 190H211zm0 255-109-190h218z" strokeOpacity=".38"/>
      <path d="M320 31v45m0 234v54M172 192h-29m325 0h29" strokeOpacity=".8"/>
    </g>
    <path className="rule-altar-light" d="m278 14 84 0 55 340-200 0z" fill="#ffdc94"/>
    <path className="rule-altar-side" d="M161 346h318v14H161zm-27 26h372v13H134zm-25 27h422v14H109z"/>
    <path className="rule-altar-top" d="m161 346 33-31h252l33 31zm-27 26 27-12h318l27 12zm-25 27 25-14h372l25 14z"/>
    <path className="rule-altar-grid" d="M184 325h272m-284 11h295m-232 10 28-31m31 31 9-31m43 31-9-31m68 31-28-31"/>
    <g className="rule-king">
      <path className="rule-cloth" d="m277 154-38 29-29 81-25 65h264l-32-63-18-74-43-34-39 13z"/>
      <path className="rule-cel" d="m229 311 35-106-8 86-16 30h-20zm154-107 14 61 30 56h-27l-25-47z"/>
      <path className="rule-cloth" d="m288 164 31-10 37 10 14 69-21 35 16 61H263l24-63-19-44z"/>
      <path className="rule-metal" d="m272 162-34 29 35 18 29-26zm74 22 26 26 34-22-44-27zm-64 74 78 1 4 12-87 1z"/>
      <path className="rule-face" d="m286 112 17-21 44 13 5 26-11 21-25 12-23-18z"/>
      <path className="rule-cloth" d="m286 132-10-31 21-19 34-4 28 22-6 26-11-14-29-7-15 13v22z"/>
      <path className="rule-metal" d="m287 101-12-36 25 14 18-26 17 25 24-17-11 40-19 7z"/>
      <path className="rule-gold" d="m319 79 6 10-6 8-6-9z"/>
      <path className="rule-ink" d="m299 130 13-5 4 2m10 0 12 4m-25 16 12 1m-35 23 30 45 33-48m-32 50 22 20-22 16-21-16z"/>
      <g className="rule-scepter">
        <path className="rule-metal" d="M409 125h8l-7 197h-8zm-7 4-9-21 21-21 19 22-8 20z"/>
        <path className="rule-gold" d="m414 94 11 14-11 14-10-14z"/>
        <path className="rule-cloth" d="m379 201 20 14 9-17 12 9-8 29-25 5-25-17z"/>
        <path className="rule-face" d="m408 198 8-5 10 8-3 13-12 3-6-7z"/>
      </g>
      <path className="rule-robe-light" d="M280 278l-14 45m23 3 15-37m45 32-13-38m20 1 11 39" fill="none" stroke="#f4d994" strokeWidth="1.5"/>
    </g>
    <g className="rule-altar-stars" fill="#ffe3a4">
      <path d="m204 151 4 12 12 4-12 4-4 12-4-12-12-4 12-4zm250 0 5 14 14 5-14 4-5 14-4-14-14-4 14-5zM366 49l4 9 9 4-9 4-4 9-4-9-9-4 9-4zm-142 73 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>
      <circle cx="182" cy="240" r="2.2"/><circle cx="465" cy="238" r="2"/><circle cx="417" cy="64" r="2.6"/><circle cx="257" cy="63" r="2.5"/>
    </g>
    <ellipse className="rule-altar-wave" cx="320" cy="337" rx="177" ry="24" fill="none" stroke="#f9d68d" strokeWidth="2"/>
  </>;
}

export function RuleEntrance({rule}: {rule: GameMode}){
  const glow=useId();
  const ritual=rule==='ritual';
  return <figure className="rule-entrance" data-rule={rule}>
    <svg viewBox="0 0 640 430" role="img" aria-label={ritual?'国王登临祭台，金色法阵环绕王冠与权杖':'影卫挥剑，与召唤法阵的死士在棋盘上交锋'}>
      <defs>
        <radialGradient id={glow}>
          <stop stopColor={ritual?'#b07ad1':'#86a4d1'} stopOpacity=".35"/>
          <stop offset="1" stopColor={ritual?'#e7bd7f':'#9e91cc'} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="320" cy="202" rx="298" ry="210" fill={`url(#${glow})`}/>
      {ritual?<Coronation/>:<Duel/>}
    </svg>
  </figure>;
}
