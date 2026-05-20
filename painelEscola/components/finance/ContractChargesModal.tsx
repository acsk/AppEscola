import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import {
  applyContractCharges,
  fetchContractChargesPreview,
  type ContractChargesPreview,
} from "../../services/enrollmentContractCharges";

type Props = {
  visible: boolean;
  enrollmentId: number;
  environment: "stage" | "prod";
  onClose: () => void;
  onSuccess: (message: string) => void;
};

function fmtMoney(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v + "T00:00:00").toLocaleDateString("pt-BR");
}

function RowCheckbox({
  checked,
  disabled,
}: {
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <View className="p-1">
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={20}
        color={disabled ? "#D1D5DB" : checked ? "#7C3AED" : "#9CA3AF"}
      />
    </View>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4 items-center">
      <View className="w-9 h-9 rounded-full bg-white border border-gray-100 items-center justify-center mb-2">
        <Ionicons name={icon} size={18} color="#9CA3AF" />
      </View>
      <Text className="text-sm font-semibold text-gray-700">{title}</Text>
      <Text className="text-xs text-gray-500 text-center mt-1">{description}</Text>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between gap-3 mb-2">
      <View className="flex-1">
        <Text className="text-sm font-bold text-gray-900">{title}</Text>
        {subtitle ? <Text className="text-xs text-gray-500 mt-0.5">{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function Pill({
  label,
  tone = "gray",
}: {
  label: string;
  tone?: "gray" | "emerald" | "violet" | "amber";
}) {
  const styles = {
    gray: { bg: "bg-gray-100", text: "text-gray-700" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700" },
    violet: { bg: "bg-violet-50", text: "text-violet-700" },
    amber: { bg: "bg-amber-50", text: "text-amber-800" },
  };

  return (
    <View className={`rounded-full px-2 py-0.5 ${styles[tone].bg}`}>
      <Text className={`text-[11px] font-semibold ${styles[tone].text}`}>{label}</Text>
    </View>
  );
}

const LINK_STATUS_LABELS: Record<string, string> = {
  new: "Importar",
  linked: "Já vinculada",
  updatable: "Atualizar local",
};

export default function ContractChargesModal({
  visible,
  enrollmentId,
  environment,
  onClose,
  onSuccess,
}: Props) {
  const [preview, setPreview] = useState<ContractChargesPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [invoiceTypes, setInvoiceTypes] = useState<string[]>(["monthly"]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContractChargesPreview(enrollmentId, {
        environment,
        invoice_types: invoiceTypes,
      });
      setPreview(data);

      const defaults = new Set<string>();
      data.to_generate
        .filter((row) => row.selected_by_default && !row.disabled && !row.already_exists)
        .forEach((row) => defaults.add(row.key));
      data.external_charges
        .filter((row) => row.selected_by_default && row.link_status !== "linked")
        .forEach((row) => defaults.add(row.key));
      setSelectedKeys(defaults);
    } catch (e: any) {
      setPreview(null);
      setError(e?.response?.data?.message ?? e?.message ?? "Não foi possível carregar a análise.");
    }
    setLoading(false);
  }, [enrollmentId, environment, invoiceTypes]);

  useEffect(() => {
    if (!visible) return;
    loadPreview();
  }, [visible, loadPreview]);

  const selectableGenerate = useMemo(
    () => preview?.to_generate.filter((r) => !r.disabled && !r.already_exists) ?? [],
    [preview]
  );

  const selectableSync = useMemo(
    () => preview?.external_charges.filter((r) => r.link_status !== "linked") ?? [],
    [preview]
  );

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = (keys: string[], select: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (select ? next.add(k) : next.delete(k)));
      return next;
    });
  };

  const selectedGenerateKeys = [...selectedKeys].filter((k) => k.startsWith("generate:"));
  const selectedSyncIds = [...selectedKeys]
    .filter((k) => k.startsWith("sync:"))
    .map((k) => k.slice(5));
  const selectedActionCount = selectedGenerateKeys.length + selectedSyncIds.length;
  const selectedSyncSelectableCount = selectableSync.filter((r) => selectedKeys.has(r.key)).length;

  const submit = async () => {
    if (selectedGenerateKeys.length === 0 && selectedSyncIds.length === 0) {
      setError("Marque ao menos uma cobrança para gerar ou sincronizar.");
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const { message } = await applyContractCharges(enrollmentId, {
        environment,
        generate_keys: selectedGenerateKeys,
        sync_charge_ids: selectedSyncIds,
        create_missing: true,
      });
      onSuccess(message);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Falha ao processar cobranças.");
    }
    setApplying(false);
  };

  const canGenerate = !preview?.blocked.contract_batch_generated;

  return (
    <Modal
      visible={visible}
      title="Cobranças do contrato"
      onClose={applying ? () => undefined : onClose}
      size="lg"
      footer={
        <>
          <TouchableOpacity
            onPress={onClose}
            disabled={applying}
            className="px-5 py-3 rounded-xl border border-gray-200 bg-white"
          >
            <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={loadPreview}
            disabled={loading || applying}
            className={`flex-row items-center justify-center gap-2 px-5 py-3 rounded-xl border border-violet-200 ${
              loading || applying ? "opacity-60" : "bg-white"
            }`}
          >
            <Ionicons name="refresh-outline" size={16} color="#6D28D9" />
            <Text className="text-sm font-semibold text-violet-700">Atualizar análise</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={submit}
            disabled={applying || loading}
            className={`flex-row items-center justify-center gap-2 px-6 py-3 rounded-xl ${
              applying || loading ? "bg-violet-300" : "bg-violet-600"
            }`}
          >
            {applying ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="white" />
                <Text className="text-sm font-bold text-white">
                  Executar ({selectedActionCount})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      }
    >
      <View className="gap-4">
        <View className="rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
          <View className="flex-row items-start gap-3 px-4 py-3">
            <View className="w-10 h-10 rounded-xl bg-white border border-slate-100 items-center justify-center">
              <Ionicons name="receipt-outline" size={20} color="#475569" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-slate-900">Revise antes de executar</Text>
              <Text className="text-xs text-slate-600 mt-1">
                Gere parcelas locais, sincronize boletos da Cora, ou execute as duas ações juntas.
              </Text>
            </View>
            <Pill
              label={environment === "prod" ? "Produção" : "Stage"}
              tone={environment === "prod" ? "amber" : "gray"}
            />
          </View>
        </View>

        {preview?.charges_batch_generated ? (
          <View className="flex-row items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <Ionicons name="lock-closed-outline" size={16} color="#B45309" />
            <Text className="flex-1 text-xs text-amber-800">
              O lote do contrato já foi gerado. Novas parcelas locais estão bloqueadas, mas
              ainda é possível sincronizar boletos do provedor.
            </Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap gap-2 rounded-xl bg-gray-50 border border-gray-100 p-1">
          {(["monthly", "enrollment_fee"] as const).map((type) => {
            const active = invoiceTypes.includes(type);
            const label = type === "monthly" ? "Mensalidades" : "Taxa de matrícula";
            return (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  setInvoiceTypes((prev) => {
                    const next = active ? prev.filter((t) => t !== type) : [...prev, type];
                    return next.length > 0 ? next : ["monthly"];
                  });
                }}
                disabled={loading || applying || preview?.charges_batch_generated}
                className={`flex-row items-center gap-2 px-3 py-2 rounded-lg border ${
                  active ? "bg-white border-violet-300" : "bg-transparent border-transparent"
                }`}
              >
                <Ionicons
                  name={active ? "checkmark-circle" : "ellipse-outline"}
                  size={15}
                  color={active ? "#7C3AED" : "#9CA3AF"}
                />
                <Text className={`text-xs font-semibold ${active ? "text-violet-800" : "text-gray-600"}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text className="text-sm text-gray-500 mt-2">Consultando sistema e provedor...</Text>
          </View>
        ) : null}

        {!!error && (
          <View className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        )}

        {preview && !loading ? (
          <View className="gap-4">
            <View className="flex-row flex-wrap gap-2">
              {[
                { label: "No sistema", value: preview.summary.local_count, icon: "albums-outline" },
                { label: "Com Cora", value: preview.summary.local_with_gateway, icon: "cloud-done-outline" },
                { label: "A gerar", value: preview.summary.to_generate_count, icon: "add-circle-outline" },
                { label: "A sincronizar", value: preview.summary.to_sync_count, icon: "sync-outline" },
              ].map((card) => (
                <View
                  key={card.label}
                  className="flex-row items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-3 min-w-[142px] flex-1"
                >
                  <View className="w-9 h-9 rounded-xl bg-gray-50 items-center justify-center">
                    <Ionicons name={card.icon as keyof typeof Ionicons.glyphMap} size={18} color="#6B7280" />
                  </View>
                  <View>
                    <Text className="text-[10px] uppercase text-gray-500 font-semibold">{card.label}</Text>
                    <Text className="text-xl font-bold text-gray-900">{card.value}</Text>
                  </View>
                </View>
              ))}
            </View>

            {preview.summary.external_total > 0 ||
            (preview.summary.external_for_enrollment ?? 0) > 0 ? (
              <View className="flex-row items-start gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                <Ionicons name="information-circle-outline" size={16} color="#6D28D9" />
                <Text className="flex-1 text-xs text-violet-900">
                  Provedor (Cora): {preview.summary.external_total} cobrança
                  {preview.summary.external_total === 1 ? "" : "s"} no tenant ·{" "}
                  {preview.summary.external_for_enrollment ?? preview.external_charges.length}{" "}
                  sugerida
                  {(preview.summary.external_for_enrollment ?? preview.external_charges.length) === 1
                    ? ""
                    : "s"}{" "}
                  para esta matrícula
                </Text>
              </View>
            ) : null}

            {preview.warnings.map((w, i) => (
              <View
                key={i}
                className="flex-row items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5"
              >
                <Ionicons name="warning-outline" size={16} color="#B45309" />
                <Text className="flex-1 text-xs text-amber-800">{w}</Text>
              </View>
            ))}

            {preview.summary.provider_fetch_error ? (
              <View className="flex-row items-start gap-2 rounded-xl bg-orange-50 border border-orange-200 px-3 py-2.5">
                <Ionicons name="alert-circle-outline" size={16} color="#C2410C" />
                <Text className="flex-1 text-xs text-orange-800">
                  {preview.summary.provider_fetch_error}
                </Text>
              </View>
            ) : null}

            {/* Local */}
            <View>
              <SectionHeader
                title={`Já no sistema (${preview.local_invoices.length})`}
                subtitle="Cobranças que já existem nesta matrícula."
              />
              {preview.local_invoices.length === 0 ? (
                <EmptyState
                  icon="folder-open-outline"
                  title="Nenhuma cobrança local"
                  description="Ainda não há cobrança criada para esta matrícula."
                />
              ) : (
                <View className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                  {preview.local_invoices.map((row, i) => (
                    <View
                      key={row.invoice_id}
                      className={`flex-row items-center gap-3 px-3 py-3 border-b border-gray-50 ${i % 2 ? "bg-gray-50/50" : "bg-white"}`}
                    >
                      <View className="w-9 h-9 rounded-xl bg-gray-50 items-center justify-center">
                        <Ionicons name="document-text-outline" size={18} color="#6B7280" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs font-semibold text-gray-800" numberOfLines={1}>
                          {row.description}
                        </Text>
                        <Text className="text-[11px] text-gray-500 mt-0.5">
                          {fmtDate(row.due_date)} · {fmtMoney(row.amount)} · {row.status}
                        </Text>
                      </View>
                      <Pill
                        label={row.cora_charge_id ? `Cora ${row.cora_status ?? ""}` : "Só local"}
                        tone={row.cora_charge_id ? "emerald" : "gray"}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* To generate */}
            <View>
              <SectionHeader
                title={`Gerar no contrato (${selectableGenerate.length})`}
                subtitle="Selecione as parcelas locais que serão criadas agora."
                action={
                  canGenerate && selectableGenerate.length > 0 ? (
                    <TouchableOpacity
                      className="px-2 py-1 rounded-lg bg-violet-50"
                      onPress={() =>
                        toggleAll(
                          selectableGenerate.map((r) => r.key),
                          selectedGenerateKeys.length !== selectableGenerate.length
                        )
                      }
                    >
                      <Text className="text-xs font-semibold text-violet-700">
                        {selectedGenerateKeys.length === selectableGenerate.length
                          ? "Desmarcar todas"
                          : "Marcar todas"}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
              {preview.to_generate.length === 0 ? (
                <EmptyState
                  icon="checkmark-done-outline"
                  title="Nada a gerar"
                  description="Os tipos selecionados não têm novas parcelas para criação."
                />
              ) : (
                preview.to_generate.map((row) => (
                  <TouchableOpacity
                    key={row.key}
                    disabled={row.disabled || row.already_exists || !canGenerate}
                    onPress={() => toggleKey(row.key)}
                    activeOpacity={0.82}
                    className={`flex-row items-center gap-3 rounded-xl border px-3 py-3 mb-2 ${
                      selectedKeys.has(row.key) && !row.already_exists
                        ? "border-violet-200 bg-violet-50/60"
                        : row.already_exists
                          ? "border-gray-100 bg-gray-50 opacity-70"
                          : "border-gray-100 bg-white"
                    }`}
                  >
                    <RowCheckbox
                      checked={selectedKeys.has(row.key)}
                      disabled={row.disabled || row.already_exists || !canGenerate}
                    />
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-gray-800">{row.description}</Text>
                      <Text className="text-[11px] text-gray-500">
                        {fmtDate(row.due_date)} · {fmtMoney(row.amount)}
                        {row.already_exists ? " · já existe" : ""}
                      </Text>
                    </View>
                    {row.already_exists ? <Pill label="Já existe" /> : null}
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* External sync */}
            <View>
              <SectionHeader
                title={`No provedor - boletos (${preview.summary.external_for_enrollment ?? preview.external_charges.length})`}
                subtitle={
                  preview.summary.external_total > 0
                    ? `${preview.summary.external_total} cobrança(s) no tenant Cora.`
                    : "Boletos sugeridos para esta matrícula."
                }
                action={
                  selectableSync.length > 0 ? (
                    <TouchableOpacity
                      className="px-2 py-1 rounded-lg bg-violet-50"
                      onPress={() =>
                        toggleAll(
                          selectableSync.map((r) => r.key),
                          selectedSyncIds.length !== selectableSync.length
                        )
                      }
                    >
                      <Text className="text-xs font-semibold text-violet-700">
                        {selectedSyncSelectableCount === selectableSync.length
                          ? "Desmarcar todas"
                          : "Marcar todas"}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
              {preview.external_charges.length === 0 ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title="Nenhum boleto para sincronizar"
                  description="Não há boleto pendente para este aluno no provedor."
                />
              ) : (
                preview.external_charges.map((row) => (
                  <TouchableOpacity
                    key={row.key}
                    disabled={row.link_status === "linked"}
                    onPress={() => toggleKey(row.key)}
                    activeOpacity={0.82}
                    className={`flex-row items-center gap-3 rounded-xl border px-3 py-3 mb-2 ${
                      selectedKeys.has(row.key)
                        ? "border-violet-200 bg-violet-50/60"
                        : row.link_status === "linked"
                          ? "border-gray-100 bg-gray-50 opacity-70"
                          : "border-gray-100 bg-white"
                    }`}
                  >
                    <RowCheckbox
                      checked={selectedKeys.has(row.key)}
                      disabled={row.link_status === "linked"}
                    />
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-gray-800" numberOfLines={1}>
                        {row.description}
                      </Text>
                      <Text className="text-[11px] text-gray-500">
                        {fmtDate(row.due_date)} · {fmtMoney(row.amount)} · {row.status}
                        {row.linked_invoice_id ? ` · #${row.linked_invoice_id}` : ""}
                      </Text>
                    </View>
                    <Pill
                      label={LINK_STATUS_LABELS[row.link_status] ?? row.link_status}
                      tone={row.link_status === "linked" ? "emerald" : "violet"}
                    />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
