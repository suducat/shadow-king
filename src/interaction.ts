import * as T from 'three';
import type { VisibleRole } from './game';
export type Cell = { x: number; y: number };
export function resolvePick(board:Cell|null,body:Cell|null,legal:Cell[],selected:string|null):Cell|null{
 // Tall foreground bodies can overlap a highlighted floor destination in perspective.
 // Once a move is selected, its exact legal board cell takes precedence.
 return selected&&board&&legal.some(c=>c.x===board.x&&c.y===board.y)?board:body??board;
}
export const BOARD_TOP = .14;
export function cellToWorld(x: number, y: number, height = BOARD_TOP) {
  return new T.Vector3(x - 3, height, y - 3);
}
export function worldToCell(point: T.Vector3): Cell | null {
  const x = Math.floor(point.x + 3.5), y = Math.floor(point.z + 3.5);
  return x >= 0 && x < 7 && y >= 0 && y < 7 ? { x, y } : null;
}
export function clientToNDC(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
  // CSS pixels on BOTH sides; devicePixelRatio affects only the drawing buffer.
  if (!rect.width || !rect.height) return null;
  const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? new T.Vector2(x * 2 - 1, 1 - y * 2) : null;
}
const plane = new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP);
export function intersectBoard(ray: T.Ray): Cell | null {
  const point = ray.intersectPlane(plane, new T.Vector3());
  return point ? worldToCell(point) : null;
}
export function bodyPickMesh(role:VisibleRole='unknown') {
  // An explicit, narrow body silhouette. No robe lines, halos, weapons or particles.
  // This shape stays inside the rendered torso; it does not inflate a collider.
  const shoulder=role==='unknown'?.215:role==='martyr'?.30:.30;
  const profile = [[.01,.17],[.24,.18],[.23,.35],[.18,.62],[.19,.87],[shoulder,1.05],[.12,1.17],[.105,1.43],[.06,1.53],[0,1.58]];
  const pick = new T.Mesh(new T.LatheGeometry(profile.map(([x,y]) => new T.Vector2(x,y)),16), new T.MeshBasicMaterial());
  pick.visible = false;
  return pick;
}
