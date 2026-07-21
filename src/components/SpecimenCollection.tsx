import { useEffect, useId, useMemo, useRef, useState } from "react";
import { insects, insectById } from "../data/insects";
import { formatTime } from "../game/clock";
import {
  getBestDifference,
  getCaptureSourceLabel,
  getFavoriteSpecimens,
  getRankingStatusLabel,
  getSpeciesBestSize,
  getSpeciesSpecimens,
  getSpecimenLocationLabel,
  getSpecimenPointLabel,
  getSpecimenTreeLabel,
  type SpecimenSort,
} from "../game/collection";
import type { GameCommand, GameState, InsectId, Specimen } from "../types/game";

const PAGE_SIZE = 30;

const BeetleMedallion = ({ insectId }: { insectId: InsectId }) => (
  <span className="beetle-medallion" aria-hidden="true">
    <i className={insectById[insectId].family === "カブトムシ" ? "rhino-mark" : "stag-mark"} />
  </span>
);

export const SpeciesIndex = ({
  state,
  onOpenSpecies,
}: {
  state: GameState;
  onOpenSpecies: (insectId: InsectId) => void;
}) => {
  const summaryBySpecies = useMemo(() => {
    const favorites = new Set(state.favoriteSpecimenIds);
    const summaries = new Map(insects.map((insect) => [insect.id, {
      count: 0,
      best: 0,
      favoriteCount: 0,
    }]));
    for (const specimen of state.specimens) {
      const summary = summaries.get(specimen.insectId);
      if (!summary) continue;
      summary.count += 1;
      summary.best = Math.max(summary.best, specimen.sizeMm);
      if (favorites.has(specimen.id)) summary.favoriteCount += 1;
    }
    return summaries;
  }, [state.favoriteSpecimenIds, state.specimens]);

  return (
    <div className="card-list collection-index">
      {insects.map((insect) => {
        const summary = summaryBySpecies.get(insect.id)!;
        const found = summary.count > 0;
        const content = (
          <>
            <BeetleMedallion insectId={insect.id} />
            <span className="collection-card-copy">
              <small>レア度 {"●".repeat(insect.rarity)}{"○".repeat(5 - insect.rarity)}</small>
              <strong>{found ? insect.name : "まだ見つけていない"}</strong>
              <span>{found
                ? `${summary.count}匹 · 最大 ${summary.best.toFixed(1)}mm${summary.favoriteCount > 0 ? ` · とっておき ${summary.favoriteCount}匹` : ""}`
                : insect.hint}</span>
            </span>
            {found && <span className="collection-chevron" aria-hidden="true">›</span>}
          </>
        );
        return found ? (
          <button
            type="button"
            className="collection-card is-found"
            data-collection-focus={`species-${insect.id}`}
            key={insect.id}
            onClick={() => onOpenSpecies(insect.id)}
            aria-label={`${insect.name}、${summary.count}匹、最大${summary.best.toFixed(1)}ミリ${summary.favoriteCount > 0 ? `、とっておき${summary.favoriteCount}匹` : ""}、個体の記録を見る`}
          >
            {content}
          </button>
        ) : (
          <article className="collection-card is-unknown" key={insect.id}>
            {content}
          </article>
        );
      })}
    </div>
  );
};

const SpecimenCard = ({
  specimen,
  bestSize,
  favorite,
  showSpecies,
  onOpen,
}: {
  specimen: Specimen;
  bestSize: number;
  favorite: boolean;
  showSpecies: boolean;
  onOpen: () => void;
}) => {
  const difference = getBestDifference(specimen, bestSize);
  return (
    <button
      type="button"
      className={`specimen-card ${favorite ? "is-favorite" : ""}`}
      data-collection-focus={`specimen-${specimen.id}`}
      onClick={onOpen}
      aria-label={`${insectById[specimen.insectId].name} ${specimen.sizeMm.toFixed(1)}ミリ、${specimen.day}日目 ${formatTime(specimen.caughtAtMinutes)}、${getSpecimenLocationLabel(specimen)}、${difference === 0 ? "自己ベスト" : `ベストまでマイナス${difference.toFixed(1)}ミリ`}${favorite ? "、とっておき" : ""}、詳しい記録を見る`}
    >
      {showSpecies && <BeetleMedallion insectId={specimen.insectId} />}
      <span className="specimen-card-copy">
        {showSpecies && <small>{insectById[specimen.insectId].name}</small>}
        <strong>{specimen.sizeMm.toFixed(1)}<small>mm</small></strong>
        <span>{specimen.day}日目 {formatTime(specimen.caughtAtMinutes)} · {getSpecimenLocationLabel(specimen)}</span>
        <em>{difference === 0 ? "自己ベスト" : `ベストまで -${difference.toFixed(1)}mm`}</em>
      </span>
      {favorite && <span className="favorite-chip">★ とっておき</span>}
      <span className="collection-chevron" aria-hidden="true">›</span>
    </button>
  );
};

