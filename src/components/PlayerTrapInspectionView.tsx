import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ambientInsectById } from "../data/ambientInsects";
import { insectById } from "../data/insects";
import { treeById } from "../data/trees";
import { formatTime } from "../game/clock";
import type { GameCommand, GameState } from "../types/game";

interface PlayerTrapInspectionViewProps {
  state: GameState;
  dispatch: (command: GameCommand) => void;
}

type ConfirmAction = "leave" | "recover" | null;
type PopAction = "close" | "recover" | null;

export const PlayerTrapInspectionView = ({ state, dispatch }: PlayerTrapInspectionViewProps) => {
  const trap = state.playerTrapKit.activeTrap;
  const tree = trap ? treeById[trap.treeId] : undefined;
  const plan = trap?.outcomePlan;
  const encounter = plan?.encounter;
  const [searchResultReady, setSearchResultReady] = useState(false);
  const [catchHintReady, setCatchHintReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLElement>(null);
  const popActionRef = useRef<PopAction>(null);
  const encounterVisible = Boolean(encounter && !encounter.caught);
  const historyKey = trap ? `player-trap:${trap.id}` : "";

  useEffect(() => {
    setSearchResultReady(false);
    setCatchHintReady(false);
    const resultTimer = setTimeout(() => setSearchResultReady(true), 850);
    const hintTimer = setTimeout(() => setCatchHintReady(true), 1550);
    return () => {
      clearTimeout(resultTimer);
      clearTimeout(hintTimer);
    };
  }, [trap?.id]);

  useEffect(() => {
    if (!state.pendingOutcome && encounter?.caught) setCapturing(false);
  }, [encounter?.caught, state.pendingOutcome]);

  const dispatchClose = useCallback((action: Exclude<PopAction, null>) => {
    if (!trap) return;
    dispatch(action === "recover"
      ? { type: "RECOVER_PLAYER_TRAP", trapId: trap.id }
      : { type: "CLOSE_PLAYER_TRAP_INSPECTION", trapId: trap.id });
  }, [dispatch, trap]);

  const finishViaHistory = useCallback((action: Exclude<PopAction, null>) => {
    if (!trap || state.pendingOutcome || capturing) return;
    if (window.history.state?.kabukuwaPlayerTrap === historyKey) {
      popActionRef.current = action;
      window.history.back();
    } else {
      dispatchClose(action);
    }
  }, [capturing, dispatchClose, historyKey, state.pendingOutcome, trap]);

  const requestClose = useCallback(() => {
    if (encounterVisible) setConfirmAction("leave");
    else finishViaHistory("close");
  }, [encounterVisible, finishViaHistory]);

  const requestRecover = useCallback(() => {
    if (encounterVisible) setConfirmAction("recover");
    else finishViaHistory("recover");
  }, [encounterVisible, finishViaHistory]);

  useEffect(() => {
    if (!trap) return;
    if (window.history.state?.kabukuwaPlayerTrap !== historyKey) {
      window.history.pushState({ ...window.history.state, kabukuwaPlayerTrap: historyKey }, "");
    }
    const handlePopState = () => {
      if (state.pendingOutcome || capturing) {
        window.history.pushState({ ...window.history.state, kabukuwaPlayerTrap: historyKey }, "");
        return;
      }
      const action = popActionRef.current;
      popActionRef.current = null;
      if (action) {
        dispatchClose(action);
      } else if (encounterVisible) {
        window.history.pushState({ ...window.history.state, kabukuwaPlayerTrap: historyKey }, "");
        setConfirmAction("leave");
      } else {
        dispatchClose("close");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !state.pendingOutcome && !capturing) {
        event.preventDefault();
        requestClose();
        return;
      }
      const focusRoot = confirmAction ? confirmRef.current : sectionRef.current;
      if (event.key !== "Tab" || !focusRoot) return;
      const focusable = [...focusRoot.querySelectorAll<HTMLElement>(
        "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    sectionRef.current?.focus();
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [capturing, confirmAction, dispatchClose, encounterVisible, historyKey, requestClose, state.pendingOutcome, trap]);

  const ambient = useMemo(() => plan?.ambientPlacements ?? [], [plan?.ambientPlacements]);
  if (!trap || !tree || !plan || state.activePlayerTrapInspectionId !== trap.id) return null;

  const catchEncounter = () => {
    if (!encounter || encounter.caught || capturing) return;
    setCapturing(true);
    dispatch({
      type: "CATCH_PLAYER_TRAP_ENCOUNTER",
      trapId: trap.id,
      encounterId: encounter.id,
    });
  };

  return (
    <section
      ref={sectionRef}
      className="tree-inspection inspection-banana-trap player-trap-inspection period-morning"
      role="dialog"
      aria-modal="true"
      aria-label={`${tree.label}のバナナトラップを観察中`}
      tabIndex={-1}
    >
      <header className="inspection-header" aria-hidden={confirmAction ? true : undefined}>
        <div>
          <small>{tree.label} · 自分で仕掛けた</small>
          <h2>バナナトラップ</h2>
        </div>
        <time>{formatTime(state.timeMinutes)}</time>
      </header>

      <div
        className="inspection-scene"
        role="group"
        aria-label="翌朝のバナナトラップの接写"
        aria-hidden={confirmAction ? true : undefined}
      >
        <div className="inspection-bark" aria-hidden="true">
          <i className="sap-glow" />
          <i className="bark-crack" />
          <i className="root-soil" />
          <i className="trap-bait" />
          <i className="trap-light" />
        </div>
        {ambient.map((placement, index) => {
          const definition = ambientInsectById[placement.insectId];
          return (
            <span
              className={`ambient-insect ambient-${placement.insectId} motion-${placement.motion}`}
              key={placement.id}
              style={{
                left: `${placement.x * 100}%`,
                top: `${placement.y * 100}%`,
                "--ambient-delay": `${(index % 4) * -0.37}s`,
              } as React.CSSProperties}
              aria-hidden="true"
            >
              <i />
              <small>{definition.shortLabel}</small>
            </span>
          );
        })}
        {encounterVisible && encounter && (
          <button
            className={`catchable-shadow family-${insectById[encounter.insectId].family === "カブトムシ" ? "rhino" : "stag"} ${catchHintReady ? "is-hinting" : ""}`}
            style={{ left: `${encounter.x * 100}%`, top: `${encounter.y * 100}%` }}
            onClick={catchEncounter}
            disabled={capturing || Boolean(confirmAction)}
            aria-label="虫影を捕まえる"
          >
            <i aria-hidden="true" />
          </button>
        )}
        {capturing && <div className="inspection-catch-flash" aria-live="assertive">つかまえた！</div>}
        <div className="inspection-observation" aria-live="polite">
          {!searchResultReady
            ? "昨日の仕掛けを、目をこらして見てみよう……"
            : encounterVisible
              ? "小さな虫たちの中に虫影がある。タップしてみよう。"
              : encounter?.caught
                ? "捕まえた虫の跡と、集まった虫たちが残っている。"
                : "大物はいないようだ。集まった虫たちを観察できた。"}
        </div>
      </div>

      <footer
        className="inspection-controls player-trap-controls"
        aria-hidden={confirmAction ? true : undefined}
      >
        <div className="player-trap-status-note">
          <strong>{encounterVisible ? "まだ虫影を調べていません" : "今日の確認はできました"}</strong>
          <span>離れても同じ内容が保存されます。回収するまで何度でも戻れます。</span>
        </div>
        <div className="player-trap-inspection-actions">
          <button onClick={requestClose} disabled={capturing || Boolean(confirmAction)}>仕掛けを残して木から離れる</button>
          <button className="recover-trap-button" onClick={requestRecover} disabled={capturing || Boolean(confirmAction)}>
            仕掛けを回収して戻る
          </button>
        </div>
      </footer>

      {confirmAction && (
        <div className="inspection-confirm-backdrop">
          <section ref={confirmRef} role="alertdialog" aria-modal="true" aria-labelledby="trap-confirm-title">
            <small>{confirmAction === "recover" ? "回収の確認" : "木から離れますか？"}</small>
            <h3 id="trap-confirm-title">
              {confirmAction === "recover" ? "まだ虫影を調べていません" : "虫影はそのまま残ります"}
            </h3>
            <p>{confirmAction === "recover"
              ? "回収すると、まだ捕まえていない虫影は見られなくなります。"
              : "あとで戻ると、時間を使わず同じ虫影と小さな虫たちを観察できます。"}</p>
            <button autoFocus onClick={() => setConfirmAction(null)}>観察へ戻る</button>
            <button
              className="secondary-confirm-button"
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                finishViaHistory(action === "recover" ? "recover" : "close");
              }}
            >
              {confirmAction === "recover" ? "虫影を残さず回収する" : "仕掛けを残して離れる"}
            </button>
          </section>
        </div>
      )}
    </section>
  );
};
