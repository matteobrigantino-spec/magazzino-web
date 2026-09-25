import { jsPDF } from "jspdf";
import { drawCompanyLogoTopRight } from "./pdfLogo";

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

// "Comfortable" sizes used when few boats are selected. Everything below is
// scaled from these so the whole selection - 5 boats or 40 - always lands on
// a single page instead of spilling onto a second one.
const BASE_FONT_SIZE = 9.5;
const BASE_LINE_HEIGHT = 3.9;
// Less whitespace padding above/below the text than before: every row was
// spending almost as much height on empty margin as on the letters
// themselves, so at high row counts the text auto-fit down to were smaller
// than they needed to be. Trimming this frees that space for the font size.
const BASE_PADDING = 1.5;
const BASE_CHECKBOX_SIZE = 4.5;
const BASE_CHECKBOX_RESERVE = 8; // room kept clear at the right of the value for the box
// Like Excel's "fit to one page" print option, the whole selection must land
// on a single sheet even when that means shrinking a lot - but not below a
// size a person can still actually read and tick with a pen.
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6; // ceiling so a handful of rows don't blow up into giant text

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
  const bottom = 194;
  const image = doc.getImageProperties(logo);

  // Logo big and centered, with the title and the three metadata lines stacked underneath.
  const logoMaxWidth = 64;
  const logoMaxHeight = 24;
  const logoScale = Math.min(logoMaxWidth / image.width, logoMaxHeight / image.height);
  const logoWidth = image.width * logoScale;
  const logoHeight = image.height * logoScale;

  // --- Auto-fit: find the largest scale (within bounds) at which every
  // selected boat still fits between bodyStart and bottom. Measuring is done
  // with the real column widths/wrapping rules, then the winning scale drives
  // font size, row height, padding and the checkbox itself.
  const availableHeight = bottom - bodyStart;

  function measureTotalHeight(scale: number) {
    const pad = BASE_PADDING * scale;
    const lh = BASE_LINE_HEIGHT * scale;
    const reserve = BASE_CHECKBOX_RESERVE * scale;
    const checkboxFloor = BASE_CHECKBOX_SIZE * scale + 2 * scale;
    doc.setFontSize(BASE_FONT_SIZE * scale);
    let total = 0;
    rows.forEach((row) => {
      const values = [row.progressive, row.order, row.model, row.hull,
        row.stringers, row.deck, row.accessories, row.note];
      let maxLines = 1;
      values.forEach((value, index) => {
        doc.setFont("helvetica", index === 1 ? "bold" : "normal");
        const text = String(value ?? "").trim().replace(/\r\n?/g, "\n").replace(/[‐-―]/g, "-");
        const res = CHECKBOX_COLUMNS.has(index) ? reserve : 0;
        const cellLines = doc.splitTextToSize(text || "-", widths[index] - pad * 2 - res);
        maxLines = Math.max(maxLines, cellLines.length);
      });
      total += Math.max(checkboxFloor, maxLines * lh + pad * 2);
    });
    return total;
  }

  let scale: number;
  if (measureTotalHeight(MAX_SCALE) <= availableHeight) {
    scale = MAX_SCALE; // few boats: use the comfortable ceiling size
  } else if (measureTotalHeight(MIN_SCALE) > availableHeight) {
    scale = MIN_SCALE; // unusually long list: smallest still-readable size
  } else {
    let lo = MIN_SCALE;
    let hi = MAX_SCALE;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (measureTotalHeight(mid) <= availableHeight) lo = mid; else hi = mid;
    }
    scale = lo;
  }

  const fontSize = BASE_FONT_SIZE * scale;
  const lineHeight = BASE_LINE_HEIGHT * scale;
  const padding = BASE_PADDING * scale;
  const CHECKBOX_SIZE = BASE_CHECKBOX_SIZE * scale;
  const minRowHeight = CHECKBOX_SIZE + 2 * scale; // the row must at least fit its own tick box
  const CHECKBOX_RESERVE = BASE_CHECKBOX_RESERVE * scale;
  const baselineOffset = 3.2 * scale;
  const checkboxGap = 2 * scale;
  const checkboxRightMargin = 1.5 * scale;

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
      labels.forEach((line, lineIndex) => doc.text(line, x + BASE_PADDING, firstBaseline + lineIndex * 3.5));
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

    // Very long notes continue across pages without being cut off. In the
    // normal case (auto-fit found a scale that fits) this never triggers.
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
          doc.text(line, x + padding, y + padding + baselineOffset + lineIndex * lineHeight)
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
          const maxBoxX = x + widths[index] - CHECKBOX_SIZE - checkboxRightMargin;
          const boxX = Math.min(x + padding + textWidth + checkboxGap, maxBoxX);
          const boxY = y + (height - CHECKBOX_SIZE) / 2;
          doc.setDrawColor(90, 100, 115);
          doc.setLineWidth(0.35);
          doc.roundedRect(boxX, boxY, CHECKBOX_SIZE, CHECKBOX_SIZE, 0.7, 0.7);
          doc.setLineWidth(0.2);
        }
        x += widths[index];
      });
      // A horizontal line under every row so each boat is clearly its own
      // block, not just separated by blank space.
      doc.setDrawColor(160, 169, 182);
      doc.setLineWidth(0.25);
      doc.line(margin, y + height, margin + tableWidth, y + height);
      doc.setLineWidth(0.2);
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

