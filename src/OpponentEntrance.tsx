import {useId} from 'react';
import type {Difficulty} from './ai';
import './opponent-entrance.css';

const colors: Record<Difficulty, string> = {
  easy: '#d5b885', normal: '#83c9e4', hard: '#bc99dc', master: '#f8d28b', omniscient: '#e7ccf4',
};

function Attendant(){
  return <>
    <path className="entrance-cloth" d="M154 151L122 154 105 172 84 210 108 232 130 219 117 264H257L236 216 274 221 278 197 236 165 198 146Z"/>
    <path className="entrance-rim" d="M107 218l29-47 15 30-14 54m93-78-36 54-13-34m-40 55 19-27 31 7"/>
    <path className="entrance-face" d="M151 99l42-18 19 24-2 19-10 8-4 16-18 13-17-12-6-23-10-9z"/>
    <path className="entrance-solid" d="M141 114l-8-24 10-31 26-12 36 3 26 16-25 1 24 15-23 7-15 22-5-17-22 15 1 23-15-14z"/>
    <path className="entrance-rim" d="m140 87 26-24 33-4m-28 93 8 15 22-14 12 13-26 26-31-25m22-44 11 3 8-4"/>
    <path className="entrance-shade" d="m144 91 21-23 29-12 15 5-20 9-15 19-16 23zm18 51 10 5 16-6-12 12z"/>
    <path className="entrance-feature" d="m176 113 13-5 4 2-14 5zm18 3 6-6 4 3-7 5z"/>
    <g className="entrance-prop">
      <path className="entrance-metal" d="m123 200 57-22 54 19-7 30-59 26-51-22z"/>
      <path className="entrance-rim" d="m123 200 53 21 58-24m-58 24-8 32m-31-52 35-13 38 10-36 15z"/>
      <path className="entrance-bright" d="m166 198 6-6 7 4-7 6z"/>
      <path className="entrance-face" d="m112 212 20-4 12 8-6 8-24 9zm121-10-14 5 2 11 23-3 7-9z"/>
    </g>
  </>;
}

function Strategist(){
  return <>
    <path className="entrance-cloth" d="M153 135l-41 10-32 25-23 94h223l-10-64-28-42-48-23z"/>
    <path className="entrance-solid" d="m153 151-38-3-29 21 53 11 31-14zm44-1 42 7 25 28-54-3-24-18z"/>
    <path className="entrance-face" d="M208 80l-44-15-14 20-2 19-14 13 16 4 4 20 18 13 23-15 16-35z"/>
    <path className="entrance-solid" d="m211 106 19-38-22-23-26-4-28 14-33 30 35-2 23-15-6 23 17-12-4 39 9 32 20-29z"/>
    <path className="entrance-rim" d="m177 52 29-6 18 18m-52 119 22 37-9 44m-94-71 37 11 25-7m66-5 20 17m-83-99 14-3"/>
    <path className="entrance-shade" d="m120 171 34 12-11 72H96zm70-111 20-7 13 12-14 13-7-10z"/>
    <path className="entrance-feature" d="m151 108 17-7-5 6-12 2z"/>
    <g className="entrance-prop">
      <path className="entrance-bright" d="m221 218 50-139 15-23-2 29-48 140z"/>
      <path className="entrance-metal" d="m207 211 47 15-4 9-46-17zm16 11 12 4-13 35-10-4z"/>
      <path className="entrance-face" d="m194 233 18-9 19 7-4 17-20 5-20-9z"/>
    </g>
  </>;
}

function Chancellor(){
  return <>
    <path className="entrance-cloth" d="M140 137l-34 15-24 29-40 83h259l-43-84-36-34-32-7-15 20z"/>
    <path className="entrance-rim" d="M87 181l20 22-15 44m159-64-20 26 20 38m-111-103 35 27 46-24m-44 32 5 85"/>
    <path className="entrance-face" d="m150 82 33-25 24 35-4 29-12 21-16 12-16-19-9-28z"/>
    <path className="entrance-solid" d="m128 121 4-46 21-22 24-10 28 12 22 24-6 52-18 18 4-35-9-29-22-20-21 20-6 37 13 26-28-14z"/>
    <path className="entrance-metal" d="m120 70 34-31 28-5 37 15 25 24-43-10-25-12-24 13z"/>
    <path className="entrance-rim" d="m141 54 35-11 39 13m-52 54 9 2m14-2 9-3"/>
    <path className="entrance-shade" d="m125 158 32 23 17 82h-25l-25-69zm62-63 14 1-2 24-9 17-7-17z"/>
    <path className="entrance-feature" d="m155 106 15 3 2 3-15-1zm27 4 15-6-2 6-13 3z"/>
    <g className="entrance-prop">
      <path className="entrance-metal" d="M176 239l-75-36 2-23 16-14 22-7 23 4 19 10 13 22z"/>
      <path className="entrance-rim" d="m176 239-65-64m65 64-48-75m48 75-29-78m29 78-11-72m11 72 7-60m-76 13q38-38 82 1"/>
      <path className="entrance-face" d="m186 227 24 2 8 14-13 10-21-5-16-10z"/>
    </g>
  </>;
}

