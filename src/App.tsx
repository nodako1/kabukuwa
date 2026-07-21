import { useRef, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { FieldViewport, type FieldViewportHandle } from "./components/FieldViewport";
import {
  DaySummarySheet,
  EncyclopediaSheet,
  MapSheet,
  MorningBriefSheet,
  OutcomeSheet,
  PeopleSheet,
  PlayerTrapActionSheet,
  PlayerTrapTutorialSheet,
  PickupCutscene,
  RewardSheet,
} from "./components/Sheets";
import { StatusBar } from "./components/StatusBar";
import { TitleScreen } from "./components/TitleScreen";
import { TreeInspectionView } from "./components/TreeInspectionView";
import { PlayerTrapInspectionView } from "./components/PlayerTrapInspectionView";
import { useGame } from "./game/useGame";
import { loadGame } from "./game/save";
import "./styles.css";

type Panel = "map" | "book" | "people" | "rewards" | null;

const App = () => {
  const savedAtLaunch = useRef(loadGame()).current;
  const fieldViewportRef = useRef<FieldViewportHandle>(null);
  const { state, dispatch } = useGame();
  const [started, setStarted] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [trapActionTreeId, setTrapActionTreeId] = useState<string | null>(null);

  if (!started) {
    return (
      <TitleScreen
        savedState={savedAtLaunch}
        onContinue={() => setStarted(true)}
        onNewGame={() => {
          dispatch({ type: "RESET_GAME" });
          setStarted(true);
        }}
      />
    );
  }

  const treeInspectionOpen = Boolean(state.activeInspectionSessionId);
  const playerTrapInspectionOpen = Boolean(state.activePlayerTrapInspectionId);
  const inspectionOpen = treeInspectionOpen || playerTrapInspectionOpen;
  const locked = state.phase === "pickup" || state.phase === "day-ended";
  const dailyBriefPending = !state.morningBriefSeenDays.includes(state.day);
  const playerTrapTutorialPending =
    state.playerTrapKit.unlocked && !state.flags.playerTrapTutorialSeen;
  const briefOrTutorialPending =
    (dailyBriefPending || playerTrapTutorialPending) &&
    !inspectionOpen &&
    !state.pendingOutcome &&
    !locked;

  return (
    <main className={`game-shell phase-${state.phase} ${inspectionOpen ? "inspection-open" : ""}`}>
      <StatusBar state={state} />
      {playerTrapInspectionOpen ? (
        <PlayerTrapInspectionView state={state} dispatch={dispatch} />
      ) : treeInspectionOpen ? (
        <TreeInspectionView state={state} dispatch={dispatch} />
      ) : (
        <FieldViewport
          ref={fieldViewportRef}
          state={state}
          dispatch={dispatch}
          onOpenRewards={() => setPanel("rewards")}
          onOpenTrapAction={setTrapActionTreeId}
          inputLocked={locked || panel !== null || trapActionTreeId !== null || Boolean(state.pendingOutcome) || briefOrTutorialPending}
          suppressTutorial={briefOrTutorialPending}
        />
      )}
      {!inspectionOpen && (
        <>
          <BottomNav
            disabled={locked}
            menuDisabled={!state.flags.fieldTutorialSeen}
            onMap={() => {
              fieldViewportRef.current?.commitPosition();
              setPanel("map");
            }}
            onBook={() => {
              fieldViewportRef.current?.commitPosition();
              setPanel("book");
            }}
            onPeople={() => {
              fieldViewportRef.current?.commitPosition();
              setPanel("people");
            }}
            onRest={() => {
              fieldViewportRef.current?.commitPosition();
              dispatch({ type: "REST", minutes: 30 });
            }}
          />
          <p className="autosave-note"><span /> 移動・行動を自動保存</p>
        </>
      )}

      {panel === "map" && <MapSheet state={state} onClose={() => setPanel(null)} />}
      {panel === "book" && <EncyclopediaSheet state={state} onClose={() => setPanel(null)} />}
      {panel === "people" && <PeopleSheet state={state} onClose={() => setPanel(null)} />}
      {panel === "rewards" && (
        <RewardSheet state={state} dispatch={dispatch} onClose={() => setPanel(null)} />
      )}
      {trapActionTreeId && (
        <PlayerTrapActionSheet
          state={state}
          treeId={trapActionTreeId}
          dispatch={dispatch}
          onClose={() => setTrapActionTreeId(null)}
        />
      )}
      {state.pendingOutcome && (
        <OutcomeSheet outcome={state.pendingOutcome} onClose={() => dispatch({ type: "ACKNOWLEDGE_OUTCOME" })} />
      )}
      {briefOrTutorialPending && dailyBriefPending && panel === null && (
        <MorningBriefSheet
          state={state}
          onClose={() => dispatch({ type: "DISMISS_MORNING_BRIEF" })}
        />
      )}
      {briefOrTutorialPending && !dailyBriefPending && playerTrapTutorialPending && panel === null && (
        <PlayerTrapTutorialSheet onClose={() => dispatch({ type: "DISMISS_MORNING_BRIEF" })} />
      )}
      {!state.pendingOutcome && !inspectionOpen && state.phase === "pickup" && (
        <PickupCutscene onComplete={() => dispatch({ type: "COMPLETE_PICKUP" })} />
      )}
      {!state.pendingOutcome && !inspectionOpen && state.phase === "day-ended" && (
        <DaySummarySheet state={state} onNextDay={() => dispatch({ type: "START_NEXT_DAY" })} />
      )}
    </main>
  );
};

export default App;
