/**
 * In-browser OCR engine (replaces the server-side Tesseract pipeline).
 *
 * - PDFs: try the embedded text layer first (pdf.js). If it yields real text,
 *   that's used directly (confidence ~99). Otherwise each page is rasterized to
 *   a canvas and run through Tesseract.
 * - Images: Tesseract directly.
 *
 * Then a heuristic parser pulls the header fields + line items the review form
 * binds to. Heavy libs are dynamically imported so they don't bloat the
 * initial bundle — they load the first time a user runs OCR.
 */

export interface OcrResult {
  text: string;
  confidence: number; // 0..100
}

export interface ParsedLine {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export interface ParsedInvoice {
  invoiceNumber: string | null;
  supplier: string | null;
  poNumber: string | null;
  invoiceDate: string | null;
  currency: string;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  documentType: 'INVOICE' | 'CFDI';
  language: string;
  cfdiDetected: boolean;
  lineItems: ParsedLine[];
}

// ─── Tesseract ──────────────────────────────────────────────────────────────
async function recognizeImageSource(source: Blob | HTMLCanvasElement): Promise<OcrResult> {
  const { default: Tesseract } = await import('tesseract.js');
  const { data } = await Tesseract.recognize(source as Parameters<typeof Tesseract.recognize>[0], 'eng');
  return {
    text: (data.text ?? '').trim(),
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
  };
}

// ─── pdf.js ────────────────────────────────────────────────────────────────
async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  // Vite-friendly worker URL.
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  return pdfjs;
}

async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  try {
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map((i) => ('str' in i ? (i as { str: string }).str : '')).join(' ') + '\n';
    }
    return text.trim();
  } catch {
    return '';
  }
}

async function ocrPdfByRaster(buf: ArrayBuffer): Promise<OcrResult> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  let combined = '';
  let confSum = 0;
  let pages = 0;
  const maxPages = Math.min(pdf.numPages, 5); // cap work for very long docs
  for (let p = 1; p <= maxPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const res = await recognizeImageSource(canvas);
    combined += res.text + '\n';
    confSum += res.confidence;
    pages += 1;
  }
  return { text: combined.trim(), confidence: pages ? confSum / pages : 0 };
}

export async function runOcr(file: File): Promise<OcrResult> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const buf = await file.arrayBuffer();
    const textLayer = await extractPdfText(buf);
    if (textLayer && textLayer.replace(/\s/g, '').length > 50) {
      return { text: textLayer, confidence: 99 };
    }
    try {
      return await ocrPdfByRaster(buf);
    } catch {
      return { text: textLayer, confidence: textLayer ? 60 : 0 };
    }
  }
  return recognizeImageSource(file);
}

// ─── Parser ───────────────────────────────────────────────────────────────────
function parseAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}\b)/g, '');
  const normalized = cleaned.replace(/,/g, '.');
  // If multiple dots remain (e.g. 1.234.56), keep the last as decimal sep.
  const parts = normalized.split('.');
  const value = parts.length > 2 ? parts.slice(0, -1).join('') + '.' + parts.at(-1) : normalized;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const AMOUNT = '([$€]?\\s*[\\d.,]+)';

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

const CFDI_KEYWORDS = /\b(factura|cfdi|emisor|receptor|rfc|uuid|folio fiscal|sello)\b/i;
const SPANISH_KEYWORDS = /\b(factura|importe|cantidad|precio|subtotal|impuesto|iva|total|proveedor)\b/i;

export function parseInvoiceFields(text: string): ParsedInvoice {
  const t = text.replace(/\r/g, '');
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);

  const cfdiDetected = CFDI_KEYWORDS.test(t);
  const isSpanish = SPANISH_KEYWORDS.test(t) && /\b(iva|rfc|factura|proveedor)\b/i.test(t);

  const invoiceNumber = firstMatch(t, [
    /invoice\s*(?:no\.?|number|#|num\.?)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9/-]{2,})/i,
    /factura\s*(?:no\.?|n[uú]m\.?|#)?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9/-]{2,})/i,
    /\binv[-\s#]?([A-Za-z0-9]{3,})/i,
  ]);

  const poNumber = firstMatch(t, [
    /\b(?:p\.?\s*o\.?|purchase\s*order|orden\s*de\s*compra)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{2,})/i,
    /\bPO[-\s]?(\d{3,})/i,
  ]);

  const invoiceDate = firstMatch(t, [
    /(?:invoice\s*date|date|fecha)\s*[:#]?\s*(\d{4}-\d{2}-\d{2})/i,
    /(?:invoice\s*date|date|fecha)\s*[:#]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/i,
    /\b(\d{4}-\d{2}-\d{2})\b/,
  ]);

  const totalAmount = parseAmount(
    firstMatch(t, [
      new RegExp(`(?:grand\\s*total|total\\s*due|amount\\s*due|total\\s*a\\s*pagar|total)\\s*[:#]?\\s*${AMOUNT}`, 'i'),
    ]),
  );
  const subtotal = parseAmount(
    firstMatch(t, [new RegExp(`(?:sub\\s*total|subtotal)\\s*[:#]?\\s*${AMOUNT}`, 'i')]),
  );
  const taxAmount = parseAmount(
    firstMatch(t, [new RegExp(`(?:tax|vat|iva|impuesto)\\s*[:#]?\\s*${AMOUNT}`, 'i')]),
  );

  let currency = 'USD';
  if (/\bMXN\b|\bpesos?\b/i.test(t) || cfdiDetected) currency = 'MXN';
  else if (/\bCAD\b/i.test(t)) currency = 'CAD';
  else if (/\bEUR\b|€/i.test(t)) currency = 'EUR';
  else if (/\bUSD\b|\$/i.test(t)) currency = 'USD';

  // Supplier: first reasonably-long line that isn't a label/number.
  const supplier =
    lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 60 &&
        /[A-Za-z]/.test(l) &&
        !/invoice|factura|tax|total|date|fecha|page|p\.?o\.?/i.test(l),
    ) ?? null;

  return {
    invoiceNumber,
    supplier,
    poNumber,
    invoiceDate: normalizeDate(invoiceDate),
    currency,
    subtotal,
    taxAmount,
    totalAmount,
    documentType: cfdiDetected ? 'CFDI' : 'INVOICE',
    language: isSpanish ? 'es' : 'en',
    cfdiDetected,
    lineItems: parseLineItems(lines),
  };
}

function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(raw);
  if (m) {
    const [, a, b, c] = m;
    const year = c.length === 2 ? `20${c}` : c;
    return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Best-effort: rows ending with 2-3 numbers are treated as line items. */
function parseLineItems(lines: string[]): ParsedLine[] {
  const out: ParsedLine[] = [];
  const re = /^(.*?)\s+(\d+(?:[.,]\d+)?)\s+([$€]?[\d.,]+)\s+([$€]?[\d.,]+)\s*$/;
  for (const line of lines) {
    const m = re.exec(line);
    if (m && /[A-Za-z]/.test(m[1])) {
      out.push({
        description: m[1].trim(),
        quantity: parseAmount(m[2]),
        unitPrice: parseAmount(m[3]),
        amount: parseAmount(m[4]),
      });
    }
    if (out.length >= 25) break;
  }
  return out;
}
