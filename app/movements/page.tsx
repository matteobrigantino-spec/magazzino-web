"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { jsPDF } from "jspdf";

type MovementRow = {
  date: string;
  movement: "CARICO" | "SCARICO";
  code: string;
  qty: number;
};

type MissingRow = {
  date: string;
  movement: string;
  code: string;
  qty: number;
};

type InsufficientRow = {
  date: string;
  movement: string;
  code: string;
  qty: number;
  stock: number;
};

type LowStockItem = {
  id: string;
  code: string;
  supplier_code: string | null;
  description: string;
  stock: number;
  supplier_id: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type SaveResult = {
  processed: number;
  missing: number;
  insufficient: number;
  lowStock: number;
};

type MovementBatch = {
  id: string;
  batch_date: string;
  batch_type: "CARICO" | "SCARICO" | "MISTO";
  total_rows: number;
  processed: number;
  missing: number;
  insufficient: number;
  created_at: string;
};

type MovementBatchRow = {
  movement_date: string;
  movement_type: "CARICO" | "SCARICO";
  code: string;
  qty: number;
  result:
    | "PROCESSED"
    | "MISSING"
    | "INSUFFICIENT";
  stock_before: number | null;
  stock_after: number | null;
  created_at: string;
};

type ItemDescription = {
  code: string;
  description: string;
};

function convertDate(value: string) {
  const clean = value.trim();

  const italian = clean.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (italian) {
    const day =
      italian[1].padStart(2, "0");

    const month =
      italian[2].padStart(2, "0");

    const year =
      italian[3];

    return `${year}-${month}-${day}`;
  }

  const iso = clean.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (iso) {
    return clean;
  }

  return null;
}

function displayDate(value: string) {
  if (!value) return "";

  const datePart =
    value.includes("T")
      ? value.split("T")[0]
      : value;

  const parts =
    datePart.split("-");

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function filenameDate(value: string) {
  if (!value) {
    return "";
  }

  const datePart =
    value.includes("T")
      ? value.split("T")[0]
      : value;

  const parts =
    datePart.split("-");

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function currentDateForFilename() {
  const now = new Date();

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const year =
    now.getFullYear();

  return `${year}-${month}-${day}`;
}

function displayTime(value: string) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return new Intl.DateTimeFormat(
    "it-IT",
    {
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function getBatchTitle(
  batchType: string
) {
  if (batchType === "CARICO") {
    return "Carico";
  }

  if (batchType === "SCARICO") {
    return "Scarico";
  }

  return "Movimenti";
}

function getBatchFilename(
  batch: MovementBatch
) {
  return `${getBatchTitle(
    batch.batch_type
  )} ${filenameDate(
    batch.batch_date
  )}.pdf`;
}

export default function MovementsPage() {
  const [pasteText, setPasteText] =
    useState("");

  const [rows, setRows] =
    useState<MovementRow[]>([]);

  const [message, setMessage] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [missingCodes, setMissingCodes] =
    useState<MissingRow[]>([]);

  const [
    insufficientRows,
    setInsufficientRows,
  ] = useState<
    InsufficientRow[]
  >([]);

  const [
    lowStockItems,
    setLowStockItems,
  ] = useState<
    Array<
      LowStockItem & {
        supplier_name: string;
      }
    >
  >([]);

  const [
    saveResult,
    setSaveResult,
  ] =
    useState<SaveResult | null>(
      null
    );

  /*
    ARCHIVIO LOTTI
  */
  const [
    movementBatches,
    setMovementBatches,
  ] =
    useState<MovementBatch[]>(
      []
    );

  const [
    archiveLoading,
    setArchiveLoading,
  ] = useState(true);

  const [
    archiveMessage,
    setArchiveMessage,
  ] = useState("");

  const [
    openingPdfId,
    setOpeningPdfId,
  ] =
    useState<string | null>(
      null
    );

  useEffect(() => {
    loadMovementBatches();
  }, []);

  /*
    RIEPILOGO ANTEPRIMA
  */
  const summary = useMemo(() => {
    const carichi =
      rows.filter(
        (row) =>
          row.movement ===
          "CARICO"
      );

    const scarichi =
      rows.filter(
        (row) =>
          row.movement ===
          "SCARICO"
      );

    const quantitaCarico =
      carichi.reduce(
        (sum, row) =>
          sum + row.qty,
        0
      );

    const quantitaScarico =
      scarichi.reduce(
        (sum, row) =>
          sum + row.qty,
        0
      );

    return {
      total:
        rows.length,

      carichi:
        carichi.length,

      scarichi:
        scarichi.length,

      quantitaTotale:
        quantitaCarico +
        quantitaScarico,
    };
  }, [rows]);

  /*
    CARICA ARCHIVIO
  */
  async function loadMovementBatches() {
    setArchiveLoading(true);
    setArchiveMessage("");

    const {
      data,
      error,
    } = await supabase
      .from("movement_batches")
      .select(
        "id,batch_date,batch_type,total_rows,processed,missing,insufficient,created_at"
      )
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      setArchiveMessage(
        "Errore caricamento archivio: " +
          error.message
      );

      setArchiveLoading(false);
      return;
    }

    const clean: MovementBatch[] =
      (data || []).map(
        (row) => ({
          id:
            String(row.id),

          batch_date:
            String(
              row.batch_date || ""
            ),

          batch_type:
            String(
              row.batch_type ||
                "MISTO"
            ) as
              | "CARICO"
              | "SCARICO"
              | "MISTO",

          total_rows:
            Number(
              row.total_rows || 0
            ),

          processed:
            Number(
              row.processed || 0
            ),

          missing:
            Number(
              row.missing || 0
            ),

          insufficient:
            Number(
              row.insufficient || 0
            ),

          created_at:
            String(
              row.created_at || ""
            ),
        })
      );

    setMovementBatches(
      clean
    );

    setArchiveLoading(false);
  }

  /*
    LETTURA TESTO EXCEL
  */
  function parseText(
    text: string
  ) {
    setMessage("");
    setSaveResult(null);

    const lines = text
      .split(/\r?\n/)
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

    const parsed:
      MovementRow[] = [];

    const errors:
      string[] = [];

    lines.forEach(
      (line, index) => {
        let columns:
          string[];

        if (
          line.includes("\t")
        ) {
          columns =
            line.split("\t");
        } else if (
          line.includes(";")
        ) {
          columns =
            line.split(";");
        } else {
          columns =
            line.split(/\s+/);
        }

        columns =
          columns.map(
            (value) =>
              value.trim()
          );

        if (
          columns.length < 4
        ) {
          errors.push(
            `Riga ${
              index + 1
            }: servono Data, Movimento, Codice e Quantità`
          );

          return;
        }

        const rawDate =
          columns[0];

        const rawMovement =
          columns[1].toUpperCase();

        const rawCode =
          columns[2];

        const rawQty =
          columns[3]
            .replace(
              ",",
              "."
            )
            .trim();

        if (
          rawDate.toLowerCase() ===
            "data" ||
          rawMovement ===
            "MOVIMENTO"
        ) {
          return;
        }

        const date =
          convertDate(
            rawDate
          );

        if (!date) {
          errors.push(
            `Riga ${
              index + 1
            }: data non valida (${rawDate})`
          );

          return;
        }

        if (
          rawMovement !==
            "CARICO" &&
          rawMovement !==
            "SCARICO"
        ) {
          errors.push(
            `Riga ${
              index + 1
            }: usare CARICO oppure SCARICO`
          );

          return;
        }

        if (!rawCode) {
          errors.push(
            `Riga ${
              index + 1
            }: codice mancante`
          );

          return;
        }

        const qty =
          Number(rawQty);

        if (
          !Number.isFinite(
            qty
          ) ||
          qty <= 0
        ) {
          errors.push(
            `Riga ${
              index + 1
            }: quantità non valida`
          );

          return;
        }

        parsed.push({
          date,

          movement:
            rawMovement as
              | "CARICO"
              | "SCARICO",

          code:
            rawCode,

          qty,
        });
      }
    );

    setRows(parsed);

    setMissingCodes([]);
    setInsufficientRows([]);
    setLowStockItems([]);

    if (
      errors.length > 0
    ) {
      setMessage(
        errors.join(" | ")
      );

      return;
    }

    if (
      parsed.length === 0
    ) {
      setMessage(
        "Nessun movimento trovato."
      );

      return;
    }

    setMessage(
      `${parsed.length} movimenti pronti per il salvataggio.`
    );
  }

  function handlePasteChange(
    value: string
  ) {
    setPasteText(value);
    parseText(value);
  }

  function clearAll() {
    setPasteText("");
    setRows([]);
    setMessage("");
    setMissingCodes([]);
    setInsufficientRows([]);
    setLowStockItems([]);
    setSaveResult(null);
  }

  /*
    PDF CODICI INESISTENTI
    REPORT SEPARATO
  */
  function createMissingCodesPdf(
    missing: MissingRow[]
  ) {
    if (
      missing.length === 0
    ) {
      return;
    }

    const pdf =
      new jsPDF();

    pdf.setFontSize(18);

    pdf.text(
      "Codici scanner non esistenti",
      14,
      18
    );

    pdf.setFontSize(10);

    pdf.text(
      `Generato il ${new Date().toLocaleString(
        "it-IT"
      )}`,
      14,
      26
    );

    let y = 38;

    pdf.text(
      "Data",
      14,
      y
    );

    pdf.text(
      "Movimento",
      45,
      y
    );

    pdf.text(
      "Codice scanner",
      85,
      y
    );

    pdf.text(
      "Quantita",
      150,
      y
    );

    y += 6;

    pdf.line(
      14,
      y,
      195,
      y
    );

    y += 7;

    const uniqueRows =
      Array.from(
        new Map(
          missing.map(
            (row) => [
              `${row.code}-${row.movement}-${row.date}`,
              row,
            ]
          )
        ).values()
      );

    uniqueRows.forEach(
      (row) => {
        if (y > 280) {
          pdf.addPage();
          y = 20;
        }

        pdf.text(
          displayDate(
            row.date
          ),
          14,
          y
        );

        pdf.text(
          row.movement,
          45,
          y
        );

        pdf.text(
          row.code,
          85,
          y
        );

        pdf.text(
          String(row.qty),
          150,
          y
        );

        y += 7;
      }
    );

    pdf.save(
      `codici_non_esistenti_${currentDateForFilename()}.pdf`
    );
  }

  /*
    PDF SCORTE BASSE
  */
  function createLowStockPdf(
    items: Array<
      LowStockItem & {
        supplier_name: string;
      }
    >
  ) {
    if (
      items.length === 0
    ) {
      return;
    }

    const pdf =
      new jsPDF({
        orientation:
          "landscape",
      });

    pdf.setFontSize(18);

    pdf.text(
      "Articoli con giacenza minore o uguale a 5",
      14,
      18
    );

    pdf.setFontSize(10);

    pdf.text(
      `Generato il ${new Date().toLocaleString(
        "it-IT"
      )}`,
      14,
      26
    );

    let y = 38;

    pdf.text(
      "Fornitore",
      14,
      y
    );

    pdf.text(
      "Cod. fornitore",
      60,
      y
    );

    pdf.text(
      "Cod. scanner",
      105,
      y
    );

    pdf.text(
      "Descrizione",
      150,
      y
    );

    pdf.text(
      "Giacenza",
      260,
      y
    );

    y += 6;

    pdf.line(
      14,
      y,
      282,
      y
    );

    y += 7;

    items.forEach(
      (item) => {
        if (y > 190) {
          pdf.addPage();
          y = 20;
        }

        const description =
          item.description
            .length > 40
            ? item.description.substring(
                0,
                40
              ) + "..."
            : item.description;

        pdf.text(
          item.supplier_name ||
            "-",
          14,
          y
        );

        pdf.text(
          item.supplier_code ||
            "-",
          60,
          y
        );

        pdf.text(
          item.code ||
            "-",
          105,
          y
        );

        pdf.text(
          description ||
            "-",
          150,
          y
        );

        pdf.text(
          String(
            item.stock ?? 0
          ),
          260,
          y
        );

        y += 7;
      }
    );

    pdf.save(
      `scorte_basse_${currentDateForFilename()}.pdf`
    );
  }

  /*
    SCORTE BASSE
  */
  async function loadLowStockItems() {
    const {
      data: items,
      error: itemError,
    } = await supabase
      .from("items")
      .select(
        "id, code, supplier_code, description, stock, supplier_id"
      )
      .lte("stock", 5)
      .order("stock", {
        ascending: true,
      });

    if (itemError) {
      throw new Error(
        "Errore lettura scorte basse: " +
          itemError.message
      );
    }

    const {
      data: suppliers,
      error:
        supplierError,
    } = await supabase
      .from("suppliers")
      .select("id, name");

    if (
      supplierError
    ) {
      throw new Error(
        "Errore lettura fornitori: " +
          supplierError.message
      );
    }

    const supplierMap =
      new Map<
        string,
        string
      >();

    (
      suppliers as
        | Supplier[]
        | null
    )?.forEach(
      (supplier) => {
        supplierMap.set(
          supplier.id,
          supplier.name
        );
      }
    );

    const result = (
      (items as
        | LowStockItem[]
        | null) || []
    ).map(
      (item) => ({
        ...item,

        supplier_name:
          item.supplier_id
            ? supplierMap.get(
                item.supplier_id
              ) ||
              "Fornitore sconosciuto"
            : "Fornitore sconosciuto",
      })
    );

    setLowStockItems(
      result
    );

    return result;
  }

  /*
    GENERA PDF DI UN LOTTO
  */
  async function generateBatchPdf(
    batchId: string
  ) {
    /*
      TESTATA LOTTO
    */
    const {
      data: batchData,
      error: batchError,
    } = await supabase
      .from(
        "movement_batches"
      )
      .select(
        "id,batch_date,batch_type,total_rows,processed,missing,insufficient,created_at"
      )
      .eq(
        "id",
        batchId
      )
      .single();

    if (
      batchError ||
      !batchData
    ) {
      throw new Error(
        "Impossibile leggere il lotto."
      );
    }

    const batch:
      MovementBatch = {
      id:
        String(
          batchData.id
        ),

      batch_date:
        String(
          batchData.batch_date
        ),

      batch_type:
        String(
          batchData.batch_type
        ) as
          | "CARICO"
          | "SCARICO"
          | "MISTO",

      total_rows:
        Number(
          batchData.total_rows ||
            0
        ),

      processed:
        Number(
          batchData.processed ||
            0
        ),

      missing:
        Number(
          batchData.missing ||
            0
        ),

      insufficient:
        Number(
          batchData.insufficient ||
            0
        ),

      created_at:
        String(
          batchData.created_at ||
            ""
        ),
    };

    /*
      RIGHE LOTTO
    */
    const {
      data: rowsData,
      error: rowsError,
    } = await supabase
      .from(
        "movement_batch_rows"
      )
      .select(
        "movement_date,movement_type,code,qty,result,stock_before,stock_after,created_at"
      )
      .eq(
        "batch_id",
        batchId
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

    if (rowsError) {
      throw new Error(
        "Impossibile leggere le righe del lotto."
      );
    }

    const batchRows:
      MovementBatchRow[] =
      (rowsData || []).map(
        (row) => ({
          movement_date:
            String(
              row.movement_date ||
                ""
            ),

          movement_type:
            String(
              row.movement_type
            ) as
              | "CARICO"
              | "SCARICO",

          code:
            String(
              row.code || ""
            ),

          qty:
            Number(
              row.qty || 0
            ),

          result:
            String(
              row.result
            ) as
              | "PROCESSED"
              | "MISSING"
              | "INSUFFICIENT",

          stock_before:
            row.stock_before ===
            null
              ? null
              : Number(
                  row.stock_before
                ),

          stock_after:
            row.stock_after ===
            null
              ? null
              : Number(
                  row.stock_after
                ),

          created_at:
            String(
              row.created_at ||
                ""
            ),
        })
      );

    /*
      DESCRIZIONI ARTICOLI
    */
    const codes =
      Array.from(
        new Set(
          batchRows
            .map(
              (row) =>
                row.code
            )
            .filter(Boolean)
        )
      );

    const descriptionMap =
      new Map<
        string,
        string
      >();

    if (
      codes.length > 0
    ) {
      const {
        data: itemData,
        error: itemError,
      } = await supabase
        .from("items")
        .select(
          "code,description"
        )
        .in(
          "code",
          codes
        );

      if (!itemError) {
        (
          itemData as
            | ItemDescription[]
            | null
        )?.forEach(
          (item) => {
            descriptionMap.set(
              item.code,
              item.description
            );
          }
        );
      }
    }

    /*
      CREAZIONE PDF
    */
    const pdf =
      new jsPDF({
        orientation:
          "landscape",
        unit: "mm",
        format: "a4",
      });

    const pageWidth =
      pdf.internal.pageSize.getWidth();

    const pageHeight =
      pdf.internal.pageSize.getHeight();

    const marginLeft = 10;
    const marginRight = 10;

    const tableWidth =
      pageWidth -
      marginLeft -
      marginRight;

    /*
      COLONNE
    */
    const widths = {
      date: 27,
      movement: 31,
      code: 39,
      description: 91,
      qty: 20,
      result: 39,
      missing: 30,
    };

    let y = 12;

    function drawPdfHeader() {
      pdf.setFont(
        "helvetica",
        "bold"
      );

      pdf.setFontSize(18);

      pdf.text(
        `${getBatchTitle(
          batch.batch_type
        )} ${displayDate(
          batch.batch_date
        )}`,
        marginLeft,
        y
      );

      y += 7;

      pdf.setFont(
        "helvetica",
        "normal"
      );

      pdf.setFontSize(9);

      pdf.text(
        `Righe: ${batch.total_rows}   Eseguite: ${batch.processed}   Codici non trovati: ${batch.missing}   Scarichi bloccati: ${batch.insufficient}`,
        marginLeft,
        y
      );

      y += 5;

      pdf.text(
        `Lotto registrato: ${displayDate(
          batch.batch_date
        )} - ${displayTime(
          batch.created_at
        )}`,
        marginLeft,
        y
      );

      y += 5;

      pdf.setDrawColor(
        170
      );

      pdf.line(
        marginLeft,
        y,
        pageWidth -
          marginRight,
        y
      );

      y += 5;

      /*
        INTESTAZIONE TABELLA
      */
      pdf.setFillColor(
        235,
        235,
        235
      );

      pdf.rect(
        marginLeft,
        y,
        tableWidth,
        10,
        "F"
      );

      pdf.setFont(
        "helvetica",
        "bold"
      );

      pdf.setFontSize(7.5);

      let x =
        marginLeft;

      pdf.text(
        "Data",
        x + 2,
        y + 6
      );

      x += widths.date;

      pdf.text(
        "Movimento",
        x + 2,
        y + 6
      );

      x +=
        widths.movement;

      pdf.text(
        "Codice scanner",
        x + 2,
        y + 6
      );

      x += widths.code;

      pdf.text(
        "Descrizione",
        x + 2,
        y + 6
      );

      x +=
        widths.description;

      pdf.text(
        "Qta",
        x +
          widths.qty -
          2,
        y + 6,
        {
          align: "right",
        }
      );

      x += widths.qty;

      pdf.text(
        "Esito",
        x + 2,
        y + 6
      );

      x +=
        widths.result;

      pdf.text(
        [
          "Codice",
          "non trovato",
        ],
        x +
          widths.missing /
            2,
        y + 4,
        {
          align: "center",
        }
      );

      y += 10;
    }

    drawPdfHeader();

    /*
      RIGHE
    */
    batchRows.forEach(
      (row) => {
        const isMissing =
          row.result ===
          "MISSING";

        const description =
          isMissing
            ? "Codice non trovato"
            : descriptionMap.get(
                row.code
              ) || "-";

        const descriptionLines =
          pdf.splitTextToSize(
            description,
            widths.description -
              4
          ) as string[];

        const rowHeight =
          Math.max(
            8,
            descriptionLines.length *
              4 +
              2
          );

        if (
          y + rowHeight >
          pageHeight - 12
        ) {
          pdf.addPage();
          y = 12;

          drawPdfHeader();
        }

        let x =
          marginLeft;

        pdf.setFont(
          "helvetica",
          "normal"
        );

        pdf.setFontSize(8);

        pdf.text(
          displayDate(
            row.movement_date
          ),
          x + 2,
          y + 5
        );

        x += widths.date;

        pdf.text(
          row.movement_type,
          x + 2,
          y + 5
        );

        x +=
          widths.movement;

        pdf.text(
          row.code,
          x + 2,
          y + 5
        );

        x += widths.code;

        pdf.text(
          descriptionLines,
          x + 2,
          y + 5
        );

        x +=
          widths.description;

        pdf.text(
          String(row.qty),
          x +
            widths.qty -
            2,
          y + 5,
          {
            align: "right",
          }
        );

        x += widths.qty;

        let resultLabel =
          "ESEGUITO";

        if (
          row.result ===
          "INSUFFICIENT"
        ) {
          resultLabel =
            "BLOCCATO";
        }

        if (
          row.result ===
          "MISSING"
        ) {
          resultLabel = "-";
        }

        pdf.text(
          resultLabel,
          x + 2,
          y + 5
        );

        x +=
          widths.result;

        /*
          PALLINO PIENO SOLO
          PER CODICI NON TROVATI
        */
        if (isMissing) {
          pdf.circle(
            x +
              widths.missing /
                2,
            y +
              rowHeight /
                2,
            1.6,
            "F"
          );
        }

        pdf.setDrawColor(
          225
        );

        pdf.line(
          marginLeft,
          y + rowHeight,
          pageWidth -
            marginRight,
          y + rowHeight
        );

        y += rowHeight;
      }
    );

    /*
      NOME PDF
    */
    pdf.save(
      getBatchFilename(
        batch
      )
    );
  }

  /*
    PULSANTE PDF ARCHIVIO
  */
  async function downloadBatchPdf(
    batchId: string
  ) {
    setOpeningPdfId(
      batchId
    );

    setArchiveMessage("");

    try {
      await generateBatchPdf(
        batchId
      );
    } catch (error) {
      if (
        error instanceof Error
      ) {
        setArchiveMessage(
          error.message
        );
      } else {
        setArchiveMessage(
          "Errore generazione PDF."
        );
      }
    } finally {
      setOpeningPdfId(
        null
      );
    }
  }

  /*
    SALVATAGGIO MOVIMENTI
  */
  async function saveMovements() {
    if (
      rows.length === 0
    ) {
      setMessage(
        "Non ci sono movimenti da salvare."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Confermi il salvataggio di ${rows.length} movimenti?`
      );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage("");
    setSaveResult(null);

    try {
      const payload =
        rows.map(
          (row) => ({
            movement_date:
              row.date,

            movement_type:
              row.movement,

            code:
              row.code.trim(),

            qty:
              row.qty,
          })
        );

      const {
        data,
        error,
      } = await supabase.rpc(
        "process_warehouse_movements",
        {
          p_rows:
            payload,
        }
      );

      if (error) {
        setMessage(
          "ERRORE: " +
            error.message
        );

        return;
      }

      const result =
        data as {
          batch_id?: string;
          batch_date?: string;
          batch_type?: string;

          processed?: number;

          missing?:
            MissingRow[];

          insufficient?:
            InsufficientRow[];
        };

      const missing =
        result?.missing ||
        [];

      const insufficient =
        result?.insufficient ||
        [];

      setMissingCodes(
        missing
      );

      setInsufficientRows(
        insufficient
      );

      const lowStock =
        await loadLowStockItems();

      /*
        IL REPORT SEPARATO
        DEI CODICI INESISTENTI
        RESTA DISPONIBILE,
        MA NON LO SCARICHIAMO
        PIÙ AUTOMATICAMENTE.

        ORA SONO GIÀ PRESENTI
        NEL PDF PRINCIPALE DEL LOTTO.
      */

      if (
        lowStock.length > 0
      ) {
        setTimeout(
          () => {
            createLowStockPdf(
              lowStock
            );
          },
          500
        );
      }

      setSaveResult({
        processed:
          result?.processed ||
          0,

        missing:
          missing.length,

        insufficient:
          insufficient.length,

        lowStock:
          lowStock.length,
      });

      let pdfWarning =
        "";

      /*
        PDF AUTOMATICO
        DEL LOTTO APPENA SALVATO
      */
      if (
        result?.batch_id
      ) {
        try {
          await generateBatchPdf(
            result.batch_id
          );
        } catch (error) {
          console.error(
            "Errore PDF lotto:",
            error
          );

          pdfWarning =
            " Il movimento è stato salvato, ma il PDF automatico non è stato generato.";
        }
      }

      /*
        AGGIORNA ARCHIVIO
      */
      await loadMovementBatches();

      setMessage(
        `${
          result?.processed ||
          0
        } movimenti elaborati correttamente.${pdfWarning}`
      );

      setPasteText("");
      setRows([]);
    } catch (error) {
      if (
        error instanceof Error
      ) {
        setMessage(
          error.message
        );
      } else {
        setMessage(
          "Errore durante il salvataggio."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1500,
        margin: "0 auto",
      }}
    >
      {/* HEADER */}

      <div
        style={{
          marginBottom: 26,
        }}
      >
        <div
          style={{
            fontSize: 13,
            opacity: 0.55,
            marginBottom: 4,
            textTransform:
              "uppercase",
            letterSpacing: 1.2,
            fontWeight: 700,
          }}
        >
          Magazzino
        </div>

        <h1
          style={{
            fontSize: 34,
            fontWeight: 800,
            margin: 0,
            letterSpacing:
              "-0.5px",
          }}
        >
          Movimenti
        </h1>

        <div
          style={{
            marginTop: 6,
            opacity: 0.6,
            fontSize: 14,
          }}
        >
          Incolla i movimenti da Excel e aggiorna automaticamente le giacenze.
        </div>
      </div>

      {/* CARDS */}

      <div
        style={{
          display: "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(210px, 1fr))",

          gap: 14,
          marginBottom: 24,
        }}
      >
        <SummaryCard
          title="Movimenti pronti"
          value={String(
            summary.total
          )}
          subtitle="Righe pronte al salvataggio"
        />

        <SummaryCard
          title="Carichi"
          value={String(
            summary.carichi
          )}
          subtitle="Movimenti di entrata"
          tone="success"
        />

        <SummaryCard
          title="Scarichi"
          value={String(
            summary.scarichi
          )}
          subtitle="Movimenti di uscita"
          tone="danger"
        />

        <SummaryCard
          title="Quantità totale"
          value={String(
            summary.quantitaTotale
          )}
          subtitle="Pezzi presenti nei movimenti"
        />
      </div>

      {/* AREA EXCEL */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",

          background:
            "var(--card)",

          borderRadius: 12,

          padding: 20,

          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",

            justifyContent:
              "space-between",

            alignItems:
              "flex-start",

            gap: 16,

            flexWrap:
              "wrap",

            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 17,
              }}
            >
              Incolla da Excel
            </div>

            <div
              style={{
                fontSize: 13,
                opacity: 0.6,
                marginTop: 4,
              }}
            >
              Ordine colonne: Data · Movimento · Codice scanner · Quantità
            </div>
          </div>

          <div
            style={{
              fontSize: 12,

              opacity: 0.55,

              padding:
                "6px 10px",

              border:
                "1px solid var(--border-color)",

              borderRadius: 20,

              whiteSpace:
                "nowrap",
            }}
          >
            CTRL + C da Excel → CTRL + V qui
          </div>
        </div>

        <textarea
          value={
            pasteText
          }

          onChange={(e) =>
            handlePasteChange(
              e.target.value
            )
          }

          placeholder={
            "03/09/2026\tCARICO\t010101\t12\n03/09/2026\tSCARICO\t020202\t3"
          }

          style={{
            width: "100%",

            minHeight: 170,

            padding: 15,

            resize:
              "vertical",

            boxSizing:
              "border-box",

            background:
              "var(--input-bg)",

            color:
              "var(--foreground)",

            border:
              "1px solid var(--border-color)",

            borderRadius: 9,

            fontFamily:
              "monospace",

            fontSize: 14,

            lineHeight: 1.6,

            outline: "none",
          }}
        />

        <div
          style={{
            display: "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap: 12,

            flexWrap:
              "wrap",

            marginTop: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap:
                "wrap",
            }}
          >
            <button
              type="button"

              onClick={() =>
                parseText(
                  pasteText
                )
              }

              style={
                secondaryButton
              }
            >
              Controlla dati
            </button>

            <button
              type="button"
              onClick={
                clearAll
              }
              style={
                secondaryButton
              }
            >
              Pulisci
            </button>
          </div>

          <button
            type="button"

            onClick={
              saveMovements
            }

            disabled={
              saving ||
              rows.length === 0
            }

            style={{
              padding:
                "12px 20px",

              border:
                "1px solid var(--foreground)",

              borderRadius: 8,

              background:
                rows.length === 0
                  ? "var(--card-2)"
                  : "var(--foreground)",

              color:
                rows.length === 0
                  ? "var(--foreground)"
                  : "var(--background)",

              cursor:
                saving ||
                rows.length === 0
                  ? "not-allowed"
                  : "pointer",

              opacity:
                saving ||
                rows.length === 0
                  ? 0.45
                  : 1,

              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {saving
              ? "Salvataggio..."
              : `Salva movimenti (${rows.length})`}
          </button>
        </div>
      </div>

      {/* MESSAGGIO */}

      {message && (
        <div
          style={{
            border:
              message.startsWith(
                "ERRORE"
              )
                ? "1px solid rgba(239,68,68,0.5)"
                : "1px solid var(--border-color)",

            borderRadius: 10,

            padding:
              "12px 14px",

            marginBottom: 18,

            background:
              message.startsWith(
                "ERRORE"
              )
                ? "rgba(239,68,68,0.08)"
                : "var(--card)",

            fontSize: 14,
          }}
        >
          {message}
        </div>
      )}

      {/* RISULTATO */}

      {saveResult && (
        <div
          style={{
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,

              opacity: 0.55,

              textTransform:
                "uppercase",

              letterSpacing: 0.8,

              fontWeight: 700,

              marginBottom: 10,
            }}
          >
            Risultato ultimo salvataggio
          </div>

          <div
            style={{
              display: "grid",

              gridTemplateColumns:
                "repeat(auto-fit, minmax(200px, 1fr))",

              gap: 12,
            }}
          >
            <ResultCard
              title="Eseguiti"
              value={
                saveResult.processed
              }
              tone="success"
            />

            <ResultCard
              title="Codici inesistenti"
              value={
                saveResult.missing
              }
              tone={
                saveResult.missing >
                0
                  ? "danger"
                  : "normal"
              }
            />

            <ResultCard
              title="Scarichi bloccati"
              value={
                saveResult.insufficient
              }
              tone={
                saveResult.insufficient >
                0
                  ? "danger"
                  : "normal"
              }
            />

            <ResultCard
              title="Giacenza ≤ 5"
              value={
                saveResult.lowStock
              }
              tone={
                saveResult.lowStock >
                0
                  ? "warning"
                  : "normal"
              }
            />
          </div>
        </div>
      )}

      {/* REPORT */}

      {(missingCodes.length >
        0 ||
        lowStockItems.length >
          0) && (
        <div
          style={{
            display: "flex",

            gap: 10,

            flexWrap:
              "wrap",

            padding: 14,

            marginBottom: 20,

            background:
              "var(--card)",

            border:
              "1px solid var(--border-color)",

            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: "100%",

              fontSize: 13,

              opacity: 0.6,

              marginBottom: 2,
            }}
          >
            Report disponibili
          </div>

          {missingCodes.length >
            0 && (
            <button
              type="button"

              onClick={() =>
                createMissingCodesPdf(
                  missingCodes
                )
              }

              style={
                secondaryButton
              }
            >
              PDF codici inesistenti
            </button>
          )}

          {lowStockItems.length >
            0 && (
            <button
              type="button"

              onClick={() =>
                createLowStockPdf(
                  lowStockItems
                )
              }

              style={
                secondaryButton
              }
            >
              PDF scorte ≤ 5
            </button>
          )}
        </div>
      )}

      {/* ARCHIVIO MOVIMENTI */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",

          borderRadius: 12,

          overflow: "hidden",

          background:
            "var(--card)",

          marginBottom: 20,
        }}
      >
        <div
          style={{
            padding:
              "15px 18px",

            display: "flex",

            justifyContent:
              "space-between",

            gap: 12,

            alignItems:
              "center",

            background:
              "var(--table-head)",

            borderBottom:
              "1px solid var(--border-color)",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 17,
              }}
            >
              Archivio movimenti
            </div>

            <div
              style={{
                marginTop: 2,

                fontSize: 12,

                opacity: 0.55,
              }}
            >
              Tutti i lotti salvati e i relativi PDF
            </div>
          </div>

          <button
            type="button"
            onClick={
              loadMovementBatches
            }
            style={
              secondaryButton
            }
          >
            Aggiorna
          </button>
        </div>

        {archiveMessage && (
          <div
            style={{
              padding:
                "12px 16px",

              borderBottom:
                "1px solid var(--border-color)",

              color:
                "#ef4444",

              fontSize: 13,
            }}
          >
            {archiveMessage}
          </div>
        )}

        <div
          style={{
            overflowX:
              "auto",
          }}
        >
          <table
            style={{
              width: "100%",

              minWidth: 850,

              borderCollapse:
                "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={headerStyle}>
                  Data
                </th>

                <th style={headerStyle}>
                  Ora
                </th>

                <th style={headerStyle}>
                  Tipo
                </th>

                <th style={headerRightStyle}>
                  Righe
                </th>

                <th style={headerRightStyle}>
                  Eseguite
                </th>

                <th style={headerRightStyle}>
                  Codici non trovati
                </th>

                <th style={headerRightStyle}>
                  Scarichi bloccati
                </th>

                <th style={headerStyle}>
                  PDF
                </th>
              </tr>
            </thead>

            <tbody>
              {archiveLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    style={
                      emptyStyle
                    }
                  >
                    Caricamento archivio...
                  </td>
                </tr>
              ) : movementBatches.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={
                      emptyStyle
                    }
                  >
                    Nessun lotto presente nell&apos;archivio.
                  </td>
                </tr>
              ) : (
                movementBatches.map(
                  (batch) => (
                    <tr
                      key={
                        batch.id
                      }
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",
                      }}
                    >
                      <td
                        style={
                          cellStyle
                        }
                      >
                        <strong>
                          {displayDate(
                            batch.batch_date
                          )}
                        </strong>
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        {displayTime(
                          batch.created_at
                        )}
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        <BatchBadge
                          type={
                            batch.batch_type
                          }
                        />
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        {
                          batch.total_rows
                        }
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        {
                          batch.processed
                        }
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        <strong
                          style={{
                            color:
                              batch.missing >
                              0
                                ? "#ef4444"
                                : "inherit",
                          }}
                        >
                          {
                            batch.missing
                          }
                        </strong>
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        <strong
                          style={{
                            color:
                              batch.insufficient >
                              0
                                ? "#f59e0b"
                                : "inherit",
                          }}
                        >
                          {
                            batch.insufficient
                          }
                        </strong>
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        <button
                          type="button"

                          disabled={
                            openingPdfId ===
                            batch.id
                          }

                          onClick={() =>
                            downloadBatchPdf(
                              batch.id
                            )
                          }

                          style={
                            secondaryButton
                          }
                        >
                          {openingPdfId ===
                          batch.id
                            ? "Generazione..."
                            : getBatchFilename(
                                batch
                              )}
                        </button>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ANTEPRIMA */}

      <div
        style={{
          border:
            "1px solid var(--border-color)",

          borderRadius: 12,

          overflow:
            "hidden",

          background:
            "var(--card)",
        }}
      >
        <div
          style={{
            padding:
              "15px 18px",

            display: "flex",

            justifyContent:
              "space-between",

            gap: 12,

            alignItems:
              "center",

            background:
              "var(--table-head)",

            borderBottom:
              "1px solid var(--border-color)",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 800,
              }}
            >
              Anteprima movimenti
            </div>

            <div
              style={{
                marginTop: 2,

                fontSize: 12,

                opacity: 0.55,
              }}
            >
              Controlla i dati prima del salvataggio
            </div>
          </div>

          <span
            style={{
              minWidth: 30,

              padding:
                "5px 9px",

              textAlign:
                "center",

              borderRadius: 20,

              background:
                "var(--input-bg)",

              border:
                "1px solid var(--border-color)",

              fontWeight: 800,

              fontSize: 13,
            }}
          >
            {rows.length}
          </span>
        </div>

        <div
          style={{
            overflowX:
              "auto",
          }}
        >
          <table
            style={{
              width: "100%",

              borderCollapse:
                "collapse",

              minWidth: 760,
            }}
          >
            <thead>
              <tr>
                <th style={headerStyle}>
                  Data
                </th>

                <th style={headerStyle}>
                  Movimento
                </th>

                <th style={headerStyle}>
                  Codice scanner
                </th>

                <th style={headerRightStyle}>
                  Quantità
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={
                      emptyStyle
                    }
                  >
                    Incolla i movimenti da Excel per visualizzare l&apos;anteprima.
                  </td>
                </tr>
              ) : (
                rows.map(
                  (
                    row,
                    index
                  ) => (
                    <tr
                      key={`${row.code}-${index}`}
                      style={{
                        borderBottom:
                          "1px solid var(--border-color)",
                      }}
                    >
                      <td
                        style={
                          cellStyle
                        }
                      >
                        {displayDate(
                          row.date
                        )}
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        <MovementBadge
                          movement={
                            row.movement
                          }
                        />
                      </td>

                      <td
                        style={
                          cellStyle
                        }
                      >
                        <span
                          style={{
                            display:
                              "inline-block",

                            fontFamily:
                              "monospace",

                            padding:
                              "4px 7px",

                            borderRadius: 5,

                            border:
                              "1px solid var(--border-color)",

                            background:
                              "var(--input-bg)",

                            fontSize: 13,
                          }}
                        >
                          {row.code}
                        </span>
                      </td>

                      <td
                        style={
                          rightCellStyle
                        }
                      >
                        <strong>
                          {row.qty}
                        </strong>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* COMPONENTI */

function SummaryCard({
  title,
  value,
  subtitle,
  tone = "normal",
}: {
  title: string;
  value: string;
  subtitle: string;
  tone?:
    | "normal"
    | "success"
    | "danger";
}) {
  let background =
    "var(--card)";

  let border =
    "1px solid var(--border-color)";

  if (
    tone === "success"
  ) {
    background =
      "rgba(34,197,94,0.07)";

    border =
      "1px solid rgba(34,197,94,0.25)";
  }

  if (
    tone === "danger"
  ) {
    background =
      "rgba(239,68,68,0.07)";

    border =
      "1px solid rgba(239,68,68,0.25)";
  }

  return (
    <div
      style={{
        padding: 18,
        border,
        borderRadius: 12,
        background,
      }}
    >
      <div
        style={{
          fontSize: 12,

          textTransform:
            "uppercase",

          letterSpacing: 0.8,

          fontWeight: 700,

          opacity: 0.55,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 27,
          fontWeight: 850,
          marginTop: 7,
        }}
      >
        {value}
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.55,
          marginTop: 4,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

function ResultCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;

  tone:
    | "normal"
    | "success"
    | "danger"
    | "warning";
}) {
  let background =
    "var(--card)";

  let border =
    "1px solid var(--border-color)";

  if (
    tone === "success"
  ) {
    background =
      "rgba(34,197,94,0.08)";

    border =
      "1px solid rgba(34,197,94,0.30)";
  }

  if (
    tone === "danger"
  ) {
    background =
      "rgba(239,68,68,0.08)";

    border =
      "1px solid rgba(239,68,68,0.30)";
  }

  if (
    tone === "warning"
  ) {
    background =
      "rgba(245,158,11,0.08)";

    border =
      "1px solid rgba(245,158,11,0.30)";
  }

  return (
    <div
      style={{
        padding: 14,

        background,

        border,

        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,

          opacity: 0.55,

          textTransform:
            "uppercase",

          fontWeight: 700,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 24,

          fontWeight: 850,

          marginTop: 5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MovementBadge({
  movement,
}: {
  movement:
    | "CARICO"
    | "SCARICO";
}) {
  const isCarico =
    movement === "CARICO";

  return (
    <span
      style={{
        display:
          "inline-block",

        padding:
          "5px 10px",

        borderRadius: 20,

        background:
          isCarico
            ? "rgba(34,197,94,0.14)"
            : "rgba(239,68,68,0.14)",

        border:
          isCarico
            ? "1px solid rgba(34,197,94,0.30)"
            : "1px solid rgba(239,68,68,0.30)",

        fontSize: 12,

        fontWeight: 850,
      }}
    >
      {movement}
    </span>
  );
}

function BatchBadge({
  type,
}: {
  type:
    | "CARICO"
    | "SCARICO"
    | "MISTO";
}) {
  if (
    type === "CARICO"
  ) {
    return (
      <span
        style={{
          ...batchBadgeStyle,

          background:
            "rgba(34,197,94,0.12)",

          border:
            "1px solid rgba(34,197,94,0.30)",
        }}
      >
        CARICO
      </span>
    );
  }

  if (
    type === "SCARICO"
  ) {
    return (
      <span
        style={{
          ...batchBadgeStyle,

          background:
            "rgba(239,68,68,0.12)",

          border:
            "1px solid rgba(239,68,68,0.30)",
        }}
      >
        SCARICO
      </span>
    );
  }

  return (
    <span
      style={{
        ...batchBadgeStyle,

        background:
          "rgba(59,130,246,0.12)",

        border:
          "1px solid rgba(59,130,246,0.30)",
      }}
    >
      MISTO
    </span>
  );
}

/* STILI */

const secondaryButton = {
  padding:
    "10px 15px",

  border:
    "1px solid var(--border-color)",

  borderRadius: 8,

  background:
    "var(--input-bg)",

  color:
    "var(--foreground)",

  cursor: "pointer",

  fontWeight: 700,
};

const headerStyle = {
  padding:
    "13px 16px",

  textAlign:
    "left" as const,

  fontSize: 12,

  textTransform:
    "uppercase" as const,

  letterSpacing: 0.5,

  opacity: 0.65,

  background:
    "var(--table-head)",

  borderBottom:
    "1px solid var(--border-color)",

  whiteSpace:
    "nowrap" as const,
};

const headerRightStyle = {
  ...headerStyle,

  textAlign:
    "right" as const,
};

const cellStyle = {
  padding:
    "12px 16px",

  fontSize: 14,
};

const rightCellStyle = {
  ...cellStyle,

  textAlign:
    "right" as const,
};

const emptyStyle = {
  padding: 42,

  textAlign:
    "center" as const,

  opacity: 0.5,
};

const batchBadgeStyle = {
  display:
    "inline-block",

  padding:
    "5px 9px",

  borderRadius: 20,

  fontSize: 11,

  fontWeight: 850,
};