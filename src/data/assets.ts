import type { LocationId } from "../types/game";

export interface SceneAsset {
  assetId: string;
  fallbackClass: string;
  dayPath?: string;
  nightPath?: string;
}

// Generated art will be connected here. Components never depend on concrete file paths.
export const sceneAssets: Record<LocationId, SceneAsset> = {
  "grandma-house": { assetId: "scene.grandmaHouse", fallbackClass: "scene-home" },
  backyard: { assetId: "scene.backyard", fallbackClass: "scene-backyard" },
  shrine: { assetId: "scene.shrine", fallbackClass: "scene-shrine" },
  "mixed-forest": { assetId: "scene.mixedForest", fallbackClass: "scene-mixed" },
  "oak-forest": { assetId: "scene.oakForest", fallbackClass: "scene-oak" },
  "bamboo-grove": { assetId: "scene.bambooGrove", fallbackClass: "scene-bamboo" },
  school: { assetId: "scene.school", fallbackClass: "scene-school" },
  "secret-forest": { assetId: "scene.secretForest", fallbackClass: "scene-secret" },
};
