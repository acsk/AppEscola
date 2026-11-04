import api from "./api";

/** Etapa do aviso: só vira "confirmed" depois que a consulta na Cora confirmou o pagamento. */
export type CoraEventStage = "waiting" | "confirmed" | "cancelled" | "received" | "ignored" | "review" | "failed";

export type CoraEnvironmentStatus = {
  credentials: { configured: boolean; active: boolean; configured_at: string | null };
  webhook: { registered: boolean; trigger: string | null; registered_at: string | null; last_event_at: string | null };
};

export type CoraIntegrationOverview = {
  environments: { stage: CoraEnvironmentStatus; prod: CoraEnvironmentStatus };
  last_received_at: string | null;
  last_processed_at: string | null;
  counts: { waiting: number; review: number; failed: number; processed: number; duplicates: number; anomalies: number };
  oldest_waiting_at: string | null;
  permissions: string[];
};

export type CoraWebhookEventItem = {
  id: number;
  event_id: string;
  event_type: string;
  resource_id: string;
  environment: string;
  status: string;
  result: string | null;
  stage: CoraEventStage;
  can_retry: boolean;
  attempts: number;
  duplicates: number;
  anomaly: string | null;
  last_error: string | null;
  received_at: string | null;
  processed_at: string | null;
  next_attempt_at: string | null;
  manual_retries: number;
  last_retried_at: string | null;
  last_retried_by: { id: number; name: string } | null;
  invoice: {
    id: number;
    description: string | null;
    amount: string;
    due_date: string | null;
    status: string;
    paid_at: string | null;
    student: { id: number; name: string } | null;
  } | null;
};

export type CoraEventsPage = {
  items: CoraWebhookEventItem[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
};

export type CoraEventsFilters = {
  stage?: CoraEventStage | "";
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  per_page?: number;
};

export type CoraConsultResult = {
  outcome: "paid" | "cancelled" | "unchanged";
  environment: string;
  invoice: { id: number; status: string; paid_at: string | null; cora_status: string | null; cora_last_synced_at: string | null };
};

const clean = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export async function fetchCoraIntegrationOverview(): Promise<CoraIntegrationOverview> {
  const { data } = await api.get("/finance/cora/overview");
  return data.body ?? data;
}

export async function fetchCoraWebhookEvents(filters: CoraEventsFilters): Promise<CoraEventsPage> {
  const { data } = await api.get("/finance/cora/events", { params: clean(filters) });
  return data.body ?? data;
}

export async function retryCoraWebhookEvent(eventId: number): Promise<{ event: CoraWebhookEventItem; message: string }> {
  const { data } = await api.post(`/finance/cora/events/${eventId}/retry`);
  return { event: data.body, message: data.message };
}

export async function consultCoraInvoice(invoiceId: number): Promise<{ result: CoraConsultResult; message: string }> {
  const { data } = await api.post(`/finance/cora/invoices/${invoiceId}/consult`);
  return { result: data.body, message: data.message };
}
