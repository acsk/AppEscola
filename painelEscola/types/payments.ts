export type PaymentProvider = {
  slug: string;
  name: string;
  logo_url?: string | null;
  status: "active" | "inactive" | string;
  capabilities: string[];
};

export type PaymentProviderSchemaField = {
  name: string;
  type: "text" | "select" | "file" | string;
  required: boolean;
  options?: string[];
  label?: string;
  placeholder?: string;
};

export type PaymentProviderSchema = {
  provider: string;
  fields: PaymentProviderSchemaField[];
  configured?: boolean;
  environments?: {
    stage?: boolean;
    prod?: boolean;
  };
};

export type PaymentConnectionTestResult = {
  ok: boolean;
  provider_status?: string;
  expires_in?: number;
  environment?: string;
};

export type CoraEnvironmentSettings = {
  environment: string | null;
  client_id: string | null;
  configured: boolean;
  configured_at: string | null;
  cert_uploaded: boolean;
  key_uploaded: boolean;
  test_account_main_cpf?: string | null;
  test_account_main_password?: string | null;
  test_account_secondary_cpf?: string | null;
  test_account_secondary_password?: string | null;
};

export type CoraSettingsResponse = {
  tenant_id: number;
  cora: {
    stage: CoraEnvironmentSettings;
    prod: CoraEnvironmentSettings;
  };
};

export type GenerateChargePayload = {
  provider: string;
  method: string;
  environment?: "stage" | "prod";
};

export type GeneratedCharge = {
  invoice_id: number;
  provider: string;
  environment?: string;
  method?: string;
  charge_id: string;
  status: string;
  payment_url: string | null;
  pix_copy_paste: string | null;
  boleto_number?: string | null;
  boleto_digitable?: string | null;
  qr_code_image_url: string | null;
  expires_at: string | null;
  raw?: Record<string, unknown>;
};

export type ChargeStatusResponse = {
  provider: string;
  status: string;
  paid_at: string | null;
  raw?: Record<string, unknown>;
};

export type PayChargePayload = {
  environment?: "stage" | "prod";
};

export type PaidChargeResponse = {
  invoice_id: number;
  provider: string;
  environment?: string;
  status: string;
  paid_at: string | null;
  raw?: Record<string, unknown>;
};

export type InvoicePaymentAssets = {
  charge_id?: string | null;
  charge_status?: string | null;
  boleto_number?: string | null;
  boleto_digitable?: string | null;
  boleto_url?: string | null;
  pix_copy_paste?: string | null;
  pix_qr_image_url?: string | null;
  last_synced_at?: string | null;
};

export type InvoicePaymentOptionsResponse = {
  invoice: {
    id: number;
    description: string;
    amount: string;
    due_date: string | null;
    status: string;
    payment_method: string | null;
  };
  allowed_methods: string[];
  current_method: string | null;
  actions: {
    can_generate_charge: boolean;
    can_change_method: boolean;
    can_open_boleto_url?: boolean;
    can_copy_boleto_line?: boolean;
    can_copy_pix_code?: boolean;
  };
  method_lock: {
    locked: boolean;
    method: string | null;
    reason: string | null;
  };
  payment_assets: InvoicePaymentAssets;
};

export type InvoiceReceiptSchool = {
  name: string;
  corporate_name: string | null;
  cnpj: string;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  address: string | null;
};

export type InvoiceReceiptStudent = {
  name: string;
  document: string;
  email: string | null;
  phone: string | null;
};

export type InvoiceReceiptPayer = {
  name: string;
  document: string;
  is_guardian: boolean;
  guardian_name: string | null;
};

export type InvoiceReceiptEnrollment = {
  id: number;
  enrollment_number: string;
  school_class: string;
  start_date: string;
  end_date: string | null;
} | null;

export type InvoiceReceiptInvoice = {
  id: number;
  description: string;
  type: string;
  amount: string;
  amount_raw: number;
  due_date: string;
  paid_at: string;
  paid_at_date: string;
  paid_at_time: string;
  payment_method: string;
  payment_method_slug: string;
  cora_charge_id: string | null;
  notes: string | null;
};

export type InvoiceReceiptResponse = {
  receipt_number: string;
  receipt_hash: string;
  issued_at: string;
  school: InvoiceReceiptSchool;
  student: InvoiceReceiptStudent;
  payer: InvoiceReceiptPayer;
  enrollment: InvoiceReceiptEnrollment;
  invoice: InvoiceReceiptInvoice;
  verification: {
    message: string;
    verify_hash: string;
  };
};
