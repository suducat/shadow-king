import {buildFallenMesh, type FallenMeshData} from './models';
import type {Role} from './game';

export type FallenMeshMessage = FallenMeshData & {role:Role};

// This worker builds public asset geometry and never receives match data.
for(const role of ['guard','martyr','king'] as const){
 const {positions,indices}=buildFallenMesh(role);
 const message:FallenMeshMessage={role,positions,indices};
 self.postMessage(message,{transfer:[positions.buffer,indices.buffer]});
}
