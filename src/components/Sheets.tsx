import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fieldById } from "../data/fields";
import {
  dailyNatureById,
  getRumorText,
  observationThemeById,
} from "../data/dailyContent";
import { insects, insectById } from "../data/insects";
import { locationById } from "../data/locations";
import { npcs, npcById } from "../data/npcs";
import { treeById } from "../data/trees";
import { formatTime } from "../game/clock";
import { getOutcomeTitle } from "../game/engine";
import {
  getCurrentDailyPlan,
  getCurrentObservationProgress,
  getObservationProgressText,
} from "../game/daily";
import { getGrandmaHint, isLocationAvailable } from "../game/rules";
import { playerTrapLocationId, treeIdFromPlayerTrapId } from "../game/playerTrap";
import { MockAdRewardProvider } from "../ports/AdRewardProvider";
import type { AdRewardKind, FieldId, GameCommand, GameState, Outcome } from "../types/game";

interface SheetProps {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

const useModalFocusTrap = (
  dialogRef: React.RefObject<HTMLElement | null>,
  onEscape?: () => void,
  dialogIsRoot = false,
) => {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const modalRoot = dialogIsRoot ? dialog : dialog.parentElement;
    const host = modalRoot?.parentElement;
    const backgroundElements = host
      ? Array.from(host.children).filter((element) => element !== modalRoot) as HTMLElement[]
      : [];
    const previousInert = backgroundElements.map((element) => element.inert);
    backgroundElements.forEach((element) => { element.inert = true; });

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.closest("[hidden]") && !element.closest("[inert]"));
    if (dialog.hasAttribute("tabindex")) {
      dialog.focus({ preventScroll: true });
    } else {
      focusable()[0]?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        onEscape();
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

    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      backgroundElements.forEach((element, index) => { element.inert = previousInert[index]; });
      previouslyFocused?.focus();
    };
  }, [dialogIsRoot, dialogRef, onEscape]);
};

