import type { jsPDF } from "jspdf";
import { supabase } from "./supabaseClient";

/*
  LOGO AZIENDALE - CONDIVISO SU TUTTI I PDF DEL SITO

  Riusa lo stesso logo caricato in "Produzione -> Configurazioni"
  (tabella production_settings, colonna pdf_logo), gia' usato dal
  PDF "Programma di produzione". Qui viene solo riletto e disegnato
  anche sugli altri PDF (ordini, magazzino, report, consegne, ecc.),
  in alto a destra, senza toccare il resto del layout di ciascuno.

  Se il logo non e' ancora stato caricato, i PDF vengono comunque
  generati come prima, senza logo: questa funzione non blocca mai
  la generazione.
*/

let cachedLogo: string | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export async function fetchCompanyLogo(): Promise<string> {
  const now = Date.now();

  if (cachedLogo !== null && now - cachedAt < CACHE_MS) {
    return cachedLogo;
  }

  try {
    const { data, error } = await supabase
      .from("production_settings")
      .select("pdf_logo")
      .eq("id", 1)
      .maybeSingle();

    const logo = !error && data?.pdf_logo ? String(data.pdf_logo) : "";
    cachedLogo = logo;
    cachedAt = now;
    return logo;
  } catch {
    return "";
  }
}

/*
  Disegna il logo in alto a destra della pagina corrente, dentro il
  riquadro maxWidth x maxHeight (proporzioni mantenute). Non fa
  nulla se logo e' vuoto (nessun logo caricato) o se il disegno
  fallisce per qualsiasi motivo: il PDF continua comunque.
*/
export function drawCompanyLogoTopRight(
  doc: jsPDF,
  logo: string,
  opts?: { top?: number; right?: number; maxWidth?: number; maxHeight?: number }
): void {
  if (!logo) return;

  try {
    const top = opts?.top ?? 8;
    const right = opts?.right ?? 10;
    const maxWidth = opts?.maxWidth ?? 30;
    const maxHeight = opts?.maxHeight ?? 14;

    const pageWidth = doc.internal.pageSize.getWidth();
    const image = doc.getImageProperties(logo);
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = pageWidth - right - width;

    doc.addImage(logo, "PNG", x, top, width, height);
  } catch {
    // Un logo che non si riesce a disegnare non deve mai bloccare il PDF.
  }
}

/*
  Disegna il logo in alto a sinistra, dentro un riquadro alto
  maxHeight (proporzioni mantenute). Usato dal PDF ordine fornitore
  (stile "lettera intestata"), che vuole il logo a sinistra invece
  che a destra come gli altri PDF del sito. Restituisce la larghezza
  disegnata (0 se il logo manca o il disegno fallisce), utile per
  posizionare il testo che segue.
*/
export function drawCompanyLogoTopLeft(
  doc: jsPDF,
  logo: string,
  opts?: { top?: number; left?: number; maxHeight?: number }
): number {
  if (!logo) return 0;

  try {
    const top = opts?.top ?? 16;
    const left = opts?.left ?? 18;
    const maxHeight = opts?.maxHeight ?? 13;

    const image = doc.getImageProperties(logo);
    const scale = maxHeight / image.height;
    const width = image.width * scale;
    const height = image.height * scale;

    doc.addImage(logo, "PNG", left, top, width, height);

    return width;
  } catch {
    return 0;
  }
}
