/** Região recortada de uma página do PDF, em frações (0–1) do tamanho da página. */
export type PdfCropRegion = { page: number; x: number; y: number; width: number; height: number };

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Lado maior da imagem recriada e limite de escala (~576 DPI), dentro do limite de canvas dos navegadores. */
const TARGET_LONG_SIDE = 2400;
const MAX_SCALE = 8;

// pdf.js (via react-pdf) é carregado sob demanda: só quem abre a revisão baixa o leitor.
async function openPdf(file: File) {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return { pdfjs, doc };
}

export type LoadedPdf = Awaited<ReturnType<typeof openPdf>>;

/** Um documento por arquivo: o preview e a recriação do recorte compartilham o mesmo PDF aberto. */
const docs = new WeakMap<File, Promise<LoadedPdf>>();

export function loadPdf(file: File) {
  let loading = docs.get(file);
  if (!loading) {
    loading = openPdf(file);
    loading.catch(() => docs.delete(file));
    docs.set(file, loading);
  }
  return loading;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Recria o recorte a partir do conteúdo vetorial do PDF (não amplia os pixels do preview):
 * renderiza só a região, em escala alta. PNG mantém texto e traços nítidos; acima do limite de upload vira JPEG.
 */
export async function renderPdfRegion(file: File, region: PdfCropRegion): Promise<File> {
  const { doc } = await loadPdf(file);
  const page = await doc.getPage(region.page);
  const base = page.getViewport({ scale: 1 });
  const longSide = Math.max(region.width * base.width, region.height * base.height);
  const scale = Math.min(MAX_SCALE, TARGET_LONG_SIDE / Math.max(1, longSide));
  const viewport = page.getViewport({
    scale,
    offsetX: -region.x * base.width * scale,
    offsetY: -region.y * base.height * scale,
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(region.width * base.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * base.height * scale));
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas } as never).promise;

  const name = `recorte-pagina-${region.page}-hd`;
  const png = await toBlob(canvas, "image/png");
  if (png && png.size <= MAX_UPLOAD_BYTES) return new File([png], `${name}.png`, { type: "image/png" });
  const jpeg = await toBlob(canvas, "image/jpeg", 0.92);
  if (!jpeg) throw new Error("Não foi possível gerar a imagem.");
  return new File([jpeg], `${name}.jpg`, { type: "image/jpeg" });
}
