import api from "./api";

type ApiEnvelope<T> = {
  type?: string;
  message?: string;
  body?: T;
};

export type CarnePreviewInvoice = {
  invoice_id: number;
  description: string;
  due_date: string | null;
  amount: string;
  status: string;
  has_boleto: boolean;
  carne_ready?: boolean;
  needs_boleto_issue?: boolean;
  needs_pdf_sync?: boolean;
  cora_charge_id: string | null;
};

export type CarneExcludedInvoice = {
  invoice_id: number;
  description: string;
  due_date: string | null;
  amount: string;
  status: string;
  payment_method: string | null;
  charge_method: string | null;
  cora_charge_id: string | null;
  reason_code: string;
  reason_label: string;
};

export type CarnePreview = {
  enrollment_id: number;
  enrollment_number: string | null;
  student_name: string | null;
  total_invoices?: number;
  eligible_count: number;
  ready_for_bundle_count?: number;
  excluded_count?: number;
  archive_format?: "pdf" | "zip";
  archive_format_hint?: string;
  invoices: CarnePreviewInvoice[];
  excluded_invoices?: CarneExcludedInvoice[];
};

export async function fetchCarnePreview(
  enrollmentId: number,
  options?: { invoiceIds?: number[]; environment?: string }
): Promise<CarnePreview> {
  const params: Record<string, unknown> = {};
  if (options?.invoiceIds?.length) {
    params.invoice_ids = options.invoiceIds;
  }
  if (options?.environment) {
    params.environment = options.environment;
  }
  const { data } = await api.get(`/enrollments/${enrollmentId}/carne/preview`, { params });
  const body = (data as ApiEnvelope<CarnePreview>).body ?? data;
  return body as CarnePreview;
}

function headerValue(headers: Record<string, unknown>, name: string): string {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const raw = key ? headers[key] : "";
  return String(raw ?? "");
}

async function sniffArchiveFormat(blob: Blob): Promise<"pdf" | "zip"> {
  const prefix = await blob.slice(0, 4).text();
  if (prefix.startsWith("PK")) return "zip";
  if (prefix.startsWith("%PDF")) return "pdf";
  return "pdf";
}

async function assertCarneBlobIsArchive(blob: Blob): Promise<"pdf" | "zip"> {
  const prefix = await blob.slice(0, 12).text();

  if (prefix.trimStart().startsWith("{") || prefix.includes('"type"')) {
    let message = "Falha ao gerar carnê.";
    try {
      const json = JSON.parse(await blob.text());
      message = json?.message || json?.body?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (prefix.startsWith("PK")) {
    if (blob.size < 100) {
      throw new Error("O ZIP do carnê está vazio.");
    }
    return "zip";
  }

  if (prefix.startsWith("%PDF")) {
    if (blob.size < 200) {
      throw new Error("O PDF do carnê está vazio (nenhum boleto incluído).");
    }
    return "pdf";
  }

  throw new Error("Resposta inválida ao gerar carnê (arquivo não é PDF nem ZIP).");
}

export type CarneGenerateErrorRow = {
  invoice_id?: number;
  description?: string;
  message?: string;
};

export async function generateCarneArchive(
  enrollmentId: number,
  options?: {
    environment?: string;
    invoiceIds?: number[];
    issueMissing?: boolean;
    requireAll?: boolean;
  }
): Promise<{
  blob: Blob;
  filename: string;
  format: "pdf" | "zip";
  generatedCount: number;
  errorCount: number;
  errors: CarneGenerateErrorRow[];
}> {
  const payload: Record<string, unknown> = {};
  if (options?.environment) payload.environment = options.environment;
  if (options?.invoiceIds?.length) payload.invoice_ids = options.invoiceIds;
  if (options?.issueMissing) payload.issue_missing = true;
  if (options?.requireAll === false) payload.require_all = false;

  const response = await api.post(`/enrollments/${enrollmentId}/carne/generate`, payload, {
    responseType: "blob",
  });

  const blob = response.data as Blob;
  const headers = response.headers as Record<string, unknown>;

  const disposition = headerValue(headers, "content-disposition");
  const match = /filename="?([^";\n]+)"?/i.exec(disposition);

  let formatHeader = headerValue(headers, "x-carne-format").toLowerCase();
  if (formatHeader !== "zip" && formatHeader !== "pdf") {
    formatHeader = "";
  }

  const format: "pdf" | "zip" =
    formatHeader === "zip" || formatHeader === "pdf"
      ? formatHeader
      : match?.[1]?.toLowerCase().endsWith(".zip")
        ? "zip"
        : await sniffArchiveFormat(blob);

  await assertCarneBlobIsArchive(blob);

  const filename =
    match?.[1]?.trim() ||
    `carne-matricula-${enrollmentId}.${format === "zip" ? "zip" : "pdf"}`;

  let generatedCount = Number(headerValue(headers, "x-carne-generated-count") || 0);
  let errorCount = Number(headerValue(headers, "x-carne-error-count") || 0);

  let errors: CarneGenerateErrorRow[] = [];
  const errorsHeader = headerValue(headers, "x-carne-errors");
  if (errorsHeader) {
    try {
      errors = JSON.parse(atob(errorsHeader)) as CarneGenerateErrorRow[];
    } catch {
      errors = [];
    }
  }

  if (generatedCount === 0) {
    throw new Error(
      "Nenhum boleto foi incluído no carnê. Verifique as cobranças selecionadas ou tente gerar a cobrança individual antes."
    );
  }

  return {
    blob,
    filename,
    format,
    generatedCount,
    errorCount,
    errors,
  };
}

/** @deprecated use generateCarneArchive */
export const generateCarnePdf = generateCarneArchive;

export function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
