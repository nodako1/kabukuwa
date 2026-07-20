import type { TimePeriod } from "../types/game";

export const DAY_START = 6 * 60;
export const EVENING_START = 18 * 60;
export const PICKUP_COMPLETE_TIME = 18 * 60 + 15;
export const DAY_END = 20 * 60;
export const SECRET_ROUTE_START = 16 * 60;

export const getTimePeriod = (minutes: number): TimePeriod => {
  if (minutes < 10 * 60) return "morning";
  if (minutes < 16 * 60) return "day";
  if (minutes < EVENING_START) return "evening";
  return "night";
};

export const formatTime = (minutes: number): string => {
  const safeMinutes = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}:${mins.toString().padStart(2, "0")}`;
};

export const getPeriodLabel = (period: TimePeriod): string =>
  ({ morning: "朝", day: "昼", evening: "夕方", night: "夜" })[period];
