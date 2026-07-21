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
import { fieldById, type EdgeExit } from "../data/fields";
import { npcById } from "../data/npcs";
import { treesByFieldId } from "../data/trees";
import { getTimePeriod } from "../game/clock";
import {
  INTERACTION_RADIUS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  distanceBetween,
  edgeExitAnchor,
  findNearestInteractionTarget,
  findTriggeredEdgeExit,
  getBoundarySegments,
  getCameraOffset,
  getFieldCollisionRects,
  moveWithCollisions,
  normalizeMovement,
} from "../game/field";
import {
  generateInspectionSession,
  getInspectionSessionId,
  isInspectionComplete,
} from "../game/inspection";
import { isFieldExitAvailable, presentNpcs } from "../game/rules";
import type {
  FacingDirection,
  GameCommand,
  GameState,
  NpcDefinition,
  TreeDefinition,
} from "../types/game";

const TreeArtwork = ({ tree }: { tree: TreeDefinition }) => (
  <span className={`field-spot-art field-spot-${tree.encounterKind}`} aria-hidden="true">
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
      kind: "tree";
      x: number;
      y: number;
      label: string;
      treeId: string;
      searched: boolean;
      active: boolean;
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
const edgeFacing = (exit: EdgeExit): FacingDirection => {
  if (exit.side === "top") return "up";
  if (exit.side === "bottom") return "down";
  return exit.side;
};

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
  const transitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const transitionRef = useRef(false);
  const transitionSequenceRef = useRef(0);
  const pendingCluesRef = useRef(new Set<string>());
  const closedNoticeAtRef = useRef(new Map<string, number>());
  const [nearbyKey, setNearbyKey] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionLabel, setTransitionLabel] = useState("");

  const treeStates = useMemo(() => treesByFieldId[field.id].map((tree) => {
    const sessionId = state.exploration ? getInspectionSessionId(state, tree) : null;
    const stored = sessionId ? state.inspectionSessions[sessionId] : undefined;
    const preview = stored ?? (state.exploration ? generateInspectionSession(state, tree) : null);
    return {
      tree,
      sessionId,
      preview,
      trapState: state.trapStates[tree.id]?.installed ? state.trapStates[tree.id] : undefined,
      clueDiscovered: Boolean(sessionId && state.discoveredClueSessionIds.includes(sessionId)),
      searched: Boolean(stored?.committed && isInspectionComplete(stored, tree)),
      active: Boolean(preview),
    };
  }), [field.id, state]);

  const exitAccess = useMemo(() => new Map(field.exits.map((exit) => [
    exit.id,
    isFieldExitAvailable(state, exit),
  ])), [field.exits, state]);
  const availableExitIds = useMemo(
    () => new Set([...exitAccess].filter(([, access]) => access.available).map(([id]) => id)),
    [exitAccess],
  );
  const closedExitIds = useMemo(
    () => [...exitAccess].filter(([, access]) => !access.available).map(([id]) => id),
    [exitAccess],
  );
  const obstacles = useMemo(() => getFieldCollisionRects(field, closedExitIds), [closedExitIds, field]);
  const boundarySegments = useMemo(
    () => getBoundarySegments(field, availableExitIds),
    [availableExitIds, field],
  );
  const presentNpcIds = useMemo(
    () => new Set(presentNpcs(state).map((npc) => npc.id)),
    [state],
  );

  const targets = useMemo<InteractionTarget[]>(() => {
    const treeTargets: InteractionTarget[] = treeStates.map(({ tree, searched, active }) => ({
      key: `tree:${tree.id}`,
      kind: "tree",
      x: tree.x,
      y: tree.y + 30,
      label: tree.label,
      treeId: tree.id,
      searched,
      active,
    }));
    const npcTargets: InteractionTarget[] = field.npcPositions
      .filter((position) => presentNpcIds.has(position.npcId))
      .map((position) => ({
        key: `npc:${position.npcId}`,
        kind: "npc",
        x: position.x,
        y: position.y,
        label: npcById[position.npcId].name,
        npcId: position.npcId,
      }));
    const rewardTargets: InteractionTarget[] = field.rewardPoint
      ? [{ key: "reward", kind: "reward", ...field.rewardPoint }]
      : [];
    return [...treeTargets, ...npcTargets, ...rewardTargets];
  }, [field.npcPositions, field.rewardPoint, presentNpcIds, treeStates]);

  const nearbyTarget = targets.find((target) => target.key === nearbyKey) ?? null;

  const updateNearbyTarget = useCallback((position: { x: number; y: number }) => {
    const candidate = findNearestInteractionTarget(position, targets, INTERACTION_RADIUS);
    const key = candidate?.key ?? null;
    if (nearbyKeyRef.current !== key) {
      nearbyKeyRef.current = key;
      setNearbyKey(key);
    }
  }, [targets]);

  const discoverNearbyClues = useCallback((position: { x: number; y: number }) => {
    for (const item of treeStates) {
      if (
        !item.sessionId ||
        !item.preview?.clueVisible ||
        item.clueDiscovered ||
        pendingCluesRef.current.has(item.sessionId) ||
        distanceBetween(position, item.tree) > 220
      ) continue;
      pendingCluesRef.current.add(item.sessionId);
      dispatch({
        type: "DISCOVER_TREE_CLUE",
        treeId: item.tree.id,
        x: position.x,
        y: position.y,
        facing: facingRef.current,
      });
    }
  }, [dispatch, treeStates]);

  const paintPosition = useCallback((position: { x: number; y: number }) => {
    const camera = getCameraOffset(position, viewportSizeRef.current, field);
    if (worldRef.current) worldRef.current.style.transform = `translate3d(${-camera.x}px, ${-camera.y}px, 0)`;
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
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate3d(0, 0, 0)";
    paintPosition(positionRef.current);
  }, [paintPosition]);

  const triggerTravel = useCallback((exit: EdgeExit, position: { x: number; y: number }) => {
    if (transitionRef.current || inputLocked) return;
    transitionRef.current = true;
    setTransitioning(true);
    setTransitionLabel(exit.label);
    clearInput();
    const token = `${state.revision}:${field.id}:${exit.id}:${++transitionSequenceRef.current}`;
    transitionTimersRef.current.push(setTimeout(() => {
      dispatch({
        type: "TRAVEL_EDGE",
        exitId: exit.id,
        x: position.x,
        y: position.y,
        facing: edgeFacing(exit),
        transitionToken: token,
      });
    }, 210));
    transitionTimersRef.current.push(setTimeout(() => {
      transitionRef.current = false;
      setTransitioning(false);
      setTransitionLabel("");
    }, 470));
  }, [clearInput, dispatch, field.id, inputLocked, state.revision]);

  const notifyClosedExit = useCallback((exit: EdgeExit) => {
    const now = Date.now();
    if ((closedNoticeAtRef.current.get(exit.id) ?? 0) + 3000 > now) return;
    closedNoticeAtRef.current.set(exit.id, now);
    dispatch({
      type: "TRAVEL_EDGE",
      exitId: exit.id,
      x: positionRef.current.x,
      y: positionRef.current.y,
      facing: edgeFacing(exit),
      transitionToken: `closed:${field.id}:${exit.id}:${now}`,
    });
  }, [dispatch, field.id]);

  const approachedClosedExit = useCallback((
    position: { x: number; y: number },
    movement: { x: number; y: number; facing: FacingDirection },
  ): EdgeExit | null => field.exits.find((exit) => {
    if (availableExitIds.has(exit.id) || edgeFacing(exit) !== movement.facing) return false;
    const coordinate = exit.side === "top" || exit.side === "bottom" ? position.x : position.y;
    if (coordinate < exit.rangeStart || coordinate > exit.rangeEnd) return false;
    if (exit.side === "left") return position.x <= PLAYER_RADIUS + 58;
    if (exit.side === "right") return position.x >= field.width - PLAYER_RADIUS - 58;
    if (exit.side === "top") return position.y <= PLAYER_RADIUS + 58;
    return position.y >= field.height - PLAYER_RADIUS - 58;
  }) ?? null, [availableExitIds, field]);

  useImperativeHandle(ref, () => ({ commitPosition }), [commitPosition]);

  useEffect(() => {
    positionRef.current = { x: state.field.x, y: state.field.y };
    facingRef.current = state.field.facing;
    movingRef.current = false;
    nearbyKeyRef.current = null;
    setNearbyKey(null);
    pendingCluesRef.current = new Set(
      [...pendingCluesRef.current].filter((id) => !state.discoveredClueSessionIds.includes(id)),
    );
    paintPosition(positionRef.current);
  }, [state.field.fieldId, state.field.x, state.field.y, state.field.facing, state.discoveredClueSessionIds, paintPosition]);

  useEffect(() => {
    updateNearbyTarget(positionRef.current);
    discoverNearbyClues(positionRef.current);
  }, [discoverNearbyClues, updateNearbyTarget]);

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
      viewportSizeRef.current = { width: viewport.clientWidth, height: viewport.clientHeight };
      paintPosition(positionRef.current);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [paintPosition]);

  useEffect(() => () => {
    transitionTimersRef.current.forEach(clearTimeout);
    transitionTimersRef.current = [];
  }, []);

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
      const movement = inputLocked || transitioning || transitionRef.current || !state.flags.fieldTutorialSeen
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
        const delta = { x: movement.x * PLAYER_SPEED * seconds, y: movement.y * PLAYER_SPEED * seconds };
        const previousPosition = positionRef.current;
        const exit = findTriggeredEdgeExit(previousPosition, delta, field, availableExitIds);
        const next = moveWithCollisions(previousPosition, delta, field, obstacles);
        const blocked = next.x === previousPosition.x && next.y === previousPosition.y;
        positionRef.current = next;
        paintPosition(next);
        updateNearbyTarget(next);
        discoverNearbyClues(next);
        if (exit) triggerTravel(exit, next);
        else {
          const closed = approachedClosedExit(next, movement);
          if (closed && blocked) notifyClosedExit(closed);
        }
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
  }, [
    approachedClosedExit,
    availableExitIds,
    commitPosition,
    discoverNearbyClues,
    field,
    inputLocked,
    notifyClosedExit,
    obstacles,
    paintPosition,
    state.flags.fieldTutorialSeen,
    transitioning,
    triggerTravel,
    updateNearbyTarget,
  ]);

  const runAction = useCallback(() => {
    const target = targets.find((candidate) => candidate.key === nearbyKeyRef.current);
    if (!target || inputLocked || transitioning || !state.flags.fieldTutorialSeen) return;
    clearInput();
    commitPosition();
    if (target.kind === "tree") dispatch({ type: "OPEN_TREE_INSPECTION", treeId: target.treeId });
    else if (target.kind === "npc") dispatch({ type: "TALK", npcId: target.npcId });
    else onOpenRewards();
  }, [clearInput, commitPosition, dispatch, inputLocked, onOpenRewards, state.flags.fieldTutorialSeen, targets, transitioning]);

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
    const stop = () => {
      clearInput();
      commitPosition();
    };
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [clearInput, commitPosition, runAction]);

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
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const startJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== null || inputLocked || transitioning) return;
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };

  const stopJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activePointerRef.current = null;
    joystickRef.current = { x: 0, y: 0 };
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate3d(0, 0, 0)";
  };

  const nudge = (x: number, y: number, facing: FacingDirection) => {
    if (inputLocked || transitioning || !state.flags.fieldTutorialSeen) return;
    facingRef.current = facing;
    const delta = { x, y };
    const previousPosition = positionRef.current;
    const exit = findTriggeredEdgeExit(previousPosition, delta, field, availableExitIds);
    positionRef.current = moveWithCollisions(previousPosition, delta, field, obstacles);
    const blocked = positionRef.current.x === previousPosition.x && positionRef.current.y === previousPosition.y;
    paintPosition(positionRef.current);
    updateNearbyTarget(positionRef.current);
    discoverNearbyClues(positionRef.current);
    if (exit) triggerTravel(exit, positionRef.current);
    else {
      const movement = normalizeMovement(x, y);
      const closed = movement ? approachedClosedExit(positionRef.current, movement) : null;
      if (closed && blocked) notifyClosedExit(closed);
      else commitPosition();
    }
  };

  const resetToSafePosition = () => {
    if (inputLocked || transitioning || !state.flags.fieldTutorialSeen) return;
    clearInput();
    positionRef.current = { x: state.field.lastSafeX, y: state.field.lastSafeY };
    facingRef.current = "down";
    paintPosition(positionRef.current);
    updateNearbyTarget(positionRef.current);
    dispatch({ type: "RESET_PLAYER_POSITION" });
  };

  const actionLabel = !nearbyTarget
    ? "近づくと行動できます"
    : nearbyTarget.kind === "tree"
      ? !nearbyTarget.active
        ? `${nearbyTarget.label}は今は静かです`
        : nearbyTarget.searched
          ? `${nearbyTarget.label}をもう一度覗く`
          : `${nearbyTarget.label}を調べる · 15分`
      : nearbyTarget.kind === "npc"
        ? `${nearbyTarget.label}と話す · 15分`
        : nearbyTarget.label;

  return (
    <section
      ref={viewportRef}
      className={`field-viewport field-theme-${field.theme} period-${period} ${transitioning ? "is-transitioning" : ""}`}
      aria-label={`${field.name}の探索フィールド`}
    >
      <div ref={worldRef} className="field-world" style={{ width: field.width, height: field.height }} aria-hidden="true">
        <div className="field-ground-detail" />
        {boundarySegments.map((segment, index) => (
          <div
            className={`field-boundary field-boundary-${segment.side}`}
            key={`${segment.side}-${index}`}
            style={{ left: segment.x, top: segment.y, width: segment.width, height: segment.height }}
          />
        ))}
        {field.objects.map((object) => (
          <div
            className={`field-object field-object-${object.kind}`}
            key={object.id}
            style={{ left: object.x, top: object.y, width: object.width, height: object.height, zIndex: Math.round(object.y + object.height) }}
          >
            {object.label && <span>{object.label}</span>}
          </div>
        ))}
        {field.exits.map((exit) => {
          const access = exitAccess.get(exit.id)!;
          const anchor = edgeExitAnchor(exit, field);
          return (
            <div
              className={`field-exit field-exit-${exit.side} ${access.available ? "is-open" : "is-closed"}`}
              key={exit.id}
              style={{ left: anchor.x, top: anchor.y, zIndex: Math.round(anchor.y + 40) }}
            >
              <i />
              <span>{access.available ? exit.label : access.reason ?? "今は通れません"}</span>
            </div>
          );
        })}
        {treeStates.map(({ tree, trapState, clueDiscovered, searched, active }) => (
          <div
            className={`field-hotspot ${searched ? "is-searched" : ""}`}
            key={tree.id}
            style={{ left: tree.x, top: tree.y, zIndex: Math.round(tree.y) }}
          >
            <TreeArtwork tree={tree} />
            <span>{tree.label}</span>
            <div className="tree-marker-stack">
              {clueDiscovered && <b className="tree-clue-marker" title="何かの気配">！</b>}
              {trapState && <b className={`tree-trap-marker trap-${trapState.kind} ${active ? "is-active" : ""}`} title={active ? "利用できる仕掛け" : "今は利用できない仕掛け"}>♢</b>}
              {searched && <b className="tree-checked-marker" title="今回の調査済み">✓</b>}
            </div>
          </div>
        ))}
        {field.npcPositions
          .filter((position) => presentNpcIds.has(position.npcId))
          .map((position) => {
            const npc = npcById[position.npcId];
            return (
              <div className="field-npc" key={npc.id} style={{ left: position.x, top: position.y, zIndex: Math.round(position.y) }}>
                <NpcArtwork npc={npc} />
                <span>{npc.name}</span>
              </div>
            );
          })}
        {field.rewardPoint && (
          <div className="field-reward-point" style={{ left: field.rewardPoint.x, top: field.rewardPoint.y, zIndex: Math.round(field.rewardPoint.y) }}>
            <i />
            <span>応援</span>
          </div>
        )}
        <div ref={playerRef} className="field-player" data-facing={state.field.facing} data-moving="false" style={{ zIndex: Math.round(state.field.y) }}>
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
      <button className="position-reset-button" onClick={resetToSafePosition} disabled={inputLocked || transitioning || !state.flags.fieldTutorialSeen}>
        位置を戻す
      </button>

      <div
        className="virtual-joystick"
        onPointerDown={startJoystick}
        onPointerMove={(event) => {
          if (activePointerRef.current === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) updateJoystick(event);
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
        disabled={!nearbyTarget || inputLocked || transitioning || !state.flags.fieldTutorialSeen}
        aria-keyshortcuts="Enter Space"
        aria-live="polite"
      >
        <small>{nearbyTarget?.kind === "npc" ? "会話" : "行動"}</small>
        <strong>{actionLabel}</strong>
      </button>

      <div className="accessible-dpad" role="group" aria-label="移動ボタン">
        <button disabled={inputLocked || transitioning || !state.flags.fieldTutorialSeen} onClick={() => nudge(0, -36, "up")} aria-label="上へ歩く">上</button>
        <button disabled={inputLocked || transitioning || !state.flags.fieldTutorialSeen} onClick={() => nudge(-36, 0, "left")} aria-label="左へ歩く">左</button>
        <button disabled={inputLocked || transitioning || !state.flags.fieldTutorialSeen} onClick={() => nudge(36, 0, "right")} aria-label="右へ歩く">右</button>
        <button disabled={inputLocked || transitioning || !state.flags.fieldTutorialSeen} onClick={() => nudge(0, 36, "down")} aria-label="下へ歩く">下</button>
      </div>

      {transitioning && <div className="field-transition-curtain" aria-live="polite"><span>{transitionLabel}</span></div>}

      {!state.flags.fieldTutorialSeen && (
        <div className="field-tutorial" role="dialog" aria-modal="true" aria-labelledby="field-tutorial-title">
          <div>
            <small>新しい虫取りの始まり</small>
            <h2 id="field-tutorial-title">自分の足で歩いてみよう</h2>
            <p>左下のスティックで歩き、木や人へ近づいたら右下のボタンを押します。</p>
            <p>道として開いている画面の端まで歩くと、次の場所へ移動します。</p>
            <p>PCでは矢印キー・WASDとEnterでも操作できます。</p>
            <button autoFocus onClick={() => dispatch({ type: "DISMISS_FIELD_TUTORIAL" })}>歩き始める</button>
          </div>
        </div>
      )}
    </section>
  );
});
