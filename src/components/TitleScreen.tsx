import { formatTime } from "../game/clock";
import type { GameState } from "../types/game";
import { locationById } from "../data/locations";

interface TitleScreenProps {
  savedState: GameState | null;
  onContinue: () => void;
  onNewGame: () => void;
}

export const TitleScreen = ({ savedState, onContinue, onNewGame }: TitleScreenProps) => (
  <main className="title-screen">
    <div className="summer-sky" aria-hidden="true">
      <span className="sun-disc" />
      <span className="cloud cloud-one" />
      <span className="cloud cloud-two" />
      <span className="distant-hill hill-one" />
      <span className="distant-hill hill-two" />
      <span className="title-tree tree-left" />
      <span className="title-tree tree-right" />
    </div>

    <section className="title-card" aria-labelledby="game-title">
      <p className="title-kicker">世界中のカブト・クワガタを探す</p>
      <h1 id="game-title">
        カブクワの
        <span>夏休み</span>
      </h1>
      <p className="title-copy">おばあちゃんの村で過ごす、朝6時から夜8時までの小さな冒険。</p>

      <div className="title-actions">
        {savedState && (
          <button className="primary-button" onClick={onContinue}>
            <strong>つづきから</strong>
            <small>
              {savedState.day}日目 {formatTime(savedState.timeMinutes)}・
              {locationById[savedState.locationId].mapLabel}
              {savedState.exploration?.focusedSpotId ? "の探索地点" : ""}
            </small>
          </button>
        )}
        <button className={savedState ? "text-button" : "primary-button"} onClick={onNewGame}>
          {savedState ? "はじめから" : "夏休みをはじめる"}
        </button>
      </div>
    </section>
    <p className="prototype-note">第一段階 プレイアブル版</p>
  </main>
);
