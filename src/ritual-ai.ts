// Compatibility exports; production decisions share the same fair architecture
// in both modes. The frozen V0.4 implementation lives only in tests/baselines.
import {decide,sanitizeObservation,type Observation,type Difficulty,type SearchOptions} from './ai';
import {inferIdentities,sampleWorlds,worldGame} from './belief';
export function ritualHypothesis(input:Observation,rng:()=>number){const o=sanitizeObservation(input),b=inferIdentities(o);return worldGame(o,b,sampleWorlds(b,1,rng)[0]);}
export const decideRitual=(o:Observation,difficulty:Difficulty,options:SearchOptions={})=>decide(o,difficulty,options);
