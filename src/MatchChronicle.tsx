import { EyeOff } from 'lucide-react';
import { CONFIG, roleName, type Game } from './game';
import { PieceIcon } from './PieceIcon';
import { RitualStatus } from './RitualUI';

export function MatchChronicle({ board }: { board: Game }) {
  const { captures, quiet } = board;
  return <>
    <p className="public-label"><EyeOff size={15}/>仅记载已公开的身份</p>
    <div className="capture-summary">
      {(['red', 'blue'] as const).map(side => <div key={side} className={side}>
        <span className="side-gem"/><strong>{side === 'red' ? '红方' : '蓝方'}阵亡</strong>
        <div>{(['king', 'guard', 'martyr'] as const).map(role => {
          const count = captures.filter(c => c.side === side && c.role === role).length;
          return <span key={role} title={roleName[role] + '已阵亡数量'}>
            <PieceIcon role={role}/><small>{count}/{role === 'king' ? 1 : 3}</small>
          </span>;
        })}</div>
      </div>)}
    </div>
    <div className="chronicle">
      {captures.length ? [...captures].reverse().map((c, i) => <article key={c.id ?? captures.length - 1 - i}>
        <span className="log-number">{Math.ceil(c.ply / 2).toString().padStart(2, '0')}</span>
        <div><strong><span className={c.side}>{c.side === 'red' ? '红方' : '蓝方'}</span> · {roleName[c.role]}揭示</strong>
          <p>{c.at} 的封印已破碎</p>
        </div>
      </article>) : <p className="empty-log">尚无封印被打破</p>}
    </div>
    <p>距无吃子平局 · {Math.ceil((CONFIG.quietFullRounds * 2 - quiet) / 2)} 完整回合</p>
    <RitualStatus game={board}/>
  </>;
}