// ============================================================
// STATO TAPPEZZERIE BATTELLI
//
// Una riga per ogni "richiesta" di tappezzeria di un battello
// (un battello puo' averne piu' di una). Lo stato mostrato qui
// arriva gia' calcolato dal chiamante (ASSEGNATA / IN ORDINE /
// DA ORDINARE), non viene ricalcolato in questo file.
// ============================================================

export type UpholsteryStatusRow = {
  boatOrderNumber: string;
  boatModel: string;
  itemDescription: string;
  color: string;
  detailsLogos: string;
  stitching: string;
  quilting: string;
  status: "assegnata" | "ordine" | "da_ordinare";
  statusInfo: string;
};

export function buildUpholsteryStatusPdf(
  rows: UpholsteryStatusRow[],
  logo: string,
  generatedDate: string
) {
  if (!rows.length) throw new Error("Nessuna tappezzeria da elencare.");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setProperties({
    title: "Stato tappezzerie battelli",
    subject: "Report tappezzerie battelli",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;

  const columns = [
    { key: "order", label: "N. ORDINE", width: 24 },
    { key: "model", label: "MODELLO", width: 38 },
    { key: "item", label: "ARTICOLO TAPPEZZERIA", width: 60 },
    { key: "details", label: "COLORE / DETTAGLI", width: 70 },
    { key: "status", label: "STATO", width: 30 },
    { key: "info", label: "INFO", width: tableWidth - (24 + 38 + 60 + 70 + 30) },
  ];

  function statusColor(status: UpholsteryStatusRow["status"]): [number, number, number] {
    if (status === "assegnata") return [22, 163, 74];
    if (status === "ordine") return [37, 99, 235];
    return [217, 119, 6];
  }

  function statusLabel(status: UpholsteryStatusRow["status"]) {
    if (status === "assegnata") return "ASSEGNATA";
    if (status === "ordine") return "IN ORDINE";
    return "DA ORDINARE";
  }

  function drawHeader() {
    drawCompanyLogoTopRight(doc, logo);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("STATO TAPPEZZERIE BATTELLI", margin, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Report al ${generatedDate}`, margin, 22);
    doc.setTextColor(0, 0, 0);

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, 26, pageWidth - margin, 26);

    const headingY = 33;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);

    let x = margin;
    columns.forEach((column) => {
      doc.text(column.label, x, headingY);
      x += column.width;
    });

    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(225);
    doc.setLineWidth(0.25);
    doc.line(margin, headingY + 2.5, pageWidth - margin, headingY + 2.5);

    return headingY + 8;
  }

  let y = drawHeader();
  let previousBoatKey = "";

  rows.forEach((row) => {
    const boatKey = row.boatOrderNumber;
    const sameBoatAsPrevious = boatKey === previousBoatKey && boatKey !== "";
    previousBoatKey = boatKey;

    const detailsText = [row.color, row.detailsLogos, row.stitching, row.quilting]
      .filter(Boolean)
      .join(" · ");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const itemLines = doc.splitTextToSize(row.itemDescription || "-", columns[2].width - 4);
    const detailsLines = doc.splitTextToSize(detailsText || "-", columns[3].width - 4);
    const infoLines = doc.splitTextToSize(row.statusInfo || "-", columns[5].width - 4);

    const maxLines = Math.max(itemLines.length, detailsLines.length, infoLines.length, 1);
    const rowHeight = Math.max(8, maxLines * 4.2 + 3);

    if (y + rowHeight > pageHeight - 16) {
      doc.addPage();
      y = drawHeader();
    }

    let x = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    if (!sameBoatAsPrevious) {
      doc.text(row.boatOrderNumber || "-", x, y + 4.7);
    }
    x += columns[0].width;

    if (!sameBoatAsPrevious) {
      doc.text(row.boatModel || "-", x, y + 4.7);
    }
    x += columns[1].width;

    doc.setFont("helvetica", "normal");
    doc.text(itemLines, x, y + 4.7);
    x += columns[2].width;

    doc.setTextColor(110, 110, 110);
    doc.text(detailsLines, x, y + 4.7);
    doc.setTextColor(0, 0, 0);
    x += columns[3].width;

    const [r, g, b] = statusColor(row.status);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(r, g, b);
    doc.text(statusLabel(row.status), x, y + 4.7);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    x += columns[4].width;

    doc.setTextColor(90, 90, 90);
    doc.text(infoLines, x, y + 4.7);
    doc.setTextColor(0, 0, 0);

    doc.setDrawColor(240);
    doc.setLineWidth(0.15);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    doc.setLineWidth(0.2);

    y += rowHeight + 1;
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`Pagina ${page} di ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: "right",
    });
  }

  return doc;
}

// ============================================================
// PROGRAMMA DI REPARTO (Verniciatura resina, Tubolari, ecc.)
//
// Stessa tabella "da spuntare a mano" di sempre - Prog./N. ordine/
// Modello/Carena + le 3 colonne del reparto (Ragno-Longheroni/
// Coperta/Accessori, oppure Colore tubolare/Tubo/Montaggio per
// Tubolari) + Note. Nessuna colonna "Stato": il reparto non traccia
// piu' stati intermedi, solo se un battello e' ancora qui o e' gia'
// passato al reparto successivo.
//
// Condivisa tra la pagina di reparto e i tasti rapidi della pagina
// principale, cosi' il disegno del PDF vive in un solo posto.
// ============================================================

export type DeptPdfBoat = {
  id: string;
  progressive_no: number | null;
  order_number: string;
  model_boat: string;
  hull: string;
  stringers: string;
  deck: string;
  accessories: string;
  note: string | null;
  requested_delivery_date: string | null;
};

export type DeptPdfStep = {
  current_note: string | null;
} | null;

export type DeptPdfRow = {
  boat: DeptPdfBoat;
  step: DeptPdfStep;
};

export type DeptPdfTubolare = {
  tube_color: string;
  tube_done: boolean;
  tube_mount_done: boolean;
};

export function buildDepartmentProgramPdf(params: {
  departmentName: string;
  isTubolari: boolean;
  rows: DeptPdfRow[];
  tubolariMap: Record<string, DeptPdfTubolare>;
  companyLogo: string;
  operator: string;
}): { doc: jsPDF; filename: string } {
  const { departmentName, isTubolari, rows, tubolariMap, companyLogo, operator } = params;

  if (rows.length === 0) {
    throw new Error("Seleziona almeno un battello prima di generare il PDF.");
  }

  // Ordine di stampa: prima le consegne piu' vicine (chi non ha una data
  // di consegna richiesta va in fondo), poi per progressivo.
  const pdfRows = [...rows].sort((a, b) => {
    const ad = a.boat.requested_delivery_date;
    const bd = b.boat.requested_delivery_date;
    if (ad && bd) {
      if (ad !== bd) return ad < bd ? -1 : 1;
    } else if (ad || bd) {
      return ad ? -1 : 1;
    }
    return (a.boat.progressive_no ?? Infinity) - (b.boat.progressive_no ?? Infinity);
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setProperties({
    title: `Programma reparto ${departmentName}`,
    subject: "Battelli selezionati",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;
  const headerY = 68;
  const bodyStart = 80;
  const bottom = 194;
  const availableHeight = bottom - bodyStart;

  const widths = isTubolari
    ? [16, 26, 75, 58, 40, tableWidth - (16 + 26 + 75 + 58 + 40)]
    : [15, 23, 40, 28, 40, 28, tableWidth - (15 + 23 + 40 + 28 + 40 + 28)];
  const titles = isTubolari
    ? ["Prog.", "N. ordine", "Modello battello", "Colore tubolare", "Tubo", "Montaggio\ntubo"]
    : ["Prog.", "N. ordine", "Modello battello", "Carena", "Ragno/\nLongheroni", "Coperta", "Accessori"];

  let cx = margin;
  const columns = widths.map((w, index) => {
    const col = { x: cx, title: titles[index], w };
    cx += w;
    return col;
  });

  const checkColIndexes = isTubolari ? new Set([4, 5]) : new Set<number>();
  // Reparti "normali" (non Tubolari): stesso trattamento della vecchia stampa
  // generale di produzione - un quadratino accanto al valore di Carena/
  // Ragno-Longheroni/Coperta/Accessori, da spuntare a mano una volta fatto.
  // Non e' uno stato salvato, solo un aiuto visivo su carta.
  const paperCheckboxCols = isTubolari ? new Set<number>() : new Set([3, 4, 5, 6]);

  function rowValues(row: DeptPdfRow) {
    const boat = row.boat;
    const tub = tubolariMap[boat.id];
    return isTubolari
      ? [
          boat.progressive_no !== null ? String(boat.progressive_no) : "-",
          boat.order_number,
          boat.model_boat,
          tub?.tube_color || "-",
          tub?.tube_done ? "1" : "0",
          tub?.tube_mount_done ? "1" : "0",
        ]
      : [
          boat.progressive_no !== null ? String(boat.progressive_no) : "-",
          boat.order_number,
          boat.model_boat,
          boat.hull || "-",
          boat.stringers || "-",
          boat.deck || "-",
          boat.accessories || "-",
        ];
  }

  const image = doc.getImageProperties(companyLogo);
  const logoMaxWidth = 52;
  const logoMaxHeight = 18;
  const logoScale = Math.min(logoMaxWidth / image.width, logoMaxHeight / image.height);
  const logoWidth = image.width * logoScale;
  const logoHeight = image.height * logoScale;

  function measureTotalHeight(scale: number) {
    const pad = BASE_PADDING * scale;
    const lh = BASE_LINE_HEIGHT * scale;
    const reserve = BASE_CHECKBOX_RESERVE * scale;
    const checkboxFloor = BASE_CHECKBOX_SIZE * scale + 2 * scale;
    doc.setFontSize(BASE_FONT_SIZE * scale);
    let total = 0;
    pdfRows.forEach((row) => {
      const values = rowValues(row);
      let maxLines = 1;
      values.forEach((value, index) => {
        if (checkColIndexes.has(index)) return;
        doc.setFont("helvetica", index === 1 ? "bold" : "normal");
        const text = String(value ?? "").trim().replace(/\r\n?/g, "\n");
        const res = paperCheckboxCols.has(index) ? reserve : 0;
        const cellLines = doc.splitTextToSize(text || "-", widths[index] - pad * 2 - res);
        maxLines = Math.max(maxLines, cellLines.length);
      });
      total += Math.max(checkboxFloor, maxLines * lh + pad * 2);
    });
    return total;
  }

  let scale: number;
  if (measureTotalHeight(MAX_SCALE) <= availableHeight) {
    scale = MAX_SCALE;
  } else if (measureTotalHeight(MIN_SCALE) > availableHeight) {
    scale = MIN_SCALE;
  } else {
    let lo = MIN_SCALE;
    let hi = MAX_SCALE;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (measureTotalHeight(mid) <= availableHeight) lo = mid; else hi = mid;
    }
    scale = lo;
  }

  const fontSize = BASE_FONT_SIZE * scale;
  const lineHeight = BASE_LINE_HEIGHT * scale;
  const padding = BASE_PADDING * scale;
  // Stessa formula usata da measureTotalHeight() sopra: se le due divergono,
  // l'auto-fit calcola una scala che poi, in disegno, non basta piu' a
  // stare in una pagina sola (e' quello che succedeva prima di questo fix).
  const checkboxSize = BASE_CHECKBOX_SIZE * scale;
  const minRowHeight = checkboxSize + 2 * scale;
  const baselineOffset = 3.2 * scale;
  const CHECKBOX_RESERVE = BASE_CHECKBOX_RESERVE * scale;
  const checkboxGap = 2 * scale;
  const checkboxRightMargin = 1.5 * scale;

  const today = new Intl.DateTimeFormat("it-IT").format(new Date());

  function header() {
    const logoX = (pageWidth - logoWidth) / 2;
    const logoY = 8;
    doc.addImage(companyLogo, "PNG", logoX, logoY, logoWidth, logoHeight, "dept-logo");

    let cursorY = logoY + logoHeight + 7;
    doc.setTextColor(140, 150, 163);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("PROGRAMMA REPARTO", pageWidth / 2, cursorY, { align: "center" });

    cursorY += 6.5;
    doc.setTextColor(24, 39, 59);
    doc.setFontSize(15);
    doc.text(departmentName.toUpperCase(), pageWidth / 2, cursorY, { align: "center" });

    cursorY = logoY + logoHeight + 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 102, 118);
    doc.text(`Operatore: ${operator || "-"}`, margin, cursorY);
    cursorY += 4.3;
    doc.text(`Data programma: ${today}`, margin, cursorY);
    cursorY += 4.3;
    doc.text(`Battelli in stampa: ${pdfRows.length}`, margin, cursorY);

    doc.setFillColor(244, 246, 248);
    doc.rect(margin, headerY, tableWidth, bodyStart - headerY, "F");
    doc.setFontSize(7.6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(65, 77, 93);
    columns.forEach((col) => {
      const labels = col.title.split("\n");
      const firstBaseline = headerY + (labels.length === 1 ? 7.2 : 5.4);
      labels.forEach((line, lineIndex) =>
        doc.text(line, col.x + padding, firstBaseline + lineIndex * 3.4)
      );
    });

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
  }

  function drawCheckbox(x: number, y: number, size: number, checked: boolean) {
    doc.setDrawColor(90, 100, 115);
    doc.setLineWidth(0.35);
    if (checked) {
      doc.setFillColor(219, 234, 254);
      doc.roundedRect(x, y, size, size, 0.8, 0.8, "FD");
      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.6);
      doc.line(x + size * 0.2, y + size * 0.55, x + size * 0.42, y + size * 0.78);
      doc.line(x + size * 0.42, y + size * 0.78, x + size * 0.82, y + size * 0.22);
    } else {
      doc.roundedRect(x, y, size, size, 0.8, 0.8);
    }
    doc.setLineWidth(0.2);
  }

  header();
  let y = bodyStart;

  pdfRows.forEach((row, rowIndex) => {
    const values = rowValues(row);
    doc.setFontSize(fontSize);
    const lines: string[][] = values.map((value, index) => {
      if (checkColIndexes.has(index)) return [];
      doc.setFont("helvetica", index === 1 ? "bold" : "normal");
      const text = String(value ?? "").trim().replace(/\r\n?/g, "\n");
      const reserve = paperCheckboxCols.has(index) ? CHECKBOX_RESERVE : 0;
      return doc.splitTextToSize(text || "-", widths[index] - padding * 2 - reserve);
    });
    const maxLines = Math.max(1, ...lines.map((cell) => cell.length));
    const rowH = Math.max(minRowHeight, maxLines * lineHeight + padding * 2);

    if (y + rowH > bottom) {
      doc.addPage();
      header();
      y = bodyStart;
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 249, 251);
      doc.rect(margin, y, tableWidth, rowH, "F");
    }

    doc.setTextColor(36, 44, 55);
    doc.setFontSize(fontSize);
    columns.forEach((col, index) => {
      if (checkColIndexes.has(index)) {
        const checked = values[index] === "1";
        const boxY = y + (rowH - checkboxSize) / 2;
        const boxX = col.x + (col.w - checkboxSize) / 2;
        drawCheckbox(boxX, boxY, checkboxSize, checked);
        return;
      }
      doc.setFont("helvetica", index === 1 ? "bold" : "normal");
      lines[index].forEach((line, lineIndex) =>
        doc.text(line, col.x + padding, y + padding + baselineOffset + lineIndex * lineHeight)
      );
      // Quadratino da spuntare a mano, appoggiato subito dopo il valore
      // ("Bianco [ ]" si legge come un'unica cosa) - stesso trattamento
      // della vecchia stampa generale di produzione.
      if (paperCheckboxCols.has(index)) {
        const firstLine = lines[index][0] || "-";
        doc.setFont("helvetica", "normal");
        const textWidth = doc.getTextWidth(firstLine);
        const maxBoxX = col.x + col.w - checkboxSize - checkboxRightMargin;
        const boxX = Math.min(col.x + padding + textWidth + checkboxGap, maxBoxX);
        const boxY = y + (rowH - checkboxSize) / 2;
        doc.setDrawColor(90, 100, 115);
        doc.setLineWidth(0.35);
        doc.roundedRect(boxX, boxY, checkboxSize, checkboxSize, 0.7, 0.7);
        doc.setLineWidth(0.2);
      }
    });

    doc.setDrawColor(160, 169, 182);
    doc.setLineWidth(0.25);
    doc.line(margin, y + rowH, margin + tableWidth, y + rowH);
    doc.setLineWidth(0.2);

    y += rowH;
  });

  const total = doc.getNumberOfPages();
  for (let page = 1; total > 1 && page <= total; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 120, 133);
    doc.text(`Pagina ${page} di ${total}`, pageWidth - margin, 201, { align: "right" });
  }

  const safeName = departmentName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const filename = `Produzione_${safeName}_${pdfRows.length}battelli_${today.replace(/\//g, "-")}.pdf`;

  return { doc, filename };
}

// ============================================================
// ARTICOLI MANCANTI PER BATTELLO (STEP 37)
//
// Elenco, per UN battello, degli articoli richiesti dal suo modello
// (mappa gestita in "Produzione -> Articoli richiesti") che al
// momento risultano senza giacenza. E' un controllo di sola
// lettura su items.stock: non crea richieste, non assegna kit, non
// tocca la giacenza in nessun modo - a differenza del sistema
// parabrezza (STEP 25/29), qui non c'e' nessuno scarico automatico.
// ============================================================

export type MissingArticleRow = {
  itemCode: string;
  itemDescription: string;
  stock: number;
};

export function buildMissingArticlesPdf(params: {
  boatOrderNumber: string;
  boatModel: string;
  boatProgressiveNo: number | null;
  requestedDeliveryDate: string;
  missingItems: MissingArticleRow[];
  logo: string;
  generatedDate: string;
}) {
  const {
    boatOrderNumber,
    boatModel,
    boatProgressiveNo,
    requestedDeliveryDate,
    missingItems,
    logo,
    generatedDate,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setProperties({
    title: `Articoli mancanti - ${boatOrderNumber}`,
    subject: "Articoli mancanti per battello",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;

  const columns = [
    { key: "code", label: "COD. ARTICOLO", width: 42 },
    { key: "description", label: "DESCRIZIONE", width: tableWidth - 42 - 30 },
    { key: "stock", label: "GIACENZA", width: 30 },
  ];

  function drawHeader() {
    drawCompanyLogoTopRight(doc, logo);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("ARTICOLI MANCANTI", margin, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const subtitleParts = [
      boatProgressiveNo ? `Prog. ${boatProgressiveNo}` : null,
      boatOrderNumber,
      boatModel,
    ].filter(Boolean);
    doc.text(subtitleParts.join(" · "), margin, 23);

    doc.setFontSize(9.5);
    doc.setTextColor(120, 120, 120);
    const infoLine = requestedDeliveryDate
      ? `Consegna richiesta ${requestedDeliveryDate} · Generato il ${generatedDate}`
      : `Generato il ${generatedDate}`;
    doc.text(infoLine, margin, 29);
    doc.setTextColor(0, 0, 0);

    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, 33, pageWidth - margin, 33);

    const headingY = 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    let x = margin;
    columns.forEach((column) => {
      doc.text(column.label, x, headingY);
      x += column.width;
    });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(225);
    doc.setLineWidth(0.25);
    doc.line(margin, headingY + 2.5, pageWidth - margin, headingY + 2.5);

    return headingY + 8;
  }

  let y = drawHeader();

  if (missingItems.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(
      "Nessun articolo mancante: tutto quanto richiesto dal modello risulta in giacenza.",
      margin,
      y + 2
    );
    doc.setTextColor(0, 0, 0);
  }

  missingItems.forEach((item) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);

    const descLines = doc.splitTextToSize(item.itemDescription || "-", columns[1].width - 4);
    const rowHeight = Math.max(8, descLines.length * 4.2 + 3);

    if (y + rowHeight > pageHeight - 16) {
      doc.addPage();
      y = drawHeader();
    }

    let x = margin;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(item.itemCode || "-", x, y + 4.7);
    x += columns[0].width;

    doc.text(descLines, x, y + 4.7);
    x += columns[1].width;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(217, 119, 6);
    doc.text(String(item.stock), x, y + 4.7);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");

    doc.setDrawColor(240);
    doc.setLineWidth(0.15);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    doc.setLineWidth(0.2);

    y += rowHeight + 1;
  });

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`Pagina ${page} di ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: "right",
    });
  }

  const safeOrder = boatOrderNumber.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const filename = `Articoli_mancanti_${safeOrder || "battello"}.pdf`;

  return { doc, filename };
}
