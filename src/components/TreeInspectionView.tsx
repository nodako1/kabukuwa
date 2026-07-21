import { useCallback, useEffect, useMemo, useState } from "react";
import { ambientInsectById } from "../data/ambientInsects";
import { insectById } from "../data/insects";
import { treeById } from "../data/trees";
import { formatTime } from "../game/clock";
import { activeInspectionPoints, isInspectionComplete } from "../game/inspection";
import type { GameCommand, GameState } from "../types/game";

interface TreeInspectionViewProps {
  state: GameState;
  dispatch: (command: GameCommand) => void;
}

export const TreeInspectionView = ({ state, dispatch }: TreeInspectionViewProps) => {
  const sessionId = state.activeInspectionSessionId;
  const session = sessionId ? state.inspectionSessions[sessionId] : undefined;
  const tree = session ? treeById[session.treeId] : undefined;
  const [searchResultReady, setSearchResultReady] = useState(false);
  const [catchHintReady, setCatchHintReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const point = useMemo(
    () => tree?.inspectionPoints.find((candidate) => candidate.id === session?.currentPointId),
    [session?.currentPointId, tree],
  );
  const availablePoints = useMemo(
    () => session && tree ? activeInspectionPoints(session, tree) : [],
    [session, tree],
  );
  const encounter = session?.catchableEncounter;
  const encounterHere = Boolean(
    encounter &&
    point &&
    encounter.pointId === point.id &&
    !encounter.caught,
  );
  const ambient = point && session ? session.ambientByPointId[point.id] ?? [] : [];
  const completed = Boolean(session && tree && isInspectionComplete(session, tree));

  useEffect(() => {
    setSearchResultReady(false);
    setCatchHintReady(false);
    setCapturing(false);
    const resultTimer = setTimeout(() => setSearchResultReady(true), 950);
    const hintTimer = setTimeout(() => setCatchHintReady(true), 1700);
    return () => {
      clearTimeout(resultTimer);
      clearTimeout(hintTimer);
    };
  }, [point?.id]);

  useEffect(() => {
    if (!state.pendingOutcome && encounter?.caught) setCapturing(false);
  }, [encounter?.caught, state.pendingOutcome]);

  const closeInspection = useCallback(() => {
    if (!session || state.pendingOutcome || capturing) return;
    if (window.history.state?.kabukuwaInspection === session.id) window.history.back();
    else dispatch({ type: "CLOSE_TREE_INSPECTION" });
  }, [capturing, dispatch, session, state.pendingOutcome]);

  useEffect(() => {
    if (!session) return;
    if (window.history.state?.kabukuwaInspection !== session.id) {
      window.history.pushState({ ...window.history.state, kabukuwaInspection: session.id }, "");
    }
    const handlePopState = () => {
      if (!state.pendingOutcome && !capturing) dispatch({ type: "CLOSE_TREE_INSPECTION" });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || state.pendingOutcome || capturing) return;
      event.preventDefault();
      closeInspection();
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [capturing, closeInspection, dispatch, session, state.pendingOutcome]);

  if (!session || !tree || !point) return null;

  const catchEncounter = () => {
    if (!encounterHere || !encounter || capturing) return;
    setCapturing(true);
    dispatch({ type: "CATCH_INSPECTION_ENCOUNTER", encounterId: encounter.id });
  };

  return (
    <section
      className={`tree-inspection inspection-${point.sceneKind} period-${session.period}`}
      aria-label={`${tree.label}の${point.label}を観察中`}
    >
      <header className="inspection-header">
        <div>
          <small>{tree.label}</small>
          <h2>{point.label}</h2>
        </div>
        <time>{formatTime(session.resolvedAtMinutes)}</time>
      </header>

      <div className="inspection-scene" role="group" aria-label={`${point.label}の接写`}>
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
        {encounterHere && encounter && (
          <button
            className={`catchable-shadow family-${insectById[encounter.insectId].family === "カブトムシ" ? "rhino" : "stag"} ${catchHintReady ? "is-hinting" : ""}`}
            style={{ left: `${encounter.x * 100}%`, top: `${encounter.y * 100}%` }}
            onClick={catchEncounter}
            disabled={capturing}
            aria-label="虫影を捕まえる"
          >
            <i aria-hidden="true" />
          </button>
        )}
        {capturing && <div className="inspection-catch-flash" aria-live="assertive">つかまえた！</div>}
        <div className="inspection-observation" aria-live="polite">
          {!searchResultReady
            ? "目をこらして探してみよう……"
            : encounterHere
              ? "どこかに虫影がある。タップしてみよう。"
              : encounter?.caught && encounter.pointId === point.id
                ? "さっき捕まえた虫の跡が残っている。"
                : "カブト・クワガタはいないようだ。"}
        </div>
      </div>

      <footer className="inspection-controls">
        <div className="inspection-point-tabs" aria-label="見る場所を変える">
          {availablePoints.map((inspectionPoint) => (
            <button
              key={inspectionPoint.id}
              className={inspectionPoint.id === point.id ? "is-current" : ""}
              onClick={() => dispatch({ type: "VIEW_INSPECTION_POINT", pointId: inspectionPoint.id })}
              disabled={capturing || inspectionPoint.id === point.id}
            >
              <span>{session.examinedPointIds.includes(inspectionPoint.id) ? "✓" : "○"}</span>
              {inspectionPoint.label}
            </button>
          ))}
        </div>
        <div className="inspection-leave-row">
          <p>{completed ? "この木の見られる場所はすべて調べた。" : "別の場所にも隠れているかもしれない。"}</p>
          <button onClick={closeInspection} disabled={capturing}>木から離れる</button>
        </div>
      </footer>
    </section>
  );
};
