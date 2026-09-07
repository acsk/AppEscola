import JSZip from "jszip";
import jsPDF from "jspdf";

/**
 * Garante um PDF único a partir do carnê da API (PDF já mesclado ou ZIP com um PDF por parcela).
 * Evita pdf-lib: no Metro/Expo web ele quebra com tslib (__extends undefined).
 */
export async function ensureSingleBoletoPdf(options: {
  blob: Blob;
  format: "pdf" | "zip";
  filename: string;
  studentName?: string | null;
}): Promise<{ blob: Blob; filename: string; format: "pdf" }> {
  const pdfFilename = toTodosOsBoletosPdfFilename(options.filename, options.studentName);

  if (options.format === "pdf") {
    return { blob: options.blob, filename: pdfFilename, format: "pdf" };
  }

  if (typeof document === "undefined") {
    throw new Error("Unificação de boletos em PDF único disponível apenas no navegador.");
  }

  const zip = await JSZip.loadAsync(options.blob);
  const pdfNames = Object.keys(zip.files)
    .filter((name) => {
      const entry = zip.files[name];
      return !!entry && !entry.dir && /\.pdf$/i.test(name);
    })
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

  if (pdfNames.length === 0) {
    throw new Error("O arquivo ZIP não contém PDFs de boleto para unificar.");
  }

  const pdfjs = await loadPdfjs();
  let out: jsPDF | null = null;

  for (const name of pdfNames) {
    const bytes = await zip.files[name].async("uint8array");
    out = await appendPdfBytes(out, bytes, pdfjs);
  }

  if (!out) {
    throw new Error("Não foi possível montar o PDF único dos boletos.");
  }

  const ab = out.output("arraybuffer");
  return {
    blob: new Blob([ab], { type: "application/pdf" }),
    filename: pdfFilename,
    format: "pdf",
  };
}

async function loadPdfjs(): Promise<{
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfJsDocument> };
  GlobalWorkerOptions: { workerSrc: string };
  version: string;
}> {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  return pdfjs as any;
}

type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
  }>;
};

async function appendPdfBytes(
  doc: jsPDF | null,
  bytes: Uint8Array,
  pdfjs: Awaited<ReturnType<typeof loadPdfjs>>
): Promise<jsPDF> {
  // Cópia própria: pdf.js pode transferir o buffer.
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);

  const pdf = await pdfjs.getDocument({ data }).promise;
  let out = doc;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const widthMm = (base.width / 72) * 25.4;
    const heightMm = (base.height / 72) * 25.4;
    const orientation = widthMm > heightMm ? "landscape" : "portrait";

    const renderScale = 2;
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas indisponível para unificar os boletos.");
    }

    await page.render({ canvasContext: ctx, viewport }).promise;
    const img = canvas.toDataURL("image/jpeg", 0.95);

    if (!out) {
      out = new jsPDF({
        orientation,
        unit: "mm",
        format: [widthMm, heightMm],
        compress: true,
      });
    } else {
      out.addPage([widthMm, heightMm], orientation);
    }

    out.addImage(img, "JPEG", 0, 0, widthMm, heightMm);
  }

  return out!;
}

export function toTodosOsBoletosPdfFilename(
  filename?: string | null,
  studentName?: string | null
): string {
  const fromHeader = /^todos_os_boletos_(.+)\.(pdf|zip)$/i.exec((filename || "").trim());
  if (fromHeader?.[1]) {
    return `todos_os_boletos_${fromHeader[1]}.pdf`;
  }

  const slug = slugifyStudentName(studentName || "aluno");
  return `todos_os_boletos_${slug}.pdf`;
}

export function slugifyStudentName(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "aluno"
  );
}
