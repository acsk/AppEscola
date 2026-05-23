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
  excluded_count?: number;
  archive_format?: "pdf" | "zip";
  archive_format_hint?: string;
  invoices: CarnePreviewInvoice[];
  excluded_invoices?: CarneExcludedInvoice[];
};

export async function fetchCarnePreview(
  enrollmentId: number,
  invoiceIds?: number[]
): Promise<CarnePreview> {
  const params: Record<string, unknown> = {};
  if (invoiceIds?.length) {
    params.invoice_ids = invoiceIds;
  }
  const { data } = await api.get(`/enrollments/${enrollmentId}/carne/preview`, { params });
  const body = (data as ApiEnvelope<CarnePreview>).body ?? data;
  return body as CarnePreview;
}

export async function generateCarneArchive(
  enrollmentId: number,
  options?: { environment?: string; invoiceIds?: number[] }
): Promise<{
  blob: Blob;
  filename: string;
  format: "pdf" | "zip";
  generatedCount: number;
  errorCount: number;
}> {
  const payload: Record<string, unknown> = {};
  if (options?.environment) payload.environment = options.environment;
  if (options?.invoiceIds?.length) payload.invoice_ids = options.invoiceIds;

  const response = await api.post(`/enrollments/${enrollmentId}/carne/generate`, payload, {
    responseType: "blob",
  });

  const disposition = response.headers["content-disposition"] ?? "";
  const match = /filename="?([^";\n]+)"?/i.exec(disposition);
  const formatHeader = String(response.headers["x-carne-format"] ?? "").toLowerCase();
  const format: "pdf" | "zip" =
    formatHeader === "zip" || formatHeader === "pdf"
      ? formatHeader
      : match?.[1]?.toLowerCase().endsWith(".zip")
        ? "zip"
        : "pdf";

  const filename =
    match?.[1]?.trim() ||
    `carne-matricula-${enrollmentId}.${format === "zip" ? "zip" : "pdf"}`;

  const generatedCount = Number(response.headers["x-carne-generated-count"] ?? 0);
  const errorCount = Number(response.headers["x-carne-error-count"] ?? 0);

  return {
    blob: response.data as Blob,
    filename,
    format,
    generatedCount,
    errorCount,
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