function Sovereign(){
  return <>
    <path className="entrance-cloth" d="M123 136l-47 26-39 102h270l-32-101-57-29-34 18z"/>
    <path className="entrance-metal" d="m124 135-59 46 51 6 51-29zm93 0 64 45-50 8-52-29z"/>
    <path className="entrance-rim" d="m62 196 58-12 46-23m16 1 52 22 59 10m-173 6 16 64m90-64-14 64m-43-91 26 22-25 22-23-22z"/>
    <path className="entrance-face" d="m135 87 27-16 47 13-5 30-9 21-24 20-23-19-8-22z"/>
    <path className="entrance-solid" d="m130 93 6-29 32-10 37 10 13 29-14 27-4-25-18-8-18 10-19-2 1 26z"/>
    <path className="entrance-rim" d="m151 110 13-4m13 0 14 4m-26 24 12 1"/>
    <path className="entrance-shade" d="m82 183 43-33 16 1-21 24zm136-32 45 22 10 10-46-9zm-36-53 15 7-7 27-18 17v-19z"/>
    <path className="entrance-feature" d="m149 115 14-4 5 2-7 4zm28-2 5-2 15 5-16 2z"/>
    <g transform="translate(0 -21)">
      <g className="entrance-prop">
        <path className="entrance-metal" d="m135 68-12-28 26 13 10-23 13 19 21-22 8 24 26-12-13 33-15 7-47-2z"/>
        <path className="entrance-bright" d="m167 58 7-6 7 7-8 8z"/>
        <path className="entrance-rim" d="m139 70 30 3h32l14-7"/>
      </g>
    </g>
    <path className="entrance-metal" d="m249 214 15-100 8 1-10 100zm3-97 5-11 11-11 12 16-10 13z"/>
  </>;
}

function Watcher(){
  return <>
    <path className="entrance-cloth" d="M128 133l-40 23-26 40-35 68h293l-37-69-37-42-40-21-36 26z"/>
    <path className="entrance-solid" d="m133 136-20-23 3-41 34-36 21-7 25 11 34 37 1 42-35 40-22 13-21-11z"/>
    <path className="entrance-face" d="m139 75 32-23 36 27 1 34-15 23-21 17-23-17-13-29z"/>
    <path className="entrance-solid" d="m136 96 37-25 36 22v12l-36-11-37 16z"/>
    <path className="entrance-rim" d="m118 93 17-33 36-25 39 26 17 31m-104 65 46 38 61-42m-104 31 23 78m77-75-22 74m-44-130 14 4 14-5"/>
    <path className="entrance-shade" d="m117 102 18-41 36-26-15 19-26 46zm117 16-19 27 37 38-18-39zM87 172 45 250l42-26 31-66z"/>
    <g className="entrance-prop">
      <path className="entrance-rim" d="M122 107q52-45 103 0-52 45-103 0z"/>
      <circle className="entrance-metal" cx="174" cy="107" r="14"/>
      <path className="entrance-bright" d="m174 96 4 11-4 11-4-11z"/>
    </g>
  </>;
}

const actors = {easy:Attendant, normal:Strategist, hard:Chancellor, master:Sovereign, omniscient:Watcher};

export function OpponentEntrance({difficulty}: {difficulty: Difficulty}){
  const id=useId();
  const Actor=actors[difficulty];
  return <svg className="opponent-entrance" data-rank={difficulty} style={{color:colors[difficulty]}} viewBox="0 0 348 264" aria-hidden="true">
    <defs>
      <radialGradient id={id}>
        <stop stopColor="currentColor" stopOpacity=".32"/>
        <stop offset="1" stopColor="currentColor" stopOpacity="0"/>
      </radialGradient>
    </defs>
    <ellipse className="entrance-light" cx="174" cy="116" rx="174" ry="126" fill={`url(#${id})`}/>
    <g className="entrance-sigil" fill="none" stroke="currentColor">
      <circle cx="174" cy="113" r="77" strokeWidth=".55"/>
      <circle cx="174" cy="113" r="84" strokeDasharray="2 8" strokeWidth=".8"/>
      {difficulty==='easy'&&<path d="m174 38 72 75-72 75-72-75z"/>}
      {difficulty==='normal'&&<path d="m90 145 163-86m-161 91 164-87"/>}
      {difficulty==='hard'&&<path d="m174 28 73 128H101zm0 170-73-128h146z"/>}
      {difficulty==='master'&&<path d="m81 120 28-51 65-33 65 33 28 51M109 69l-18-8m148 8 18-8"/>}
      {difficulty==='omniscient'&&<path d="M81 112q93-91 186 0-93 91-186 0zm93-81v167"/>}
    </g>
    <path className="entrance-accent" d="M19 232 94 220m160 0 75 12M25 238h46m207 0h45" fill="none" stroke="currentColor" strokeWidth=".65"/>
    <g className="entrance-actor"><Actor/></g>
  </svg>;
}
