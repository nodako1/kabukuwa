import type { AdRewardKind } from "../types/game";

export type AdResult = { status: "completed" } | { status: "cancelled" | "failed"; message: string };

export interface AdRewardProvider {
  showRewardedAd(reward: AdRewardKind): Promise<AdResult>;
}

export class MockAdRewardProvider implements AdRewardProvider {
  async showRewardedAd(_reward: AdRewardKind): Promise<AdResult> {
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    return { status: "completed" };
  }
}
