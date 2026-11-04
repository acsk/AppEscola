import { paymentMethodLabel } from "../../utils/paymentMethods";
import type { InvoiceAuditEntry } from "../../services/invoices";

export const AUDIT_ACTION_LABEL: Record<InvoiceAuditEntry["action"], string> = {
  created: "Cobrança criada",
  updated: "Cobrança alterada",
  paid: "Pagamento registrado",
  cancelled: "Cobrança cancelada",
  charge_generated: "Cobrança emitida na Cora",
  deleted: "Cobrança excluída",
  restored: "Cobrança restaurada",
};

const FIELD_LABEL: Record<string, string> = {
  student_id: "Aluno",
  guardian_id: "Responsável",
  enrollment_id: "Matrícula",
  type: "Tipo",
  description: "Descrição",
  amount: "Valor",
  due_date: "Vencimento",
  status: "Situação",
  paid_at: "Pago em",
  payment_method: "Forma de pagamento",
  payment_reference: "Identificador do pagamento",
  notes: "Observações",
  cora_charge_id: "Cobrança Cora",
  cora_status: "Situação na Cora",
};

const STATUS_LABEL: Record<string, string> = { pending: "Em aberto", overdue: "Vencida", paid: "Paga", cancelled: "Cancelada" };

/** Na criação, só os campos que identificam a cobrança (o resto aparece em Detalhes). */
const CREATED_FIELDS = ["description", "amount", "due_date", "status"];

const formatValue = (field: string, value: string | number | null) => {
  if (value === null || value === "") return "—";
  if (field === "amount") return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (field === "due_date") {
    const [y, m, d] = String(value).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  if (field === "paid_at") return new Date(String(value)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  if (field === "status") return STATUS_LABEL[String(value)] ?? String(value);
  if (field === "payment_method") return paymentMethodLabel(String(value));
  if (field.endsWith("_id") && field !== "cora_charge_id") return `#${value}`;
  return String(value);
};

/** Linhas "Campo: antes → depois" (na criação, só "Campo: valor"). */
export function auditChangeLines(entry: InvoiceAuditEntry): string[] {
  const fields = Object.keys(entry.changes ?? {}).filter((f) => entry.action !== "created" || CREATED_FIELDS.includes(f));
  return fields.map((field) => {
    const { from, to } = entry.changes[field];
    const label = FIELD_LABEL[field] ?? field;
    return entry.action === "created" ? `${label}: ${formatValue(field, to)}` : `${label}: ${formatValue(field, from)} → ${formatValue(field, to)}`;
  });
}

/** Quem fez: usuário (e se foi em acesso de suporte), sincronização/comando ou webhook. */
export function auditAuthor(entry: InvoiceAuditEntry): string {
  if (entry.source === "webhook") return "Webhook do provedor de pagamento";
  if (entry.source === "system" || !entry.user) return "Sistema (sincronização ou rotina automática)";
  return entry.support_access ? `${entry.user.name} · acesso de suporte` : entry.user.name;
}
