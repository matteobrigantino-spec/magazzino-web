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
const CHECKBOX_SIZE = 3.6;
const CHECKBOX_RIGHT_MARGIN = 3;
const CHECKBOX_RESERVE = CHECKBOX_SIZE + CHECKBOX_RIGHT_MARGIN + 2;

export function buildProductionPdf(rows: ProductionPdfRow[], logo: string, meta: ProductionPdfMeta) {
  if (!rows.length) throw new Error("Nessuna riga selezionata.");
  if (!logo) throw new Error("Carica il logo aziendale prima di scaricare il PDF.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setProperties({ title: "Programma di produzione", subject: "Battelli selezionati" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;
  const widths = [12, 23, 29, 23, 25, 23, 30, 27, tableWidth - 192];
  const headings = ["Prog.", "N° ordine", "Modello", "Carena", "Ragno /\nLongheroni", "Coperta", "Accessori", "Reparto", "Note"];
  const headerY = 58;
  const bodyStart = 70;
  const bottom = 192;
  const fontSize = 9.5;
  const lineHeight = 4.1;
  const padding = 2.5;
  const minRowHeight = 14;
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

    // Operatore / date on a single left-aligned line, all at the same level.
    cursorY += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 102, 118);
    const metaLine = [
      `Operatore: ${meta.operator || "-"}`,
      `Data ordine: ${meta.orderDate || "-"}`,
      `Data ultimo aggiornamento: ${meta.updatedDate || "-"}`,
    ].join("      ");
    doc.text(metaLine, margin, cursorY, { align: "left" });

    // A light heading band and white rows keep the document clear when printed.
    // Row positions, timestamps, status and elapsed days are deliberately omitted.
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
    y = bodyStart;
  }

  header();
  rows.forEach((row) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const values = [row.progressive, row.order, row.model, row.hull,
      row.stringers, row.deck, row.accessories, row.department, row.note];
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
        // Centered on the row's own height so it never crowds the text beside it.
        if (offset === 0 && CHECKBOX_COLUMNS.has(index)) {
          doc.setDrawColor(120, 130, 145);
          doc.roundedRect(
            x + widths[index] - CHECKBOX_SIZE - CHECKBOX_RIGHT_MARGIN,
            y + (height - CHECKBOX_SIZE) / 2,
            CHECKBOX_SIZE,
            CHECKBOX_SIZE,
            0.6,
            0.6
          );
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
