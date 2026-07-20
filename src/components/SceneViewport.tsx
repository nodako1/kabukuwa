import { sceneAssets } from "../data/assets";
import { locationById } from "../data/locations";
import { getTimePeriod } from "../game/clock";
import { presentNpcs } from "../game/rules";
import type { GameCommand, GameState, HotspotDefinition, NpcDefinition } from "../types/game";

const SpotArtwork = ({ hotspot }: { hotspot: HotspotDefinition }) => (
  <span className={`spot-art spot-art-${hotspot.kind}`} aria-hidden="true">
    <i className="spot-top" />
    <i className="spot-base" />
  </span>
);

const NpcArtwork = ({ npc }: { npc: NpcDefinition }) => (
  <span className="npc-art" style={{ "--npc-color": npc.color } as React.CSSProperties} aria-hidden="true">
    <i className="npc-head" />
    <i className="npc-body" />
  </span>
);

interface SceneViewportProps {
  state: GameState;
  dispatch: (command: GameCommand) => void;
  onOpenRewards: () => void;
}

export const SceneViewport = ({ state, dispatch, onOpenRewards }: SceneViewportProps) => {
  const location = locationById[state.locationId];
  const asset = sceneAssets[state.locationId];
  const period = getTimePeriod(state.timeMinutes);
  const characters = presentNpcs(state);
  const searched = state.exploration?.searchedSpotIds ?? [];
  const focused = state.exploration?.focusedSpotId;
  const focusedSpot = location.hotspots.find((spot) => spot.id === focused);

  return (
    <section
      className={`scene-viewport ${asset.fallbackClass} period-${period}`}
      data-asset-id={asset.assetId}
      aria-labelledby="location-heading"
    >
      <div className="scene-backdrop" aria-hidden="true">
        <span className="sky-layer" />
        <span className="sun-layer" />
        <span className="hill-layer hill-back" />
        <span className="hill-layer hill-front" />
        <span className="ground-layer" />
        <span className="building-layer" />
        <span className="bamboo-layer" />
        <span className="torii-layer" />
        <span className="school-layer" />
        <span className="light-beam" />
      </div>

      <div className="location-caption">
        <p>現在地</p>
        <h2 id="location-heading">{location.name}</h2>
        <span>{location.description}</span>
      </div>

      <div className="hotspot-layer">
        {location.hotspots.map((hotspot) => {
          const isSearched = searched.includes(hotspot.id);
          const isFocused = focused === hotspot.id;
          const inactive = hotspot.activePeriods && !hotspot.activePeriods.includes(period);
          return (
            <button
              className={`hotspot-button ${isFocused ? "is-focused" : ""} ${
                isSearched ? "is-searched" : ""
              } ${inactive ? "is-inactive" : ""}`}
              key={hotspot.id}
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
              onClick={() => dispatch({ type: "FOCUS_SPOT", spotId: hotspot.id })}
              aria-label={`${location.name}の${hotspot.label}を選ぶ${isSearched ? "、調査済み" : ""}`}
            >
              <SpotArtwork hotspot={hotspot} />
              <span className="hotspot-label">{hotspot.label}</span>
              {isSearched && <span className="searched-mark">済</span>}
            </button>
          );
        })}

        {characters.map((npc, index) => (
          <button
            className="npc-button"
            key={npc.id}
            style={{
              left: `${characters.length > 1 ? 18 + index * 62 : 78}%`,
              top: `${characters.length > 1 ? 54 + (index % 2) * 7 : 57}%`,
            }}
            onClick={() => dispatch({ type: "TALK", npcId: npc.id })}
            aria-label={`${npc.name}と話す`}
          >
            <NpcArtwork npc={npc} />
            <span>{npc.name}</span>
            <small>話す</small>
          </button>
        ))}
      </div>

      <div className="scene-action-card">
        {focusedSpot ? (
          <>
            <div>
              <small>選んだ場所</small>
              <strong>{focusedSpot.label}</strong>
            </div>
            <button
              className="inspect-button"
              onClick={() => dispatch({ type: "INSPECT_SPOT" })}
              disabled={searched.includes(focusedSpot.id)}
            >
              {searched.includes(focusedSpot.id) ? "調査済み" : "そっと覗く · 15分"}
            </button>
          </>
        ) : location.hotspots.length > 0 ? (
          <p>木やトラップを選んで、そっと覗いてみよう。</p>
        ) : (
          <div className="home-actions">
            <p>縁側でひと息。出かける前に、おばあちゃんと話してみよう。</p>
            <button className="reward-entry-button" onClick={onOpenRewards}>
              おばあちゃんの応援
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
