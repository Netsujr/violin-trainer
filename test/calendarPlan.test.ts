import { describe, expect, it } from "vitest";
import { nextTarget } from "../src/ui/calendarPlan";

describe("plan targets", () => {
  it("steps up in fives from none to an hour, then back to none", () => {
    const steps: (number | undefined)[] = [undefined];
    for (let i = 0; i < 13; i++) steps.push(nextTarget(steps.at(-1), 1));
    expect(steps).toEqual([undefined, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, undefined]);
  });

  it("steps down in fives to none, and no further", () => {
    expect(nextTarget(15, -1)).toBe(10);
    expect(nextTarget(5, -1)).toBeUndefined();
    expect(nextTarget(undefined, -1)).toBeUndefined();
  });
});
