import type { Tone } from "../../../constants/theme";
import type { CoraEventStage, CoraWebhookEventItem } from "../../../services/coraIntegration";

/** "Recebido" ≠ "pagamento confirmado": o aviso só confirma depois da consulta na Cora. */
export const CORA_STAGE_LABEL: Record<CoraEventStage, string> = {
  waiting: "Aguardando confirmação",
  confirmed: "Pagamento confirmado",
  cancelled: "Cancelamento confirmado",
  received: "Recebido",
  ignored: "Ignorado",
  review: "Revisão",
  failed: "Falha",
};

export const CORA_STAGE_TONE: Record<CoraEventStage, Tone> = {
  waiting: "brand",
  confirmed: "success",
  cancelled: "neutral",
  received: "neutral",
  ignored: "neutral",
  review: "warning",
  failed: "danger",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  "invoice.paid": "Cobrança paga",
  "invoice.created": "Cobrança criada",
  "invoice.canceled": "Cobrança cancelada",
  "invoice.cancelled": "Cobrança cancelada",
  "invoice.overdue": "Cobrança vencida",
  "invoice.open": "Cobrança em aberto",
};

export const coraEventTypeLabel = (type: string) => EVENT_TYPE_LABEL[type] ?? type;

const RESULT_DETAIL: Record<string, string> = {
  unknown_invoice: "Nenhuma cobrança do sistema com este ID da Cora.",
  ambiguous_invoice: "Mais de uma cobrança com este ID da Cora; nada foi baixado.",
  environment_mismatch: "Aviso de um ambiente e cobrança de outro; nada foi baixado.",
  unsupported_event: "Tipo de aviso não tratado pelo sistema.",
};

export function coraEventDetail(item: CoraWebhookEventItem): string {
  const retried = item.last_retried_by
    ? ` Reprocessado por ${item.last_retried_by.name} em ${fmtDateTime(item.last_retried_at)}.`
    : "";
  return stageDetail(item) + retried;
}

function stageDetail(item: CoraWebhookEventItem): string {
  switch (item.stage) {
    case "waiting":
      return item.attempts > 0 && item.next_attempt_at
        ? `Consulta à Cora falhou; nova tentativa ${fmtDateTime(item.next_attempt_at)}.`
        : "Consultando a cobrança na Cora.";
    case "confirmed":
      return `Cora confirmou o pagamento${item.processed_at ? ` · ${fmtDateTime(item.processed_at)}` : ""}.`;
    case "cancelled":
      return "Cora confirmou o cancelamento.";
    case "received":
      return "Consultado na Cora: nenhuma mudança na cobrança.";
    case "review":
    case "ignored":
      return RESULT_DETAIL[item.result ?? ""] ?? "Verifique o aviso.";
    case "failed":
      return `Sem resposta da Cora após ${item.attempts} tentativas.${item.last_error ? ` ${item.last_error}` : ""}`;
    default:
      return "";
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
