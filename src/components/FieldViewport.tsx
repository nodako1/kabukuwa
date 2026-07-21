import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { fieldById } from "../data/fields";
import { locationById } from "../data/locations";
import { npcById } from "../data/npcs";
import { getTimePeriod } from "../game/clock";
import {
  INTERACTION_RADIUS,
  PLAYER_SPEED,
  findNearestInteractionTarget,
  getCameraOffset,
  getFieldCollisionRects,
  moveWithCollisions,
  normalizeMovement,
} from "../game/field";
import { isFieldExitAvailable, presentNpcs } from "../game/rules";
import type {
  FacingDirection,
  GameCommand,
  GameState,
  HotspotDefinition,
  NpcDefinition,
} from "../types/game";

const SpotArtwork = ({ hotspot }: { hotspot: HotspotDefinition }) => (
  <span className={`field-spot-art field-spot-${hotspot.kind}`} aria-hidden="true">
    <i className="field-spot-top" />
    <i className="field-spot-base" />
  </span>
);

const NpcArtwork = ({ npc }: { npc: NpcDefinition }) => (
  <span
    className="field-npc-art"
    style={{ "--npc-color": npc.color } as React.CSSProperties}
    aria-hidden="true"
  >
    <i className="npc-head" />
    <i className="npc-body" />
  </span>
);

type InteractionTarget =
  | {
      key: string;
      kind: "hotspot";
      x: number;
      y: number;
      label: string;
      spotId: string;
      searched: boolean;
    }
  | {
      key: string;
      kind: "npc";
      x: number;
      y: number;
      label: string;
      npcId: NpcDefinition["id"];
    }
  | {
      key: string;
      kind: "exit";
      x: number;
      y: number;
      label: string;
      exitId: string;
      travelMinutes: number;
      available: boolean;
      reason?: string;
    }
  | {
      key: string;
      kind: "reward";
      x: number;
      y: number;
      label: string;
    };

interface FieldViewportProps {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onOpenRewards: () => void;
  inputLocked: boolean;
}

export interface FieldViewportHandle {
  commitPosition: () => void;
}

const movementKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"]);

