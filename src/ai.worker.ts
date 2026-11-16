import {decide, type Observation, type Difficulty} from './ai';
self.onmessage=(event:MessageEvent<{id:number;observation:Observation;difficulty:Difficulty;seed:number}>)=>{
 const {id,observation,difficulty,seed}=event.data;
 try{self.postMessage({id,decision:decide(observation,difficulty,{seed,...(difficulty==='omniscient'?{onFallback:(decision:import('./ai').Decision)=>self.postMessage({id,fallback:decision})}:{})})});}
 catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