const Sheet = ({ title, eyebrow, onClose, children, className = "" }: SheetProps) => {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  useModalFocusTrap(sheetRef, onClose);

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

export const PlayerTrapActionSheet = ({
  state,
  treeId,
  dispatch,
  onClose,
}: {
  state: GameState;
  treeId: string;
  dispatch: (command: GameCommand) => void;
  onClose: () => void;
}) => {
  const tree = treeById[treeId];
  const activeTrap = state.playerTrapKit.activeTrap;
  const isCurrentTree = activeTrap?.treeId === treeId;
  const activeLocationId = activeTrap ? playerTrapLocationId(activeTrap) : undefined;
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  useEffect(() => setConfirmRemoval(false), [treeId]);
  if (!tree) return null;

  if (activeTrap && !isCurrentTree) {
    return (
      <Sheet title="仕掛けはひとつだけ" eyebrow="バナナトラップ" onClose={onClose} className="player-trap-action-sheet">
        <p className="trap-sheet-lead">
          {activeLocationId
            ? `${locationById[activeLocationId].name}に仕掛けてあります。`
            : "別の木に仕掛けてあります。"}
        </p>
        <p>現地で仕掛けを回収すると、別の木へまた設置できます。</p>
        <p>場所は下部メニューの「地図」から確認できます。</p>
        <button className="primary-button" onClick={onClose}>わかった</button>
      </Sheet>
    );
  }

  if (activeTrap?.phase === "waiting") {
    if (confirmRemoval) {
      return (
        <Sheet title="仕掛けを外しますか？" eyebrow={tree.label} onClose={() => setConfirmRemoval(false)} className="player-trap-action-sheet">
          <p className="trap-sheet-lead">5分使って、トラップセットを手元へ戻します。</p>
          <p>まだ中身は決まっていません。外しても虫の結果は表示されず、別の木へまた仕掛けられます。</p>
          <button
            className="primary-button"
            onClick={() => {
              onClose();
              dispatch({ type: "REMOVE_WAITING_PLAYER_TRAP", trapId: activeTrap.id });
            }}
          >外して手元へ戻す · 5分</button>
          <button className="text-button" onClick={() => setConfirmRemoval(false)}>そのまま待つ</button>
        </Sheet>
      );
    }
    return (
      <Sheet title="仕掛け中" eyebrow={tree.label} onClose={onClose} className="player-trap-action-sheet">
        <div className="trap-phase-card phase-waiting"><span aria-hidden="true">☾</span><strong>次の日の朝から確認できます</strong></div>
        <dl className="trap-sheet-details">
          <div><dt>設置した日</dt><dd>{activeTrap.installedDay}日目 {formatTime(activeTrap.installedAtMinutes)}</dd></div>
          <div><dt>確認できる日</dt><dd>{activeTrap.readyDay}日目の朝から</dd></div>
        </dl>
        <p>このまま待つか、5分使って手元へ戻せます。外しても失敗にはなりません。</p>
        <button
          className="primary-button"
          onClick={() => setConfirmRemoval(true)}
        >仕掛けを外す · 5分</button>
        <button className="text-button" onClick={onClose}>そのまま待つ</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="この木に仕掛けますか？" eyebrow={tree.label} onClose={onClose} className="player-trap-action-sheet">
      <div className="trap-phase-card phase-available"><span aria-hidden="true">実</span><strong>くり返し使えるバナナトラップ</strong></div>
      <p className="trap-sheet-lead">この木にバナナトラップを仕掛けます。</p>
      <p>中を見られるのは、次の日の朝からです。虫がいるかどうかは、戻って覗くまで分かりません。</p>
      <button
        className="primary-button"
        onClick={() => {
          onClose();
          dispatch({ type: "INSTALL_PLAYER_TRAP", treeId });
        }}
      >ここに仕掛ける · 10分</button>
      <button className="text-button" onClick={onClose}>今はやめる</button>
    </Sheet>
  );
};

export const MapSheet = ({
  state,
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) => {
  const discovered = new Set(state.field.discoveredFieldIds);
  const mainLoopIds: FieldId[] = [
    "mixed-forest",
    "oak-forest",
    "school",
    "forest-road",
    "bamboo-grove",
    "grandma-house",
    "paddy-road",
    "shrine",
  ];
  const branchIds: FieldId[] = state.flags.secretRouteUnlocked
    ? ["backyard", "secret-path", "secret-forest"]
    : ["backyard"];
  const activePlayerTrapTree = state.playerTrapKit.activeTrap
    ? treeById[state.playerTrapKit.activeTrap.treeId]
    : undefined;
  const renderNode = (fieldId: FieldId, branch = false) => {
    const field = fieldById[fieldId];
    const current = field.id === state.field.fieldId;
    const known = discovered.has(field.id);
    const access = field.locationId
      ? isLocationAvailable(state, field.locationId)
      : { available: state.timeMinutes < 1080, reason: "18時以降は通れません" };
    return (
      <div
        className={`field-map-node map-slot-${field.id} ${branch ? "is-branch" : ""} ${current ? "is-current" : ""} ${known ? "is-known" : "is-unknown"}`}
        key={field.id}
      >
        <i aria-hidden="true" />
        <span>
          <strong>{field.name}</strong>
          <small>
            {current
              ? "いまここ"
              : !known
                ? "まだ歩いていません"
                : access.available
                  ? "発見済み"
                  : access.reason}
          </small>
        </span>
        {activePlayerTrapTree?.fieldId === field.id && (
          <em className={`map-player-trap-badge phase-${state.playerTrapKit.activeTrap?.phase}`}>
            {state.playerTrapKit.activeTrap?.phase === "waiting" ? "☾ 仕掛け中" : state.playerTrapKit.activeTrap?.phase === "ready" ? "◉ 見に行ける" : "▣ 確認途中"}
          </em>
        )}
      </div>
    );
  };
  return (
    <Sheet title="村の地図" eyebrow={`${state.day}日目 ${formatTime(state.timeMinutes)}`} onClose={onClose}>
      {state.timeMinutes >= 1080 && (
        <div className="night-rule">18時以降は、おばあちゃんの家と裏庭だけ。</div>
      )}
      <div className="map-walk-note">地図は現在地の確認用です。道や出口まで歩いて移動しよう。</div>
      <div className="map-section-label">家へ戻ってくる主周回路</div>
      <div className="field-map-grid" aria-label="家を起点に一周できる村の主周回路">
        {mainLoopIds.map((fieldId) => renderNode(fieldId))}
      </div>
      <div className="map-section-label">寄り道</div>
      <div className="field-map-branches" aria-label="主周回路からの寄り道">
        {branchIds.map((fieldId) => renderNode(fieldId, true))}
      </div>
      <div className="map-controls-help">
        <strong>操作</strong>
        <span>スマホ：左下スティック＋右下の行動ボタン</span>
        <span>PC：矢印キー／WASD＋Enter</span>
      </div>
    </Sheet>
  );
};

export const MorningBriefSheet = ({
  state,
  onClose,
}: {
  state: GameState;
  onClose: () => void;
}) => {
  const plan = getCurrentDailyPlan(state);
  if (!plan) return null;
  const nature = dailyNatureById[plan.natureId];
  const theme = observationThemeById[plan.themeId];
  const activeTrap = state.playerTrapKit.activeTrap;
  const trapLocationId = activeTrap ? playerTrapLocationId(activeTrap) : undefined;
  const showTrapTutorial = state.playerTrapKit.unlocked && !state.flags.playerTrapTutorialSeen;
  return (
    <Sheet
      title="今日の自然のようす"
      eyebrow={`夏休み ${state.day}日目 · 朝`}
      onClose={onClose}
      className="morning-brief-sheet"
    >
      <div className={`morning-nature nature-${nature.id}`}>
        <span aria-hidden="true">{nature.icon}</span>
        <div>
          <small>きょうの自然</small>
          <h3>{nature.name}</h3>
          <p>{nature.morningText}</p>
        </div>
      </div>
      <div className="morning-theme">
        <small>やってみてもいい観察</small>
        <strong>{theme.label}</strong>
        <p>できなくても大丈夫。今日は自由に虫取りを楽しもう。</p>
      </div>
      <div className="morning-rumor-note">村の誰かが、今日の噂を知っているかもしれない。</div>
      {showTrapTutorial && (
        <div className="morning-player-trap tutorial">
          <span aria-hidden="true">実</span>
          <div>
            <small>おばあちゃんからの仕掛け</small>
            <strong>気になる木に、ひとつだけ仕掛けられるようになった</strong>
            <p>対応する木へ近づき、「トラップを仕掛ける」を選ぼう。中を見られるのは次の日の朝からです。</p>
          </div>
        </div>
      )}
      {activeTrap && trapLocationId && (activeTrap.phase === "ready" || activeTrap.phase === "opened") && (
        <div className={`morning-player-trap phase-${activeTrap.phase}`}>
          <span aria-hidden="true">◉</span>
          <div>
            <small>昨日の仕掛け</small>
            <strong>{locationById[trapLocationId].name}で見に行けます</strong>
            <p>どの虫がいるかは、同じ木まで歩いて覗くまで分かりません。</p>
          </div>
        </div>
      )}
      <button className="primary-button" onClick={onClose}>虫取りへ出かける</button>
    </Sheet>
  );
};

export const PlayerTrapTutorialSheet = ({ onClose }: { onClose: () => void }) => (
  <Sheet
    title="自分で仕掛けるバナナトラップ"
    eyebrow="新しい虫取り道具"
    onClose={onClose}
    className="morning-brief-sheet player-trap-tutorial-sheet"
  >
    <div className="morning-player-trap tutorial">
      <span aria-hidden="true">実</span>
      <div>
        <small>おばあちゃんからの仕掛け</small>
        <strong>気になる木に、ひとつだけ仕掛けられるようになった</strong>
        <p>対応する木へ近づき、「トラップを仕掛ける」を選ぼう。中を見られるのは次の日の朝からです。</p>
      </div>
    </div>
    <p>仕掛けた場所は地図で確認できます。結果は、同じ木まで歩いて戻ってから覗いてみよう。</p>
    <button className="primary-button" onClick={onClose}>わかった</button>
  </Sheet>
);

const InsectCollection = ({ state }: { state: GameState }) => (
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
);

const ObservationNotebook = ({ state }: { state: GameState }) => {
  const plan = getCurrentDailyPlan(state);
  const progress = getCurrentObservationProgress(state);
  const entries = Object.values(state.observationJournalByDay).sort((left, right) => right.day - left.day);
  const currentFinalized = Boolean(state.observationJournalByDay[String(state.day)]);
  return (
    <div className="observation-notebook">
      {!currentFinalized && plan && (
        <article className={`journal-current ${progress.completed ? "is-complete" : ""}`}>
          <div className="journal-day-row">
            <div>
              <small>記録中 · 夏休み {state.day}日目</small>
              <strong>{dailyNatureById[plan.natureId].name}</strong>
            </div>
            <span aria-hidden="true">{dailyNatureById[plan.natureId].icon}</span>
          </div>
          <p className="journal-nature-text">{dailyNatureById[plan.natureId].morningText}</p>
          <p className="journal-theme-text">
            <small>やってみてもいい観察</small>
            {observationThemeById[plan.themeId].label}
          </p>
          <div className="journal-progress" aria-label={`観察テーマの進み具合 ${getObservationProgressText(state)}`}>
            <i className={progress.completed ? "is-complete" : ""} />
            <span>{getObservationProgressText(state)}</span>
          </div>
          <small>噂：{state.heardRumorDays.includes(state.day) ? "今日の噂を聞いた" : "まだ聞いていない"}</small>
          {state.playerTrapKit.activeTrap && (() => {
            const trap = state.playerTrapKit.activeTrap;
            const locationId = playerTrapLocationId(trap);
            return locationId ? (
              <div className={`journal-trap-status phase-${trap.phase}`}>
                <strong>{trap.phase === "waiting" ? "仕掛け中" : trap.phase === "ready" ? "見に行ける" : "確認途中"}</strong>
                <span>{locationById[locationId].name}</span>
              </div>
            ) : null;
          })()}
        </article>
      )}
      {entries.length === 0 && currentFinalized === false && (
        <p className="journal-empty">今日の行動は、夜になるとここへ日記として残ります。</p>
      )}
      <div className="journal-entry-list">
        {entries.map((entry) => {
          const nature = dailyNatureById[entry.natureId];
          const theme = observationThemeById[entry.themeId];
          const largestSpecimen = entry.largestSpecimenId
            ? state.specimens.find((specimen) => specimen.id === entry.largestSpecimenId)
            : undefined;
          const firstCatchNames = entry.firstCatchInsectIds
            .map((insectId) => insectById[insectId].name)
            .join("・");
          const examinedPointIds = new Set(entry.examinedPointIds);
          const pointKindNames = Array.from(new Set(Object.values(treeById)
            .flatMap((tree) => tree.inspectionPoints)
            .filter((point) => examinedPointIds.has(point.id))
            .map((point) => ({
              sap: "樹液",
              "bark-crack": "幹の割れ目",
              root: "根元",
              "banana-trap": "バナナトラップ",
              "light-trap": "ライトトラップ",
            })[point.sceneKind])))
            .join("・");
          const talkedNpcNames = entry.talkedNpcIds
            .map((npcId) => npcById[npcId].name)
            .join("・");
          const visitedFieldNames = entry.visitedFieldIds
            .map((fieldId) => fieldById[fieldId].name)
            .join(" → ");
          const placedTrapPlaces = entry.placedPlayerTrapIds
            .map((id) => treeIdFromPlayerTrapId(id))
            .map((treeId) => treeId ? treeById[treeId] : undefined)
            .map((tree) => tree ? fieldById[tree.fieldId].locationId : undefined)
            .filter((locationId): locationId is NonNullable<typeof locationId> => Boolean(locationId))
            .map((locationId) => locationById[locationId].name)
            .join("・");
          const checkedTrapPlaces = entry.checkedPlayerTrapIds
            .map((id) => treeIdFromPlayerTrapId(id))
            .map((treeId) => treeId ? treeById[treeId] : undefined)
            .map((tree) => tree ? fieldById[tree.fieldId].locationId : undefined)
            .filter((locationId): locationId is NonNullable<typeof locationId> => Boolean(locationId))
            .map((locationId) => locationById[locationId].name)
            .join("・");
          return (
            <details className="journal-entry" key={entry.day} open={entry.day === state.day}>
              <summary>
                <span className={`journal-stamp ${entry.stampId ? "is-earned" : ""}`} aria-hidden="true">
                  {entry.stampId ? theme.stamp : nature.icon}
                </span>
                <span>
                  <small>夏休み {entry.day}日目</small>
                  <strong>{nature.name}</strong>
                </span>
                <b>{entry.themeCompleted ? "観察できた" : "自由に過ごした"}</b>
              </summary>
              <div className="journal-entry-body">
                <p className="journal-theme-line"><small>観察テーマ</small>{theme.label}</p>
                <div className="journal-facts">
                  <span>木 {entry.inspectedTreeIds.length}本</span>
                  <span>捕獲 {entry.capturedSpecimenIds.length}匹</span>
                  <span>歩いた場所 {entry.visitedFieldIds.length}か所</span>
                  {(entry.placedPlayerTrapIds.length > 0 || entry.checkedPlayerTrapIds.length > 0) && (
                    <span>自分の仕掛け {entry.checkedPlayerTrapIds.length > 0 ? "確認" : "設置"}</span>
                  )}
                </div>
                <dl className="journal-detail-list">
                  <div>
                    <dt>最大個体</dt>
                    <dd>{largestSpecimen
                      ? `${insectById[largestSpecimen.insectId].name} ${largestSpecimen.sizeMm.toFixed(1)}mm`
                      : "なし"}</dd>
                  </div>
                  <div><dt>初捕獲種</dt><dd>{firstCatchNames || "なし"}</dd></div>
                  <div><dt>見たところ</dt><dd>{pointKindNames || "まだ見ていない"}</dd></div>
                  <div><dt>話した人</dt><dd>{talkedNpcNames || "なし"}</dd></div>
                  <div><dt>歩いた場所</dt><dd>{visitedFieldNames || "なし"}</dd></div>
                  <div><dt>仕掛けた場所</dt><dd>{placedTrapPlaces || "なし"}</dd></div>
                  <div><dt>確認した仕掛け</dt><dd>{checkedTrapPlaces || "なし"}</dd></div>
                </dl>
                {entry.rumorId && entry.rumorNpcId && (
                  <blockquote>
                    <small>{npcById[entry.rumorNpcId].name}から聞いた噂</small>
                    {getRumorText(entry.rumorId)}
                  </blockquote>
                )}
                <div className="journal-diary">
                  {entry.diaryLines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
};

export const EncyclopediaSheet = ({ state, onClose }: { state: GameState; onClose: () => void }) => {
  const [tab, setTab] = useState<"insects" | "journal">("insects");
  const tabsId = useId();
  const tabRefs = useRef<Record<"insects" | "journal", HTMLButtonElement | null>>({
    insects: null,
    journal: null,
  });
  const tabIds = ["insects", "journal"] as const;
  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: (typeof tabIds)[number],
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = tabIds.indexOf(currentTab);
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabIds[(currentIndex + offset + tabIds.length) % tabIds.length];
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };
  return (
    <Sheet
      title="カブクワ図鑑"
      eyebrow={tab === "insects"
        ? `${new Set(state.specimens.map((item) => item.insectId)).size} / ${insects.length}種`
        : `夏休み ${state.day}日目`}
      onClose={onClose}
      className="encyclopedia-sheet"
    >
      <div className="book-tabs" role="tablist" aria-label="図鑑のページ">
        <button
          ref={(element) => { tabRefs.current.insects = element; }}
          id={`${tabsId}-insects-tab`}
          role="tab"
          aria-controls={`${tabsId}-insects-panel`}
          aria-selected={tab === "insects"}
          tabIndex={tab === "insects" ? 0 : -1}
          className={tab === "insects" ? "is-active" : ""}
          onClick={() => setTab("insects")}
          onKeyDown={(event) => handleTabKeyDown(event, "insects")}
        >虫図鑑</button>
        <button
          ref={(element) => { tabRefs.current.journal = element; }}
          id={`${tabsId}-journal-tab`}
          role="tab"
          aria-controls={`${tabsId}-journal-panel`}
          aria-selected={tab === "journal"}
          tabIndex={tab === "journal" ? 0 : -1}
          className={tab === "journal" ? "is-active" : ""}
          onClick={() => setTab("journal")}
          onKeyDown={(event) => handleTabKeyDown(event, "journal")}
        >夏休み観察ノート</button>
      </div>
      <div
        id={`${tabsId}-insects-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-insects-tab`}
        tabIndex={0}
        hidden={tab !== "insects"}
      >
        <InsectCollection state={state} />
      </div>
      <div
        id={`${tabsId}-journal-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-journal-tab`}
        tabIndex={0}
        hidden={tab !== "journal"}
      >
        <ObservationNotebook state={state} />
      </div>
    </Sheet>
  );
};

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
  const [catchRevealed, setCatchRevealed] = useState(outcome.type !== "caught");
  useEffect(() => {
    if (outcome.type !== "caught") {
      setCatchRevealed(true);
      return;
    }
    setCatchRevealed(false);
    const timer = setTimeout(() => setCatchRevealed(true), 480);
    return () => clearTimeout(timer);
  }, [outcome]);

  if (outcome.type === "caught" && !catchRevealed) {
    return (
      <div className="capture-cutscene" role="dialog" aria-modal="true" aria-label="捕獲演出">
        <div className="capture-net" aria-hidden="true"><i /></div>
        <strong>つかまえた！</strong>
      </div>
    );
  }
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
          <div className="record-badges">
            {outcome.isFirstCatch && <span className="record-badge">初捕獲・図鑑追加</span>}
            {outcome.isPersonalBest && !outcome.isFirstCatch && <span className="record-badge">自己ベスト更新</span>}
          </div>
          <dl className="catch-details">
            <div><dt>分類</dt><dd>{insectById[outcome.specimen.insectId].family}</dd></div>
            <div><dt>場所</dt><dd>{locationById[outcome.specimen.locationId].name}</dd></div>
            <div>
              <dt>見つけた所</dt>
              <dd>
                {outcome.specimen.treeId && treeById[outcome.specimen.treeId]
                  ? outcome.specimen.captureSource === "player-banana"
                    ? `${treeById[outcome.specimen.treeId].label}・自分で仕掛けたバナナトラップ`
                    : `${treeById[outcome.specimen.treeId].label}・${treeById[outcome.specimen.treeId].inspectionPoints.find((point) => point.id === outcome.specimen.inspectionPointId)?.label ?? "木のそば"}`
                  : "木のそば"}
              </dd>
            </div>
            <div><dt>記録</dt><dd>{outcome.specimen.day}日目 {formatTime(outcome.specimen.caughtAtMinutes)}</dd></div>
          </dl>
          <p>大きさは広告効果に左右されません。</p>
          <div className={`ranking-note ${outcome.specimen.rankingEligible ? "is-eligible" : "is-assisted"}`}>
            {outcome.specimen.rankingEligible
              ? outcome.specimen.captureSource === "player-banana"
                ? "自分で仕掛けた通常トラップ：将来のランキング対象"
                : "自然出現：将来のランキング対象"
              : "出現率アップで追加出現：図鑑・採集記録のみ"}
          </div>
        </div>
      )}
      {outcome.type === "empty" && <p className="empty-result">{outcome.text}</p>}
      {outcome.type === "dialogue" && (
        <div className="dialogue-result">
          <small>{npcById[outcome.npcId].role}</small>
          {outcome.text.split(/\n{2,}/).map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
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

export const PickupCutscene = ({ onComplete }: { onComplete: () => void }) => {
  const cutsceneRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(cutsceneRef, undefined, true);
  return (
    <div
      ref={cutsceneRef}
      className="cutscene pickup-cutscene"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pickup-title"
    >
      <div className="cutscene-sky" aria-hidden="true"><i /><i /><i /></div>
      <div className="pickup-dialogue">
        <p>遠くから、聞き慣れた声がする。</p>
        <h2 id="pickup-title">「おーい！ 迎えに来たよ！」</h2>
        <span>おばあちゃんが迎えに来てくれた！</span>
        <button className="primary-button" onClick={onComplete}>おばあちゃんの家へ</button>
      </div>
    </div>
  );
};

export const DaySummarySheet = ({
  state,
  onNextDay,
}: {
  state: GameState;
  onNextDay: () => void;
}) => {
  const summaryRef = useRef<HTMLElement>(null);
  useModalFocusTrap(summaryRef);
  const today = state.specimens.filter((specimen) => specimen.day === state.day);
  const kinds = new Set(today.map((specimen) => specimen.insectId));
  const largest = today.reduce<null | (typeof today)[number]>((best, specimen) =>
    !best || specimen.sizeMm > best.sizeMm ? specimen : best, null);
  const journal = state.observationJournalByDay[String(state.day)];
  const nature = journal ? dailyNatureById[journal.natureId] : undefined;
  const theme = journal ? observationThemeById[journal.themeId] : undefined;
  const pointKinds = journal
    ? new Set(Object.values(treeById).flatMap((tree) => tree.inspectionPoints)
        .filter((point) => journal.examinedPointIds.includes(point.id))
        .map((point) => point.sceneKind))
    : new Set();
  const pointKindLabel = pointKinds.size > 0
    ? [
        pointKinds.has("sap") ? "樹液" : "",
        pointKinds.has("bark-crack") ? "割れ目" : "",
        pointKinds.has("root") ? "根元" : "",
        pointKinds.has("banana-trap") || pointKinds.has("light-trap") ? "仕掛け" : "",
      ].filter(Boolean).join("・")
    : "まだ見ていない";
  return (
    <div className="sheet-backdrop persistent">
      <section
        ref={summaryRef}
        className="bottom-sheet day-summary"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-title"
        tabIndex={-1}
      >
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
        {journal && nature && theme && (
          <div className="observation-summary">
            <div className="summary-nature">
              <span aria-hidden="true">{nature.icon}</span>
              <p><small>今日の自然</small><strong>{nature.name}</strong></p>
            </div>
            <dl>
              <div><dt>調べた木</dt><dd>{journal.inspectedTreeIds.length}本</dd></div>
              <div><dt>見たところ</dt><dd>{pointKindLabel}</dd></div>
              <div><dt>仕掛けた</dt><dd>{journal.placedPlayerTrapIds.length > 0 ? "1か所" : "なし"}</dd></div>
              <div><dt>仕掛け確認</dt><dd>{journal.checkedPlayerTrapIds.length > 0 ? "できた" : "なし"}</dd></div>
            </dl>
            <div className={`summary-theme-result ${journal.themeCompleted ? "is-complete" : ""}`}>
              <span aria-hidden="true">{journal.themeCompleted ? theme.stamp : "葉"}</span>
              <p>
                <small>{journal.themeCompleted ? "観察スタンプ" : "今日の観察"}</small>
                <strong>{journal.themeCompleted ? theme.label : "今日は自由に過ごした"}</strong>
              </p>
            </div>
            <p className="summary-diary">{journal.diaryLines[0]}</p>
          </div>
        )}
        <button className="primary-button" onClick={onNextDay}>次の日の朝へ</button>
      </section>
    </div>
  );
};
