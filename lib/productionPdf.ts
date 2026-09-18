import { jsPDF } from "jspdf";

export type ProductionPdfRow = {
  row: number;
  progressive: number;
  order: string;
  model: string;
  hull: string;
  stringers: string;
  deck: string;
  accessories: string;
  department: string;
  status: string;
  departmentDays: number;
  totalDays: number;
  note: string;
};

export type ProductionPdfMeta = {
  operator: string;
  orderDate: string;
  updatedDate: string;
};

// Positions refer to the visible table, not to the production progressive number.
export function selectProductionRows<T>(rows: T[], from: string, to: string) {
  const first = Number(from);
  const last = Number(to);
  if (!from.trim() || !to.trim() || !Number.isSafeInteger(first) ||
      !Number.isSafeInteger(last) || first < 1 || last < first || last > rows.length) {
    throw new Error(`Indica un intervallo valido: da riga 1 a ${rows.length}, con la riga finale maggiore o uguale a quella iniziale.`);
  }
  return rows.slice(first - 1, last);
}

// Columns where the crew ticks an "X" by hand once that part is physically done.
const CHECKBOX_COLUMNS = new Set([3, 4, 5, 6]); // Carena, Ragno/Longheroni, Coperta, Accessori
const CHECKBOX_SIZE = 4.5;
const CHECKBOX_RESERVE = 8; // room kept clear at the right of the column for the box

