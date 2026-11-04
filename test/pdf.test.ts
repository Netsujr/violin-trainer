import { describe, expect, it } from "vitest";
import { pdfFromJpegs } from "../src/pdf";

describe("pdfFromJpegs", () => {
  it("indexes every object where it really starts, so a reader can find the pages", async () => {
    const jpeg = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
    const blob = pdfFromJpegs([jpeg("first image"), jpeg("second image")], { width: 10, height: 20 }, { width: 595, height: 842 });
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());

    expect(blob.type).toBe("application/pdf");
    expect(text).toContain("/Count 2 /Kids [3 0 R 6 0 R]");
    expect(text).toContain("/Width 10 /Height 20");
    expect(text).toContain("/Length 12 >>\nstream\nsecond image\nendstream");

    const start = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const offsets = [...text.slice(start).matchAll(/(\d{10}) 00000 n \n/g)].map((match) => Number(match[1]));
    expect(offsets).toHaveLength(8);
    offsets.forEach((offset, index) => expect(text.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true));
  });
});
