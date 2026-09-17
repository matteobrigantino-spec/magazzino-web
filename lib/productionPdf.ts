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

export function buildProductionPdf(rows: ProductionPdfRow[], logo: string) {
  if (!rows.length) throw new Error("Nessuna riga selezionata.");
  if (!logo) throw new Error("Carica il logo aziendale prima di scaricare il PDF.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setProperties({ title: "Programma di produzione", subject: "Battelli selezionati" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;
  const widths = [12, 23, 29, 23, 25, 23, 30, 27, tableWidth - 192];
  const headings = ["Prog.", "N° ordine", "Modello", "Carena", "Ragno /\nLongheroni", "Coperta", "Accessori", "Reparto", "Note"];
  const headerY = 40;
  const bodyStart = 52;
  const bottom = 192;
  const fontSize = 9.5;
  const lineHeight = 4.1;
  const padding = 2.5;
  const minRowHeight = 14;
  const image = doc.getImageProperties(logo);
  const scale = Math.min(48 / image.width, 20 / image.height);
  const logoWidth = image.width * scale;
  const logoHeight = image.height * scale;
  let y = bodyStart;

  function header() {
    doc.addImage(logo, "PNG", margin, 13 + (20 - logoHeight) / 2, logoWidth, logoHeight, "production-logo");
    doc.setTextColor(24, 39, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("PROGRAMMA DI PRODUZIONE", pageWidth - margin, 26, { align: "right" });

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
      const text = String(value ?? "").trim().replace(/\r\n?/g, "\n").replace(/[\u2010-\u2015]/g, "-");
      return doc.splitTextToSize(text || "-", widths[index] - padding * 2);
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
