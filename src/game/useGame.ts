import { useEffect, useReducer } from "react";
import type { GameCommand } from "../types/game";
import { createInitialGame, gameReducer } from "./engine";
import { loadGame, saveGame } from "./save";

export const useGame = () => {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadGame() ?? createInitialGame());

  useEffect(() => {
    saveGame(state);
  }, [state]);

  return {
    state,
    dispatch: (command: GameCommand) => dispatch(command),
  };
};
