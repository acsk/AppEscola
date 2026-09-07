import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

/**
 * Garante um PDF único a partir do carnê da API (PDF já mesclado ou ZIP com um PDF por parcela).
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

  const merged = await PDFDocument.create();

  for (const name of pdfNames) {
    const bytes = await zip.files[name].async("uint8array");
    const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  const output = await merged.save();
  const ab = new ArrayBuffer(output.byteLength);
  new Uint8Array(ab).set(output);

  return {
    blob: new Blob([ab], { type: "application/pdf" }),
    filename: pdfFilename,
    format: "pdf",
  };
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
