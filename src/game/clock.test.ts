import { describe, expect, it } from "vitest";
import { formatTime, getTimePeriod } from "./clock";

describe("game clock", () => {
  it("formats the main time boundaries", () => {
    expect(formatTime(360)).toBe("6:00");
    expect(formatTime(1080)).toBe("18:00");
    expect(formatTime(1095)).toBe("18:15");
    expect(formatTime(1200)).toBe("20:00");
  });

  it("uses the intended four time periods", () => {
    expect(getTimePeriod(359)).toBe("morning");
    expect(getTimePeriod(600)).toBe("day");
    expect(getTimePeriod(960)).toBe("evening");
    expect(getTimePeriod(1080)).toBe("night");
  });
});