export const FieldViewport = forwardRef<FieldViewportHandle, FieldViewportProps>(function FieldViewport({
  state,
  dispatch,
  onOpenRewards,
  inputLocked,
}, ref) {
  const field = fieldById[state.field.fieldId];
  const period = getTimePeriod(state.timeMinutes);
  const viewportRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLSpanElement>(null);
  const positionRef = useRef({ x: state.field.x, y: state.field.y });
  const facingRef = useRef<FacingDirection>(state.field.facing);
  const viewportSizeRef = useRef({ width: 390, height: 600 });
  const joystickRef = useRef({ x: 0, y: 0 });
  const activePointerRef = useRef<number | null>(null);
  const keysRef = useRef(new Set<string>());
  const movingRef = useRef(false);
  const nearbyKeyRef = useRef<string | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nearbyKey, setNearbyKey] = useState<string | null>(null);
  const obstacles = useMemo(() => getFieldCollisionRects(field), [field]);
  const location = field.locationId ? locationById[field.locationId] : undefined;
  const searched = state.exploration?.searchedSpotIds ?? [];
  const presentNpcIds = useMemo(
    () => new Set(presentNpcs(state).map((npc) => npc.id)),
    [state],
  );

  const targets = useMemo<InteractionTarget[]>(() => {
    const hotspotTargets: InteractionTarget[] = field.hotspots.flatMap((position) => {
      const hotspot = location?.hotspots.find((candidate) => candidate.id === position.spotId);
      if (!hotspot) return [];
      return [{
        key: `hotspot:${hotspot.id}`,
        kind: "hotspot" as const,
        x: position.x,
        y: position.y + 30,
        label: hotspot.label,
        spotId: hotspot.id,
        searched: searched.includes(hotspot.id),
      }];
    });
    const npcTargets: InteractionTarget[] = field.npcPositions
      .filter((position) => presentNpcIds.has(position.npcId))
      .map((position) => ({
        key: `npc:${position.npcId}`,
        kind: "npc" as const,
        x: position.x,
        y: position.y,
        label: npcById[position.npcId].name,
        npcId: position.npcId,
      }));
    const exitTargets: InteractionTarget[] = field.exits.map((exit) => {
      const access = isFieldExitAvailable(state, exit);
      return {
        key: `exit:${exit.id}`,
        kind: "exit" as const,
        x: exit.x,
        y: exit.y,
        label: exit.label,
        exitId: exit.id,
        travelMinutes: exit.travelMinutes,
        available: access.available,
        reason: access.reason,
      };
    });
    const rewardTargets: InteractionTarget[] = field.rewardPoint
      ? [{ key: "reward", kind: "reward", ...field.rewardPoint }]
      : [];
    return [...hotspotTargets, ...npcTargets, ...exitTargets, ...rewardTargets];
  }, [field, location, presentNpcIds, searched, state]);

  const nearbyTarget = targets.find((target) => target.key === nearbyKey) ?? null;

  const updateNearbyTarget = useCallback((position: { x: number; y: number }) => {
    const candidate = findNearestInteractionTarget(position, targets, INTERACTION_RADIUS);
    const key = candidate?.key ?? null;
    if (nearbyKeyRef.current !== key) {
      nearbyKeyRef.current = key;
      setNearbyKey(key);
    }
  }, [targets]);

  const paintPosition = useCallback((position: { x: number; y: number }) => {
    const viewport = viewportSizeRef.current;
    const camera = getCameraOffset(position, viewport, field);
    if (worldRef.current) {
      worldRef.current.style.transform = `translate3d(${-camera.x}px, ${-camera.y}px, 0)`;
    }
    if (playerRef.current) {
      playerRef.current.style.transform = `translate3d(${position.x - 26}px, ${position.y - 48}px, 0)`;
      playerRef.current.style.zIndex = String(Math.round(position.y));
      playerRef.current.dataset.facing = facingRef.current;
      playerRef.current.dataset.moving = movingRef.current ? "true" : "false";
    }
  }, [field]);

  const commitPosition = useCallback(() => {
    dispatch({
      type: "SYNC_PLAYER_POSITION",
      x: positionRef.current.x,
      y: positionRef.current.y,
      facing: facingRef.current,
    });
  }, [dispatch]);

  const clearInput = useCallback(() => {
    keysRef.current.clear();
    joystickRef.current = { x: 0, y: 0 };
    activePointerRef.current = null;
    movingRef.current = false;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = "translate3d(0, 0, 0)";
    }
    paintPosition(positionRef.current);
  }, [paintPosition]);

  useImperativeHandle(ref, () => ({ commitPosition }), [commitPosition]);

  useEffect(() => {
    positionRef.current = { x: state.field.x, y: state.field.y };
    facingRef.current = state.field.facing;
    movingRef.current = false;
    nearbyKeyRef.current = null;
    setNearbyKey(null);
    paintPosition(positionRef.current);
  }, [state.field.fieldId, state.field.x, state.field.y, state.field.facing, paintPosition]);

  useEffect(() => {
    updateNearbyTarget(positionRef.current);
  }, [updateNearbyTarget]);

  useEffect(() => {
    clearInput();
  }, [clearInput, state.field.fieldId]);

  useEffect(() => {
    if (inputLocked || !state.flags.fieldTutorialSeen) {
      commitPosition();
      clearInput();
    }
  }, [clearInput, commitPosition, inputLocked, state.flags.fieldTutorialSeen]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateSize = () => {
      viewportSizeRef.current = {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      };
      paintPosition(positionRef.current);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [paintPosition]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const seconds = Math.min(0.032, Math.max(0, now - previous) / 1000);
      previous = now;
      let inputX = joystickRef.current.x;
      let inputY = joystickRef.current.y;
      const keys = keysRef.current;
      if (keys.has("ArrowLeft") || keys.has("a")) inputX -= 1;
      if (keys.has("ArrowRight") || keys.has("d")) inputX += 1;
      if (keys.has("ArrowUp") || keys.has("w")) inputY -= 1;
      if (keys.has("ArrowDown") || keys.has("s")) inputY += 1;
      const movement = inputLocked || !state.flags.fieldTutorialSeen
        ? null
        : normalizeMovement(inputX, inputY);
      const wasMoving = movingRef.current;
      movingRef.current = movement !== null;
      if (movement) {
        if (commitTimerRef.current) {
          clearTimeout(commitTimerRef.current);
          commitTimerRef.current = null;
        }
        facingRef.current = movement.facing;
        positionRef.current = moveWithCollisions(
          positionRef.current,
          { x: movement.x * PLAYER_SPEED * seconds, y: movement.y * PLAYER_SPEED * seconds },
          field,
          obstacles,
        );
        paintPosition(positionRef.current);
        updateNearbyTarget(positionRef.current);
      } else if (wasMoving) {
        paintPosition(positionRef.current);
        commitTimerRef.current = setTimeout(() => {
          commitTimerRef.current = null;
          commitPosition();
        }, 180);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, [commitPosition, field, inputLocked, obstacles, paintPosition, state.flags.fieldTutorialSeen, updateNearbyTarget]);

  const runAction = useCallback(() => {
    const target = targets.find((candidate) => candidate.key === nearbyKeyRef.current);
    if (!target || inputLocked || !state.flags.fieldTutorialSeen) return;
    clearInput();
    commitPosition();
    if (target.kind === "hotspot") {
      dispatch({ type: "INSPECT_SPOT", spotId: target.spotId });
    } else if (target.kind === "npc") {
      dispatch({ type: "TALK", npcId: target.npcId });
    } else if (target.kind === "exit") {
      dispatch({ type: "TRAVEL_EXIT", exitId: target.exitId });
    } else {
      onOpenRewards();
    }
  }, [clearInput, commitPosition, dispatch, inputLocked, onOpenRewards, state.flags.fieldTutorialSeen, targets]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, input, textarea, select, [role='dialog']")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (movementKeys.has(key)) {
        event.preventDefault();
        keysRef.current.add(key);
      } else if ((key === "Enter" || key === " ") && !event.repeat) {
        event.preventDefault();
        runAction();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      keysRef.current.delete(key);
    };
    const visibility = () => {
      if (document.hidden) {
        clearInput();
        commitPosition();
      }
    };
    const blur = () => {
      clearInput();
      commitPosition();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [commitPosition, runAction]);

  const updateJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.32;
    const length = Math.hypot(dx, dy);
    const scale = length > max ? max / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    joystickRef.current = { x: x / max, y: y / max };
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  };

  const startJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== null) return;
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };

  const stopJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerRef.current = null;
    joystickRef.current = { x: 0, y: 0 };
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate3d(0, 0, 0)";
  };

  const nudge = (x: number, y: number, facing: FacingDirection) => {
    if (inputLocked || !state.flags.fieldTutorialSeen) return;
    facingRef.current = facing;
    positionRef.current = moveWithCollisions(positionRef.current, { x, y }, field, obstacles);
    paintPosition(positionRef.current);
    updateNearbyTarget(positionRef.current);
    commitPosition();
  };

  const resetToSafePosition = () => {
    if (inputLocked || !state.flags.fieldTutorialSeen) return;
    clearInput();
    positionRef.current = { x: state.field.lastSafeX, y: state.field.lastSafeY };
    facingRef.current = "down";
    paintPosition(positionRef.current);
    updateNearbyTarget(positionRef.current);
    dispatch({ type: "RESET_PLAYER_POSITION" });
  };

  const actionLabel = !nearbyTarget
    ? "近づくと行動できます"
    : nearbyTarget.kind === "hotspot"
      ? nearbyTarget.searched
        ? `${nearbyTarget.label}は調査済み`
        : `${nearbyTarget.label}を覗く · 15分`
      : nearbyTarget.kind === "npc"
        ? `${nearbyTarget.label}と話す · 15分`
        : nearbyTarget.kind === "exit"
          ? nearbyTarget.available
            ? `${nearbyTarget.label} · ${nearbyTarget.travelMinutes}分`
            : nearbyTarget.reason ?? "今は通れません"
          : nearbyTarget.label;

  return (
    <section
      ref={viewportRef}
      className={`field-viewport field-theme-${field.theme} period-${period}`}
      aria-label={`${field.name}の探索フィールド`}
    >
      <div
        ref={worldRef}
        className="field-world"
        style={{ width: field.width, height: field.height }}
        aria-hidden="true"
      >
        <div className="field-ground-detail" />
        {field.objects.map((object) => (
          <div
            className={`field-object field-object-${object.kind}`}
            key={object.id}
            style={{
              left: object.x,
              top: object.y,
              width: object.width,
              height: object.height,
              zIndex: Math.round(object.y + object.height),
            }}
          >
            {object.label && <span>{object.label}</span>}
          </div>
        ))}
        {field.exits.map((exit) => {
          const access = isFieldExitAvailable(state, exit);
          return (
            <div
              className={`field-exit ${access.available ? "is-open" : "is-closed"}`}
              key={exit.id}
              style={{ left: exit.x, top: exit.y, zIndex: Math.round(exit.y) }}
            >
              <i />
              <span>{exit.label}</span>
            </div>
          );
        })}
        {field.hotspots.map((position) => {
          const hotspot = location?.hotspots.find((candidate) => candidate.id === position.spotId);
          if (!hotspot) return null;
          const isSearched = searched.includes(hotspot.id);
          const inactive = hotspot.activePeriods && !hotspot.activePeriods.includes(period);
          return (
            <div
              className={`field-hotspot ${isSearched ? "is-searched" : ""} ${inactive ? "is-inactive" : ""}`}
              key={hotspot.id}
              style={{ left: position.x, top: position.y, zIndex: Math.round(position.y) }}
            >
              <SpotArtwork hotspot={hotspot} />
              <span>{hotspot.label}</span>
              {isSearched && <small>調査済み</small>}
            </div>
          );
        })}
        {field.npcPositions
          .filter((position) => presentNpcIds.has(position.npcId))
          .map((position) => {
            const npc = npcById[position.npcId];
            return (
              <div
                className="field-npc"
                key={npc.id}
                style={{ left: position.x, top: position.y, zIndex: Math.round(position.y) }}
              >
                <NpcArtwork npc={npc} />
                <span>{npc.name}</span>
              </div>
            );
          })}
        {field.rewardPoint && (
          <div
            className="field-reward-point"
            style={{ left: field.rewardPoint.x, top: field.rewardPoint.y, zIndex: Math.round(field.rewardPoint.y) }}
          >
            <i />
            <span>応援</span>
          </div>
        )}
        <div
          ref={playerRef}
          className="field-player"
          data-facing={state.field.facing}
          data-moving="false"
          style={{ zIndex: Math.round(state.field.y) }}
        >
          <i className="player-hat" />
          <i className="player-head" />
          <i className="player-body" />
          <i className="player-net" />
          <i className="player-basket" />
          <span className="player-shadow" />
        </div>
      </div>

      <div className="field-caption">
        <small>現在地</small>
        <strong>{field.name}</strong>
        <span>{field.description}</span>
      </div>
      <button
        className="position-reset-button"
        onClick={resetToSafePosition}
        disabled={inputLocked || !state.flags.fieldTutorialSeen}
      >
        位置を戻す
      </button>

      <div
        className="virtual-joystick"
        onPointerDown={startJoystick}
        onPointerMove={(event) => {
          if (
            activePointerRef.current === event.pointerId &&
            event.currentTarget.hasPointerCapture(event.pointerId)
          ) updateJoystick(event);
        }}
        onPointerUp={stopJoystick}
        onPointerCancel={stopJoystick}
        onLostPointerCapture={stopJoystick}
        aria-hidden="true"
      >
        <span ref={joystickKnobRef} />
      </div>
      <button
        className={`context-action-button ${nearbyTarget ? "is-ready" : ""}`}
        onClick={runAction}
        disabled={!nearbyTarget || inputLocked || !state.flags.fieldTutorialSeen}
        aria-keyshortcuts="Enter Space"
        aria-live="polite"
      >
        <small>{nearbyTarget?.kind === "exit" ? "移動" : nearbyTarget?.kind === "npc" ? "会話" : "行動"}</small>
        <strong>{actionLabel}</strong>
      </button>

      <div className="accessible-dpad" role="group" aria-label="移動ボタン">
        <button disabled={inputLocked || !state.flags.fieldTutorialSeen} onClick={() => nudge(0, -36, "up")} aria-label="上へ歩く">上</button>
        <button disabled={inputLocked || !state.flags.fieldTutorialSeen} onClick={() => nudge(-36, 0, "left")} aria-label="左へ歩く">左</button>
        <button disabled={inputLocked || !state.flags.fieldTutorialSeen} onClick={() => nudge(36, 0, "right")} aria-label="右へ歩く">右</button>
        <button disabled={inputLocked || !state.flags.fieldTutorialSeen} onClick={() => nudge(0, 36, "down")} aria-label="下へ歩く">下</button>
      </div>

      {!state.flags.fieldTutorialSeen && (
        <div className="field-tutorial" role="dialog" aria-modal="true" aria-labelledby="field-tutorial-title">
          <div>
            <small>新しい虫取りの始まり</small>
            <h2 id="field-tutorial-title">自分の足で歩いてみよう</h2>
            <p>左下のスティックで歩き、木や人、道の出口へ近づいたら右下のボタンを押します。</p>
            <p>PCでは矢印キー・WASDとEnterでも操作できます。</p>
            <button autoFocus onClick={() => dispatch({ type: "DISMISS_FIELD_TUTORIAL" })}>歩き始める</button>
          </div>
        </div>
      )}
    </section>
  );
});
