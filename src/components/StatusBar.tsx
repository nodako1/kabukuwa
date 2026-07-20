import { locationById } from "../data/locations";
import { DAY_END, DAY_START, formatTime, getPeriodLabel, getTimePeriod } from "../game/clock";
import type { GameState } from "../types/game";

export const StatusBar = ({ state }: { state: GameState }) => {
  const progress = ((state.timeMinutes - DAY_START) / (DAY_END - DAY_START)) * 100;
  const boostMinutes = Math.max(0, state.buffs.appearanceBoostUntil - state.timeMinutes);
  return (
    <header className="status-bar">
      <div className="status-main">
        <div>
          <span className="day-label">夏休み {state.day}日目</span>
          <strong>{locationById[state.locationId].name}</strong>
        </div>
        <div className="clock" aria-label={`現在時刻 ${formatTime(state.timeMinutes)}`}>
          <small>{getPeriodLabel(getTimePeriod(state.timeMinutes))}</small>
          <b>{formatTime(state.timeMinutes)}</b>
        </div>
      </div>
      <div className="day-progress" aria-label="一日の進み具合">
        <span style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
        <i className="evening-mark" title="18時" />
      </div>
      {boostMinutes > 0 && <div className="boost-chip">出現率アップ 残り{boostMinutes}分</div>}
    </header>
  );
};
