import { describe, expect, it } from "vitest";
import { nextTarget } from "../src/ui/calendarPlan";

describe("plan targets", () => {
  it("steps up from none through 1, 2, 3 and 5 minutes, then in fives to an hour, then back to none", () => {
    const steps: (number | undefined)[] = [undefined];
    for (let i = 0; i < 16; i++) steps.push(nextTarget(steps.at(-1), 1));
    expect(steps).toEqual([undefined, 1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, undefined]);
  });

  it("steps down the same way to none, and no further", () => {
    expect(nextTarget(15, -1)).toBe(10);
    expect(nextTarget(10, -1)).toBe(5);
    expect(nextTarget(2, -1)).toBe(1);
    expect(nextTarget(1, -1)).toBeUndefined();
    expect(nextTarget(undefined, -1)).toBeUndefined();
  });

  it("moves a target saved between steps to the next step either way", () => {
    expect(nextTarget(7, 1)).toBe(10);
    expect(nextTarget(7, -1)).toBe(5);
  });
});