export function buildProductionPdf(rows: ProductionPdfRow[], logo: string, meta: ProductionPdfMeta) {
  if (!rows.length) throw new Error("Nessuna riga selezionata.");
  if (!logo) throw new Error("Carica il logo aziendale prima di scaricare il PDF.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setProperties({ title: "Programma di produzione", subject: "Battelli selezionati" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;
  // Reparto column removed: the freed width goes to the work columns (room for the
  // checkbox, made bigger and clearly boxed-in below) and to Note, which is now
  // short since it no longer repeats the department note.
  const widths = [12, 23, 27, 29, 31, 29, 34, tableWidth - 185];
  const headings = ["Prog.", "N° ordine", "Modello", "Carena", "Ragno /\nLongheroni", "Coperta", "Accessori", "Note"];
  const headerY = 64;
  const bodyStart = 76;
  const bottom = 192;
  const fontSize = 9.5;
  const lineHeight = 4.1;
  const padding = 2.5;
  const minRowHeight = 16;
  const image = doc.getImageProperties(logo);

  // Logo big and centered, with the title and the three metadata lines stacked underneath.
  const logoMaxWidth = 64;
  const logoMaxHeight = 24;
  const logoScale = Math.min(logoMaxWidth / image.width, logoMaxHeight / image.height);
  const logoWidth = image.width * logoScale;
  const logoHeight = image.height * logoScale;
  let y = bodyStart;

  function header() {
    const logoX = (pageWidth - logoWidth) / 2;
    const logoY = 9;
    doc.addImage(logo, "PNG", logoX, logoY, logoWidth, logoHeight, "production-logo");

    // Extra breathing room between the logo and the title underneath it.
    let cursorY = logoY + logoHeight + 10;
    doc.setTextColor(24, 39, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PROGRAMMA DI PRODUZIONE", pageWidth / 2, cursorY, { align: "center" });

    // Operatore / date, one under the other, left-aligned.
    cursorY += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 102, 118);
    const metaLines = [
      `Operatore: ${meta.operator || "-"}`,
      `Data ordine: ${meta.orderDate || "-"}`,
      `Data ultimo aggiornamento: ${meta.updatedDate || "-"}`,
    ];
    metaLines.forEach((line) => {
      doc.text(line, margin, cursorY, { align: "left" });
      cursorY += 4.3;
    });

    // A light heading band and white rows keep the document clear when printed.
    doc.setFillColor(244, 246, 248);
    doc.rect(margin, headerY, tableWidth, bodyStart - headerY, "F");
    doc.setFontSize(8.5);
    doc.setTextColor(65, 77, 93);
    let x = margin;
    headings.forEach((label, index) => {
      const labels = label.split("\n");
      const firstBaseline = headerY + (labels.length === 1 ? 7 : 5.2);
      labels.forEach((line, lineIndex) => doc.text(line, x + padding, firstBaseline + lineIndex * 3.5));
      x += widths[index];
    });

    // A visible grid: vertical lines between every column, so it is unmistakable
    // which text (and which checkbox) belongs to Carena vs Ragno/Longheroni vs
    // Coperta vs Accessori, even when the crew is skimming the page quickly.
    doc.setDrawColor(160, 169, 182);
    doc.setLineWidth(0.3);
    let gridX = margin;
    widths.forEach((w, index) => {
      gridX += w;
      if (index < widths.length - 1) doc.line(gridX, headerY, gridX, bottom);
    });
    doc.setDrawColor(130, 140, 155);
    doc.rect(margin, headerY, tableWidth, bottom - headerY);
    doc.setLineWidth(0.2);

    y = bodyStart;
  }

  header();
  rows.forEach((row) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const values = [row.progressive, row.order, row.model, row.hull,
      row.stringers, row.deck, row.accessories, row.note];
    const lines: string[][] = values.map((value, index) => {
      doc.setFont("helvetica", index === 1 ? "bold" : "normal");
      const text = String(value ?? "").trim().replace(/\r\n?/g, "\n").replace(/[‐-―]/g, "-");
      const reserve = CHECKBOX_COLUMNS.has(index) ? CHECKBOX_RESERVE : 0;
      return doc.splitTextToSize(text || "-", widths[index] - padding * 2 - reserve);
    });
    const maxLines = Math.max(...lines.map((cell) => cell.length));
    const fullHeight = Math.max(minRowHeight, maxLines * lineHeight + padding * 2);
    if (y + fullHeight > bottom && y > bodyStart) {
      doc.addPage();
      header();
    }

    // Very long notes continue across pages without being cut off.
    let offset = 0;
    while (offset < maxLines) {
      const available = Math.floor((bottom - y - padding * 2) / lineHeight);
      if (available < 1 || bottom - y < minRowHeight) {
        doc.addPage();
        header();
        continue;
      }
      const count = Math.min(available, maxLines - offset);
      const height = Math.max(minRowHeight, count * lineHeight + padding * 2);
      doc.setTextColor(36, 44, 55);
      doc.setFontSize(fontSize);
      let x = margin;
      lines.forEach((cell, index) => {
        let chunk = cell.slice(offset, offset + count);
        // Identify continued records using business references, never row positions.
        if (offset > 0 && index < 2 && !chunk.length) chunk = cell.slice(0, 1);
        doc.setFont("helvetica", index === 1 ? "bold" : "normal");
        chunk.forEach((line, lineIndex) =>
          doc.text(line, x + padding, y + padding + 3.2 + lineIndex * lineHeight)
        );
        // The crew ticks this box by hand once that part is physically done.
        // It is pinned right next to its OWN value ("Bianco [ ]" reads as one
        // unit) instead of floating at the far edge of the column, where it
        // could look like it belongs to the next column instead. It only
        // falls back toward the column's right edge when the value itself is
        // too long to leave room beside it.
        if (offset === 0 && CHECKBOX_COLUMNS.has(index)) {
          const firstLine = chunk[0] || "-";
          doc.setFont("helvetica", "normal");
          const textWidth = doc.getTextWidth(firstLine);
          const maxBoxX = x + widths[index] - CHECKBOX_SIZE - 1.5;
          const boxX = Math.min(x + padding + textWidth + 2, maxBoxX);
          const boxY = y + (height - CHECKBOX_SIZE) / 2;
          doc.setDrawColor(90, 100, 115);
          doc.setLineWidth(0.35);
          doc.roundedRect(boxX, boxY, CHECKBOX_SIZE, CHECKBOX_SIZE, 0.7, 0.7);
          doc.setLineWidth(0.2);
        }
        x += widths[index];
      });
      y += height;
      offset += count;
      if (offset < maxLines) {
        doc.addPage();
        header();
      }
    }
  });

  const total = doc.getNumberOfPages();
  for (let page = 1; total > 1 && page <= total; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 120, 133);
    doc.text(`Pagina ${page} di ${total}`, pageWidth - margin, 201, { align: "right" });
  }
  return doc;
}