const SortControl = ({ sort, onChange }: { sort: SpecimenSort; onChange: (sort: SpecimenSort) => void }) => (
  <div className="specimen-sort" role="group" aria-label="個体の並び順">
    <button
      type="button"
      aria-pressed={sort === "newest"}
      className={sort === "newest" ? "is-active" : ""}
      onClick={() => onChange("newest")}
    >新しい順</button>
    <button
      type="button"
      aria-pressed={sort === "largest"}
      className={sort === "largest" ? "is-active" : ""}
      onClick={() => onChange("largest")}
    >大きい順</button>
  </div>
);

export const SpeciesSpecimenList = ({
  state,
  insectId,
  onBack,
  onOpenSpecimen,
}: {
  state: GameState;
  insectId: InsectId;
  onBack: () => void;
  onOpenSpecimen: (specimenId: string) => void;
}) => {
  const [sort, setSort] = useState<SpecimenSort>("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const specimens = useMemo(
    () => getSpeciesSpecimens(state.specimens, insectId, sort),
    [insectId, sort, state.specimens],
  );
  const bestSize = useMemo(
    () => getSpeciesBestSize(state.specimens, insectId),
    [insectId, state.specimens],
  );
  const favorites = useMemo(() => new Set(state.favoriteSpecimenIds), [state.favoriteSpecimenIds]);
  const changeSort = (next: SpecimenSort) => {
    setSort(next);
    setVisibleCount(PAGE_SIZE);
  };
  return (
    <section className="specimen-page" aria-labelledby="species-specimen-heading">
      <button type="button" className="collection-back-button" onClick={onBack}>← 虫図鑑へ戻る</button>
      <header className="collection-page-heading">
        <BeetleMedallion insectId={insectId} />
        <div>
          <small>{specimens.length}匹の思い出</small>
          <h3 id="species-specimen-heading">{insectById[insectId].name}</h3>
          <p>自己ベスト {bestSize.toFixed(1)}mm</p>
        </div>
      </header>
      <SortControl sort={sort} onChange={changeSort} />
      <div className="specimen-list">
        {specimens.slice(0, visibleCount).map((specimen) => (
          <SpecimenCard
            key={specimen.id}
            specimen={specimen}
            bestSize={bestSize}
            favorite={favorites.has(specimen.id)}
            showSpecies={false}
            onOpen={() => onOpenSpecimen(specimen.id)}
          />
        ))}
      </div>
      {visibleCount < specimens.length && (
        <button
          type="button"
          className="secondary-button collection-load-more"
          onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, specimens.length))}
        >さらに30匹見る</button>
      )}
    </section>
  );
};

