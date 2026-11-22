import { describe, expect, it } from "vitest";
import { scaleToFit } from "../src/ui/layout";
import { arrangePanels } from "../src/ui/panels";

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

describe("arrangePanels", () => {
  const panel = (size: "big" | "small" | "off", weight: number) => ({ element: { hidden: false, style: {} } as unknown as HTMLElement, size, weight });
  const rowsOf = (...panels: Parameters<typeof arrangePanels>[1]) => {
    const grid = { style: {} } as HTMLElement;
    arrangePanels(grid, panels);
    return grid.style.gridTemplateRows;
  };

  it("gives a small panel half the height it takes when big, so the big one plainly grows", () => {
    expect(rowsOf(panel("big", 2), panel("big", 1.6))).toBe("minmax(0, 2fr) minmax(0, 1.6fr)");
    expect(rowsOf(panel("big", 2), panel("small", 1.6))).toBe("minmax(0, 2fr) minmax(0, 0.8fr)");
  });

  it("makes a row of two small panels as tall as the taller would be", () => {
    expect(rowsOf(panel("big", 3), panel("small", 2.6), panel("small", 2))).toBe("minmax(0, 3fr) minmax(0, 1.3fr)");
  });

  it("hides a panel's size button when it's the only one shown", () => {
    const sizeButton = { hidden: false } as HTMLButtonElement;
    rowsOf({ ...panel("big", 2), sizeButton }, panel("off", 1.6));
    expect(sizeButton.hidden).toBe(true);
  });

  it("keeps the panels in their order, so a small one above a big one stays above it, across the whole width", () => {
    const small = panel("small", 2);
    expect(rowsOf(small, panel("big", 1.6))).toBe("minmax(0, 1fr) minmax(0, 1.6fr)");
    expect(small.element.style.gridColumn).toBe("1 / -1");
  });
});
