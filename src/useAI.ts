import {useEffect,useRef,useState} from 'react';
import {decide, type Observation,type Difficulty,type Action,type Decision} from './ai';
export function useAI(observation:Observation|null,difficulty:Difficulty,paused:boolean,onSelect:(id:string)=>void,onAction:(a:Action)=>void){
 const callbacks=useRef({onSelect,onAction});callbacks.current={onSelect,onAction};
 const stopRef=useRef(()=>{}),sequence=useRef(0);
 const [thinking,setThinking]=useState(false),[diagnostic,setDiagnostic]=useState<{nodes:number;samples:number;algorithm:string;fallback:boolean}|null>(null);
 useEffect(()=>{
  if(!observation||paused){setThinking(false);return;}
  let alive=true,settled=false,worker:Worker|undefined,wait:ReturnType<typeof setTimeout>|undefined,limit:ReturnType<typeof setTimeout>|undefined;
  const token=++sequence.current,began=performance.now();setThinking(true);
  const valid=()=>alive&&sequence.current===token;
  const accept=(decision:Decision,fallback=false)=>{
   if(!valid()||settled)return;settled=true;worker?.terminate();clearTimeout(limit);
   setDiagnostic({nodes:decision.nodes,samples:decision.samples,algorithm:decision.algorithm,fallback});
   if(!decision.action){setThinking(false);return;}
   const action=decision.action;
   wait=setTimeout(()=>{if(!valid())return;callbacks.current.onSelect(action.id);
    wait=setTimeout(()=>{if(!valid())return;setThinking(false);callbacks.current.onAction(action);},200);
   },Math.max(0,380-(performance.now()-began)));
  };
  const fallback=()=>{if(valid()&&!settled)accept(decide(observation,'easy',{seed:observation.ply+71,maxMillis:16,nodeBudget:100}),true);};
  // The watchdog terminates a wedged Worker. The fallback uses the finite
  // public belief with a 16ms soft cutoff and 100 search nodes; engine validation still applies.
  try{
   worker=new Worker(new URL('./ai.worker.ts',import.meta.url),{type:'module'});
   worker.onmessage=e=>{if(!valid()||e.data.id!==token)return;if(e.data.error)fallback();else accept(e.data.decision);};
   worker.onerror=e=>{e.preventDefault();fallback();};
   limit=setTimeout(()=>{if(valid()&&!settled){worker?.terminate();fallback();}},1800);
   worker.postMessage({id:token,observation,difficulty,seed:Math.floor(Math.random()*0xffffffff)});
  }catch{fallback();}
  const stop=()=>{alive=false;sequence.current++;worker?.terminate();clearTimeout(wait);clearTimeout(limit);};
  stopRef.current=stop;
  return()=>{stop();if(stopRef.current===stop)stopRef.current=()=>{};};
 },[observation,difficulty,paused]);
 return{thinking,diagnostic,stop:()=>stopRef.current()};
}
