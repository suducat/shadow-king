import {decide, type Observation, type Difficulty} from './ai';
self.onmessage=(event:MessageEvent<{id:number;observation:Observation;difficulty:Difficulty;seed:number}>)=>{
 const {id,observation,difficulty,seed}=event.data;
 try{self.postMessage({id,decision:decide(observation,difficulty,{seed})});}
 catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
