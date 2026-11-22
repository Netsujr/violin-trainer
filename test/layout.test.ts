import { describe, expect, it } from "vitest";
import { scaleToFit } from "../src/ui/layout";

describe("scaleToFit", () => {
  it("draws as tall as the panel allows", () => {
    expect(scaleToFit({ clientWidth: 2000, clientHeight: 336 }, 336)).toBe(1);
    expect(scaleToFit({ clientWidth: 2000, clientHeight: 504 }, 336)).toBe(1.5);
  });

  it("keeps three beats across a narrow panel, and its own size before it's laid out", () => {
    expect(scaleToFit({ clientWidth: 245, clientHeight: 504 }, 336)).toBe(0.5);
    expect(scaleToFit({ clientWidth: 0, clientHeight: 0 }, 336)).toBe(1);
  });
});
