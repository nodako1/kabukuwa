import { useEffect, useId, useMemo, useRef, useState } from "react";
import { insects, insectById } from "../data/insects";
import { locationById } from "../data/locations";
import { npcs, npcById } from "../data/npcs";
import { formatTime } from "../game/clock";
import { getOutcomeTitle } from "../game/engine";
import { getGrandmaHint, isLocationAvailable, visibleLocations } from "../game/rules";
import { MockAdRewardProvider } from "../ports/AdRewardProvider";
import type { AdRewardKind, GameCommand, GameState, Outcome } from "../types/game";

interface SheetProps {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

const Sheet = ({ title, eyebrow, onClose, children, className = "" }: SheetProps) => {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = sheet.parentElement;
    const host = backdrop?.parentElement;
    const backgroundElements = host
      ? Array.from(host.children).filter((element) => element !== backdrop) as HTMLElement[]
      : [];
    const previousInert = backgroundElements.map((element) => element.inert);
    backgroundElements.forEach((element) => { element.inert = true; });

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => Array.from(sheet.querySelectorAll<HTMLElement>(focusableSelector));
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    sheet.addEventListener("keydown", handleKeyDown);
    return () => {
      sheet.removeEventListener("keydown", handleKeyDown);
      backgroundElements.forEach((element, index) => { element.inert = previousInert[index]; });
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={sheetRef}
        className={`bottom-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            {eyebrow && <p>{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="閉じる">
            閉じる
          </button>
        </header>
        <div className="sheet-content">{children}</div>
      </section>
    </div>
  );
};

export const MapSheet = ({
  state,
  dispatch,
  onClose,
}: {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onClose: () => void;
}) => (
  <Sheet title="村の地図" eyebrow={`${state.day}日目 ${formatTime(state.timeMinutes)}`} onClose={onClose}>
    {state.timeMinutes >= 1080 && (
      <div className="night-rule">18時以降は、おばあちゃんの家と裏庭だけ。</div>
    )}
    <div className="route-list">
      {visibleLocations(state).map((location, index) => {
        const access = isLocationAvailable(state, location.id);
        const current = location.id === state.locationId;
        return (
          <div className="route-row" key={location.id}>
            <span className="route-line" aria-hidden="true" />
            <span className={`route-dot route-${index}`} aria-hidden="true" />
            <button
              disabled={!access.available || current}
              onClick={() => {
                dispatch({ type: "MOVE", locationId: location.id });
                onClose();
              }}
            >
              <span>
                <strong>{location.mapLabel}</strong>
                <small>{current ? "いまここ" : access.available ? `${location.travelMinutes}分` : access.reason}</small>
              </span>
              <b>{current ? "現在地" : access.available ? "行く" : "—"}</b>
            </button>
          </div>
        );
      })}
    </div>
  </Sheet>
);

export const EncyclopediaSheet = ({ state, onClose }: { state: GameState; onClose: () => void }) => (
  <Sheet title="カブクワ図鑑" eyebrow={`${new Set(state.specimens.map((item) => item.insectId)).size} / ${insects.length}種`} onClose={onClose}>
    <div className="card-list">
      {insects.map((insect) => {
        const catches = state.specimens.filter((specimen) => specimen.insectId === insect.id);
        const best = catches.reduce((value, specimen) => Math.max(value, specimen.sizeMm), 0);
        const found = catches.length > 0;
        return (
          <article className={`collection-card ${found ? "is-found" : "is-unknown"}`} key={insect.id}>
            <div className="beetle-medallion" aria-hidden="true">
              <i className={insect.family === "カブトムシ" ? "rhino-mark" : "stag-mark"} />
            </div>
            <div>
              <small>レア度 {"●".repeat(insect.rarity)}{"○".repeat(5 - insect.rarity)}</small>
              <h3>{found ? insect.name : "まだ見つけていない"}</h3>
              <p>{found ? `${catches.length}匹 · 最大 ${best.toFixed(1)}mm` : insect.hint}</p>
            </div>
          </article>
        );
      })}
    </div>
  </Sheet>
);

export const PeopleSheet = ({ state, onClose }: { state: GameState; onClose: () => void }) => (
  <Sheet title="ひとびとの記録" eyebrow={`${state.metNpcIds.length} / ${npcs.length}人`} onClose={onClose}>
    <div className="card-list">
      {npcs.map((npc) => {
        const met = state.metNpcIds.includes(npc.id);
        const count = state.npcTalkCounts[npc.id] ?? 0;
        return (
          <article className={`person-card ${met ? "is-met" : "is-unknown"}`} key={npc.id}>
            <span className="person-silhouette" style={{ "--npc-color": npc.color } as React.CSSProperties} />
            <div>
              <small>{met ? npc.role : "まだ会っていない"}</small>
              <h3>{met ? npc.name : "？？？"}</h3>
              <p>{met ? `話した回数 ${count}回` : "時間帯や日を変えて探してみよう。"}</p>
            </div>
          </article>
        );
      })}
    </div>
  </Sheet>
);

const rewardLabels: Record<AdRewardKind, { title: string; description: string }> = {
  appearance: { title: "出現率アップ", description: "虫に出会える確率を60分間アップ" },
  duration: { title: "効果時間アップ", description: "出現率アップの効果を30分延長" },
  hint: { title: "追加ヒント", description: "おばあちゃんから今日だけのヒント" },
};

export const RewardSheet = ({
  state,
  dispatch,
  onClose,
}: {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onClose: () => void;
}) => {
  const [loading, setLoading] = useState<AdRewardKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const provider = useMemo(() => new MockAdRewardProvider(), []);

  useEffect(() => () => {
    requestVersion.current += 1;
  }, []);

  const activate = async (reward: AdRewardKind) => {
    if (loading) return;
    const request = ++requestVersion.current;
    setLoading(reward);
    setError(null);
    try {
      const result = await provider.showRewardedAd(reward);
      if (request !== requestVersion.current) return;
      if (result.status === "completed") {
        onClose();
        dispatch({ type: "APPLY_AD_REWARD", reward });
      } else {
        setError(result.message);
      }
    } catch {
      if (request === requestVersion.current) setError("動画を再生できませんでした。もう一度お試しください。");
    } finally {
      if (request === requestVersion.current) setLoading(null);
    }
  };

  return (
    <Sheet title="おばあちゃんの応援" eyebrow="開発用モック" onClose={onClose}>
      <p className="reward-intro">動画を見たあとの効果を先行体験できます。大きさは完全に運のままです。</p>
      <div className="reward-list">
        {(Object.keys(rewardLabels) as AdRewardKind[]).map((reward) => (
          <button key={reward} onClick={() => void activate(reward)} disabled={loading !== null}>
            <i aria-hidden="true" />
            <span>
              <strong>{rewardLabels[reward].title}</strong>
              <small>{rewardLabels[reward].description}</small>
            </span>
            <b>{loading === reward ? "再生中…" : "体験"}</b>
          </button>
        ))}
      </div>
      {error && <div className="reward-error" role="alert">{error}</div>}
      {state.flags.extraHintDay === state.day && (
        <div className="hint-note">今日の追加ヒント：{getGrandmaHint(state)}</div>
      )}
      <p className="mock-disclaimer">実広告SDKは対象年齢・配信先・プライバシー要件確定後に接続します。</p>
    </Sheet>
  );
};

export const OutcomeSheet = ({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) => {
  const title = getOutcomeTitle(outcome);
  return (
    <Sheet
      title={title}
      eyebrow={outcome.type === "caught" ? "つかまえた！" : outcome.type === "dialogue" ? "会話" : "探索結果"}
      onClose={onClose}
      className={outcome.type === "caught" ? "encounter-sheet" : ""}
    >
      {outcome.type === "caught" && (
        <div className="catch-result" aria-live="polite">
          <div className="large-beetle" aria-hidden="true">
            <i className={insectById[outcome.specimen.insectId].family === "カブトムシ" ? "rhino-mark" : "stag-mark"} />
          </div>
          <div className="size-result">
            <span>大きさ</span>
            <strong>{outcome.specimen.sizeMm.toFixed(1)}<small>mm</small></strong>
          </div>
          {outcome.isPersonalBest && <div className="record-badge">自己記録</div>}
          <p>
            {locationById[outcome.specimen.locationId].name}で見つけた。大きさは広告効果に左右されません。
          </p>
          <div className={`ranking-note ${outcome.specimen.rankingEligible ? "is-eligible" : "is-assisted"}`}>
            {outcome.specimen.rankingEligible
              ? "自然出現：将来のランキング対象"
              : "出現率アップで追加出現：図鑑・採集記録のみ"}
          </div>
        </div>
      )}
      {outcome.type === "empty" && <p className="empty-result">{outcome.text}</p>}
      {outcome.type === "dialogue" && (
        <div className="dialogue-result">
          <small>{npcById[outcome.npcId].role}</small>
          {outcome.text.split("\n").map((line) => <p key={line}>{line}</p>)}
          {outcome.unlockedSecretRoute && (
            <div className="unlock-note">秘密の道の手がかりを見つけた。16時を過ぎたら地図を見よう。</div>
          )}
        </div>
      )}
      {outcome.type === "notice" && <p className="empty-result">{outcome.text}</p>}
      <button className="primary-button compact" onClick={onClose}>わかった</button>
    </Sheet>
  );
};

export const PickupCutscene = ({ onComplete }: { onComplete: () => void }) => (
  <div className="cutscene pickup-cutscene" role="dialog" aria-modal="true" aria-labelledby="pickup-title">
    <div className="cutscene-sky" aria-hidden="true"><i /><i /><i /></div>
    <div className="pickup-dialogue">
      <p>遠くから、聞き慣れた声がする。</p>
      <h2 id="pickup-title">「おーい！ 迎えに来たよ！」</h2>
      <span>おばあちゃんが迎えに来てくれた！</span>
      <button className="primary-button" onClick={onComplete} autoFocus>おばあちゃんの家へ</button>
    </div>
  </div>
);

export const DaySummarySheet = ({
  state,
  onNextDay,
}: {
  state: GameState;
  onNextDay: () => void;
}) => {
  const today = state.specimens.filter((specimen) => specimen.day === state.day);
  const kinds = new Set(today.map((specimen) => specimen.insectId));
  const largest = today.reduce<null | (typeof today)[number]>((best, specimen) =>
    !best || specimen.sizeMm > best.sizeMm ? specimen : best, null);
  return (
    <div className="sheet-backdrop persistent">
      <section className="bottom-sheet day-summary" role="dialog" aria-modal="true" aria-labelledby="summary-title">
        <div className="sheet-handle" />
        <div className="summary-sun" aria-hidden="true" />
        <p>20:00 · 今日の採集はおしまい</p>
        <h2 id="summary-title">{state.day}日目の思い出</h2>
        <div className="summary-grid">
          <div><small>つかまえた数</small><strong>{today.length}<span>匹</span></strong></div>
          <div><small>見つけた種類</small><strong>{kinds.size}<span>種</span></strong></div>
        </div>
        <div className="today-highlight">
          {largest ? (
            <><small>今日いちばん大きかった虫</small><strong>{insectById[largest.insectId].name}</strong><span>{largest.sizeMm.toFixed(1)}mm</span></>
          ) : (
            <><small>今日のひとこと</small><strong>何も見つからない日も、夏休みの思い出。</strong></>
          )}
        </div>
        <button className="primary-button" onClick={onNextDay} autoFocus>次の日の朝へ</button>
      </section>
    </div>
  );
};
