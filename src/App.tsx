import { useRef, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { SceneViewport } from "./components/SceneViewport";
import {
  DaySummarySheet,
  EncyclopediaSheet,
  MapSheet,
  OutcomeSheet,
  PeopleSheet,
  PickupCutscene,
  RewardSheet,
} from "./components/Sheets";
import { StatusBar } from "./components/StatusBar";
import { TitleScreen } from "./components/TitleScreen";
import { useGame } from "./game/useGame";
import { loadGame } from "./game/save";
import "./styles.css";

type Panel = "map" | "book" | "people" | "rewards" | null;

const App = () => {
  const savedAtLaunch = useRef(loadGame()).current;
  const { state, dispatch } = useGame();
  const [started, setStarted] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);

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

  const locked = state.phase === "pickup" || state.phase === "day-ended";

  return (
    <main className={`game-shell phase-${state.phase}`}>
      <StatusBar state={state} />
      <SceneViewport state={state} dispatch={dispatch} onOpenRewards={() => setPanel("rewards")} />
      <BottomNav
        disabled={locked}
        onMap={() => setPanel("map")}
        onBook={() => setPanel("book")}
        onPeople={() => setPanel("people")}
        onRest={() => dispatch({ type: "REST", minutes: 30 })}
      />
      <p className="autosave-note"><span /> 行動のたびに自動保存</p>

      {panel === "map" && <MapSheet state={state} dispatch={dispatch} onClose={() => setPanel(null)} />}
      {panel === "book" && <EncyclopediaSheet state={state} onClose={() => setPanel(null)} />}
      {panel === "people" && <PeopleSheet state={state} onClose={() => setPanel(null)} />}
      {panel === "rewards" && (
        <RewardSheet state={state} dispatch={dispatch} onClose={() => setPanel(null)} />
      )}
      {state.pendingOutcome && (
        <OutcomeSheet outcome={state.pendingOutcome} onClose={() => dispatch({ type: "ACKNOWLEDGE_OUTCOME" })} />
      )}
      {!state.pendingOutcome && state.phase === "pickup" && (
        <PickupCutscene onComplete={() => dispatch({ type: "COMPLETE_PICKUP" })} />
      )}
      {!state.pendingOutcome && state.phase === "day-ended" && (
        <DaySummarySheet state={state} onNextDay={() => dispatch({ type: "START_NEXT_DAY" })} />
      )}
    </main>
  );
};

export default App;
