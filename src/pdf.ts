type Size = { width: number; height: number };

// A PDF with one full-page JPEG on each page. A printed sheet needs nothing more, so this saves a PDF library.
export function pdfFromJpegs(jpegs: Uint8Array<ArrayBuffer>[], pixels: Size, page: Size) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (content: string | Uint8Array<ArrayBuffer>) => {
    const bytes = typeof content === "string" ? encoder.encode(content) : content;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (body: string, stream?: Uint8Array<ArrayBuffer>) => {
    offsets.push(length);
    write(`${offsets.length} 0 obj\n${body}\n`);
    if (stream) {
      write("stream\n");
      write(stream);
      write("\nendstream\n");
    }
    write("endobj\n");
  };

  write("%PDF-1.4\n");
  // Objects 1 and 2 are the catalog and the page list, followed by a page, its image and its drawing for each page.
  const pageObject = (index: number) => 3 + index * 3;
  object("<< /Type /Catalog /Pages 2 0 R >>");
  object(`<< /Type /Pages /Count ${jpegs.length} /Kids [${jpegs.map((_, index) => `${pageObject(index)} 0 R`).join(" ")}] >>`);
  jpegs.forEach((jpeg, index) => {
    const image = pageObject(index) + 1;
    object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Sheet ${image} 0 R >> >> /Contents ${image + 1} 0 R >>`);
    object(`<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
    const drawing = encoder.encode(`${page.width} 0 0 ${page.height} 0 0 cm /Sheet Do`);
    object(`<< /Length ${drawing.length} >>`, drawing);
  });

  const table = length;
  write(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) write(`${String(offset).padStart(10, "0")} 00000 n \n`);
  write(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${table}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}
