import api from "./api";

export type FinanceRole = "super_admin" | "admin" | "manager" | "financial" | "secretaria" | "coordenador" | "professor";

export type FinanceSettings = {
  environment: "prod" | "stage";
  operating_since: string | null;
  statement: {
    last_sync: { status: string; finished_at: string | null; error: string | null } | null;
    /** Só quando a própria Cora informou o saldo no extrato. */
    bank_balance: { amount: string; synced_at: string | null } | null;
  };
  billing: {
    default_payment_due_day: number | null;
    default_provider: string | null;
    enabled_methods: string[];
    default_method: string | null;
    auto_sync_charges: boolean;
  };
  late_fees: { configured: boolean };
  reconciliation_rules: { key: string; label: string; description: string }[];
  routines: { key: string; label: string; schedule: string }[];
  permissions: { ability: string; label: string; roles: Record<FinanceRole, boolean> }[];
  can_configure: boolean;
};

export async function fetchFinanceSettings(): Promise<FinanceSettings> {
  const { data } = await api.get("/finance/settings");
  return data.body ?? data;
}