export const FavoriteSpecimenList = ({
  state,
  onOpenSpecimen,
}: {
  state: GameState;
  onOpenSpecimen: (specimenId: string) => void;
}) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const specimens = useMemo(() => getFavoriteSpecimens(state), [state]);
  const bestBySpecies = useMemo(() => new Map(insects.map((insect) => [
    insect.id,
    getSpeciesBestSize(state.specimens, insect.id),
  ])), [state.specimens]);
  if (specimens.length === 0) {
    return (
      <div className="favorite-empty" data-collection-focus="favorites-empty" tabIndex={-1}>
        <span aria-hidden="true">☆</span>
        <h3>とっておきは、まだありません</h3>
        <p>虫を捕まえた直後や個体の詳しい記録から、好きな1匹を自由に登録できます。</p>
      </div>
    );
  }
  return (
    <section className="specimen-page" aria-labelledby="favorite-list-heading">
      <div className="collection-page-heading favorites-heading" data-collection-focus="favorites-list" tabIndex={-1}>
        <span className="favorite-heading-star" aria-hidden="true">★</span>
        <div>
          <small>{specimens.length}匹</small>
          <h3 id="favorite-list-heading">とっておきの虫かご</h3>
          <p>最近とっておきにした順</p>
        </div>
      </div>
      <div className="specimen-list">
        {specimens.slice(0, visibleCount).map((specimen) => (
          <SpecimenCard
            key={specimen.id}
            specimen={specimen}
            bestSize={bestBySpecies.get(specimen.insectId) ?? specimen.sizeMm}
            favorite
            showSpecies
            onOpen={() => onOpenSpecimen(specimen.id)}
          />
        ))}
      </div>
      {visibleCount < specimens.length && (
        <button
          type="button"
          className="secondary-button collection-load-more"
          onClick={() => setVisibleCount((count) => Math.min(count + PAGE_SIZE, specimens.length))}
        >さらに30匹見る</button>
      )}
    </section>
  );
};

export const SpecimenDetail = ({
  state,
  specimen,
  dispatch,
  onBack,
}: {
  state: GameState;
  specimen: Specimen;
  dispatch: (command: GameCommand) => void;
  onBack: () => void;
}) => {
  const favorite = state.favoriteSpecimenIds.includes(specimen.id);
  const bestSize = getSpeciesBestSize(state.specimens, specimen.insectId);
  const difference = getBestDifference(specimen, bestSize);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [specimen.id]);
  return (
    <section className="specimen-detail" aria-labelledby={headingId}>
      <button type="button" className="collection-back-button" onClick={onBack}>← 一覧へ戻る</button>
      <div className="specimen-detail-hero">
        <div className="large-beetle" aria-hidden="true">
          <i className={insectById[specimen.insectId].family === "カブトムシ" ? "rhino-mark" : "stag-mark"} />
        </div>
        <small>捕まえた虫の記録</small>
        <h3 ref={headingRef} id={headingId} tabIndex={-1}>{insectById[specimen.insectId].name}</h3>
        <strong>{specimen.sizeMm.toFixed(1)}<small>mm</small></strong>
        <span className={difference === 0 ? "personal-best" : "best-difference"}>
          {difference === 0 ? "自己ベスト" : `自己ベストまで -${difference.toFixed(1)}mm`}
        </span>
      </div>
      <dl className="specimen-detail-list">
        <div><dt>捕まえた日</dt><dd>夏休み {specimen.day}日目</dd></div>
        <div><dt>時刻</dt><dd>{formatTime(specimen.caughtAtMinutes)}</dd></div>
        <div><dt>場所</dt><dd>{getSpecimenLocationLabel(specimen)}</dd></div>
        <div><dt>木</dt><dd>{getSpecimenTreeLabel(specimen)}</dd></div>
        <div><dt>見つけた所</dt><dd>{getSpecimenPointLabel(specimen)}</dd></div>
        <div><dt>捕獲元</dt><dd>{getCaptureSourceLabel(specimen.captureSource)}</dd></div>
        <div><dt>記録の扱い</dt><dd>{getRankingStatusLabel(specimen)}</dd></div>
      </dl>
      <button
        type="button"
        className={`favorite-button ${favorite ? "is-favorite" : ""}`}
        aria-pressed={favorite}
        aria-label={favorite ? "とっておきから外す" : "とっておきにする"}
        onClick={() => dispatch({
          type: "SET_SPECIMEN_FAVORITE",
          specimenId: specimen.id,
          favorite: !favorite,
        })}
      >
        <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
        {favorite ? "とっておきから外す" : "とっておきにする"}
      </button>
      <p className="favorite-note">大きさに関係なく、好きな個体を何匹でも残せます。</p>
    </section>
  );
};
