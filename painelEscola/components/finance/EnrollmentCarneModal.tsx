import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import {
  downloadBlob,
  fetchCarnePreview,
  generateCarneArchive,
  type CarneExcludedInvoice,
  type CarnePreview,
  type CarnePreviewInvoice,
} from "../../services/enrollmentCarne";
import { isoToDisplay } from "../../utils/masks";

type Props = {
  visible: boolean;
  enrollmentId: number;
  environment?: string;
  onClose: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

type Step = "intro" | "select" | "options" | "confirm";

const STEPS: { id: Step; label: string }[] = [
  { id: "intro", label: "Resumo" },
  { id: "select", label: "Parcelas" },
  { id: "options", label: "Opções" },
  { id: "confirm", label: "Gerar" },
];

const money = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

function isInvoiceCarneReady(inv: CarnePreviewInvoice): boolean {
  return inv.carne_ready === true;
}

function StepIndicator({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.id === current);

  return (
    <View className="flex-row items-center justify-center gap-1 mb-4 px-1">
      {STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <View key={step.id} className="flex-row items-center flex-1 max-w-[72px]">
            <View
              className={`h-7 w-7 rounded-full items-center justify-center ${
                active ? "bg-violet-600" : done ? "bg-violet-200" : "bg-gray-200"
              }`}
            >
              {done ? (
                <Ionicons name="checkmark" size={14} color="#5B21B6" />
              ) : (
                <Text
                  className={`text-xs font-bold ${active ? "text-white" : "text-gray-500"}`}
                >
                  {i + 1}
                </Text>
              )}
            </View>
            {i < STEPS.length - 1 ? (
              <View className={`flex-1 h-0.5 mx-0.5 ${done ? "bg-violet-300" : "bg-gray-200"}`} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default function EnrollmentCarneModal({
  visible,
  enrollmentId,
  environment = "prod",
  onClose,
  onSuccess,
  onError,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [preview, setPreview] = useState<CarnePreview | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [issueMissing, setIssueMissing] = useState(false);
  const [requireAll, setRequireAll] = useState(true);
  const [showExcluded, setShowExcluded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCarnePreview(enrollmentId, { environment });
      setPreview(data);
      const initial: Record<number, boolean> = {};
      data.invoices.forEach((inv) => {
        initial[inv.invoice_id] = isInvoiceCarneReady(inv);
      });
      setSelected(initial);
      setIssueMissing(false);
      setRequireAll(true);
      setStep("intro");
      setShowExcluded(false);
    } catch (e: any) {
      onError?.(e?.response?.data?.message || "Não foi possível carregar o carnê.");
      setPreview(null);
    }
    setLoading(false);
  }, [enrollmentId, environment, onError]);

  useEffect(() => {
    if (visible) {
      load();
    } else {
      setPreview(null);
      setSelected({});
      setStep("intro");
    }
  }, [visible, load]);

  const excluded = preview?.excluded_invoices ?? [];
  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([id]) => Number(id));

  const selectedInvoices =
    preview?.invoices.filter((inv) => selected[inv.invoice_id]) ?? [];

  const readyCount = preview?.ready_for_bundle_count ?? 0;
  const needsPdfCount =
    preview?.invoices.filter((inv) => inv.needs_pdf_sync).length ?? 0;

  const toggle = (id: number) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = (value: boolean) => {
    if (!preview) return;
    const next: Record<number, boolean> = {};
    preview.invoices.forEach((inv) => {
      next[inv.invoice_id] = value;
    });
    setSelected(next);
  };

  const parseErrorPayload = (json: any, fallback = "Falha ao gerar carnê.") => {
    const base = json?.message || json?.body?.message || fallback;
    const lines: string[] = [base];
    const rows = json?.body?.errors ?? json?.errors;
    if (Array.isArray(rows)) {
      rows.slice(0, 5).forEach((row: { message?: string; description?: string }) => {
        if (row?.message) {
          lines.push(`• ${row.description ? `${row.description}: ` : ""}${row.message}`);
        }
      });
    }
    if (json?.body?.hint) {
      lines.push(String(json.body.hint));
    }
    return lines.join("\n");
  };

  const runGenerate = async () => {
    setGenerating(true);
    try {
      const { blob, filename, format, generatedCount, errorCount, errors } =
        await generateCarneArchive(enrollmentId, {
          environment,
          invoiceIds: selectedIds,
          issueMissing,
          requireAll,
        });
      downloadBlob(blob, filename);
      let message =
        format === "zip"
          ? `Carnê montado: ${generatedCount} boleto(s) no ZIP.`
          : `Carnê montado: ${generatedCount} boleto(s) em PDF único.`;
      if (!issueMissing) {
        message += " (somente boletos já emitidos.)";
      }
      if (errorCount > 0) {
        message += ` ${errorCount} parcela(s) ficaram de fora.`;
        errors.slice(0, 3).forEach((row) => {
          if (row.message) {
            message += `\n• ${row.description ? `${row.description}: ` : ""}${row.message}`;
          }
        });
      }
      onSuccess?.(message);
      onClose();
    } catch (e: any) {
      const payload = e?.response?.data;
      let message = e?.message || "Falha ao gerar carnê.";

      if (payload instanceof Blob) {
        try {
          const text = await payload.text();
          message = parseErrorPayload(JSON.parse(text));
        } catch {
          /* keep default */
        }
      } else if (payload && typeof payload === "object") {
        message = parseErrorPayload(payload);
      }

      onError?.(message);
    }
    setGenerating(false);
  };

  const validateSelection = (): boolean => {
    if (selectedIds.length === 0) {
      onError?.("Selecione ao menos uma cobrança.");
      return false;
    }

    const notReady = selectedInvoices.filter((inv) => !isInvoiceCarneReady(inv));
    if (!issueMissing && notReady.length > 0) {
      onError?.(
        `${notReady.length} parcela(s) sem PDF de boleto disponível. ` +
          'Marque "Emitir faltantes" ou sincronize em Financeiro.'
      );
      return false;
    }

    return true;
  };

  const goNext = () => {
    if (step === "intro") {
      setStep("select");
      return;
    }
    if (step === "select") {
      if (!validateSelection()) return;
      setStep("options");
      return;
    }
    if (step === "options") {
      setStep("confirm");
    }
  };

  const goBack = () => {
    if (step === "confirm") setStep("options");
    else if (step === "options") setStep("select");
    else if (step === "select") setStep("intro");
  };

  const renderInvoiceRow = (
    inv: CarnePreviewInvoice,
    selectable: boolean
  ) => {
    const checked = !!selected[inv.invoice_id];
    const ready = isInvoiceCarneReady(inv);
    const needsSync = inv.needs_pdf_sync;
    const statusText = ready
      ? "Pronta"
      : needsSync
        ? "Sincronizar PDF"
        : issueMissing
          ? "Emitir no provedor"
          : "Sem boleto";
    const statusColor = ready ? "#047857" : needsSync ? "#B45309" : "#DC2626";

    const row = (
      <View className="flex-row items-center gap-2 min-w-0 flex-1">
        {selectable ? (
          <Ionicons
            name={checked ? "checkbox" : "square-outline"}
            size={18}
            color={checked ? "#7C3AED" : "#9CA3AF"}
          />
        ) : (
          <Ionicons name="checkmark-circle" size={18} color="#7C3AED" />
        )}
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
            {inv.description}
          </Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {`Venc. ${inv.due_date ? isoToDisplay(inv.due_date) : "—"} · ${money(inv.amount)} · `}
            <Text style={{ color: statusColor, fontWeight: "600" }}>{statusText}</Text>
          </Text>
        </View>
      </View>
    );

    if (!selectable) {
      return (
        <View
          key={inv.invoice_id}
          className="px-3 py-2 border-b border-gray-100"
        >
          {row}
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={inv.invoice_id}
        onPress={() => toggle(inv.invoice_id)}
        activeOpacity={0.85}
        className={`px-3 py-2 border-b border-gray-100 ${checked ? "bg-violet-50/50" : ""}`}
      >
        {row}
      </TouchableOpacity>
    );
  };

  const renderExcludedRow = (inv: CarneExcludedInvoice) => (
    <View key={inv.invoice_id} className="px-3 py-2 border-b border-amber-100">
      <Text className="text-sm text-gray-800" numberOfLines={1}>
        {inv.description}
      </Text>
      <Text className="text-xs text-gray-500" numberOfLines={1}>
        {`${inv.reason_label} · ${money(inv.amount)}`}
      </Text>
    </View>
  );

  const studentLabel = preview?.student_name ?? "Aluno";
  const archiveLabel =
    preview?.archive_format === "zip" ? "ZIP (um PDF por parcela)" : "PDF único";

  const renderIntro = () => (
    <View>
      <View className="rounded-xl bg-violet-50 border border-violet-100 p-4 mb-3">
        <Text className="text-base font-bold text-violet-950">{studentLabel}</Text>
        <Text className="text-xs text-violet-700 mt-1">
          {preview?.enrollment_number ? `Matrícula ${preview.enrollment_number}` : ""}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2 mb-3">
        <View className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 flex-1 min-w-[45%]">
          <Text className="text-lg font-bold text-emerald-800">{preview?.eligible_count ?? 0}</Text>
          <Text className="text-[10px] text-emerald-700">Aptas ao carnê</Text>
        </View>
        <View className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 flex-1 min-w-[45%]">
          <Text className="text-lg font-bold text-gray-800">{excluded.length}</Text>
          <Text className="text-[10px] text-gray-600">Excluídas</Text>
        </View>
      </View>
      <Text className="text-sm text-gray-700 mb-2">
        Formato: <Text className="font-semibold">{archiveLabel}</Text>
      </Text>
      <Text className="text-xs text-gray-500 leading-relaxed">
        {preview?.archive_format_hint}
      </Text>
      {needsPdfCount > 0 ? (
        <View className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex-row gap-2">
          <Ionicons name="warning-outline" size={18} color="#B45309" />
          <Text className="text-xs text-amber-900 flex-1 leading-relaxed">
            {`${needsPdfCount} parcela(s) têm boleto na Cora, mas o PDF ainda não está acessível. `}
            O passo seguinte mostra quais precisam de sincronização.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderSelect = () => (
    <View className="flex-1">
      <View className="flex-row items-center justify-between mb-2 px-1">
        <Text className="text-xs text-gray-600">
          {`${readyCount} pronta(s) · ${selectedIds.length} selecionada(s)`}
        </Text>
        {preview && preview.invoices.length > 0 ? (
          <TouchableOpacity onPress={() => toggleAll(selectedIds.length !== preview.invoices.length)}>
            <Text className="text-xs font-bold text-violet-700">
              {selectedIds.length === preview.invoices.length ? "Desmarcar todas" : "Marcar todas"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!preview || preview.invoices.length === 0 ? (
        <View className="py-8 items-center">
          <Text className="text-sm text-gray-500 text-center">
            Não há cobranças aptas para o carnê.
          </Text>
        </View>
      ) : (
        <View className="rounded-xl border border-gray-200 overflow-hidden max-h-[280px]">
          <ScrollView nestedScrollEnabled>
            {preview.invoices.map((inv) => renderInvoiceRow(inv, true))}
          </ScrollView>
        </View>
      )}
      {excluded.length > 0 ? (
        <TouchableOpacity
          onPress={() => setShowExcluded((v) => !v)}
          className="mt-3 flex-row items-center gap-1"
        >
          <Ionicons
            name={showExcluded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#9CA3AF"
          />
          <Text className="text-xs text-gray-500">
            {`${excluded.length} cobrança(s) não entram no carnê`}
          </Text>
        </TouchableOpacity>
      ) : null}
      {showExcluded && excluded.length > 0 ? (
        <View className="mt-1 rounded-xl border border-amber-100 bg-amber-50/30 overflow-hidden max-h-[120px]">
          <ScrollView nestedScrollEnabled>
            {excluded.map(renderExcludedRow)}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );

  const renderOptions = () => (
    <View>
      <Text className="text-sm text-gray-600 mb-3 px-1">
        Como o sistema deve tratar parcelas sem PDF ou com falha?
      </Text>
      <TouchableOpacity
        onPress={() => setRequireAll((v) => !v)}
        activeOpacity={0.85}
        className="flex-row items-start gap-2.5 px-3 py-3 rounded-xl border border-gray-200 bg-white mb-2"
      >
        <Ionicons
          name={requireAll ? "checkbox" : "square-outline"}
          size={20}
          color={requireAll ? "#7C3AED" : "#9CA3AF"}
        />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-800">Exigir todas as parcelas</Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            Se uma falhar, o carnê inteiro não é baixado (recomendado).
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setIssueMissing((v) => !v)}
        activeOpacity={0.85}
        className="flex-row items-start gap-2.5 px-3 py-3 rounded-xl border border-gray-200 bg-white"
      >
        <Ionicons
          name={issueMissing ? "checkbox" : "square-outline"}
          size={20}
          color={issueMissing ? "#7C3AED" : "#9CA3AF"}
        />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-800">Emitir faltantes no provedor</Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            Cria ou atualiza cobranças na Cora ao gerar (use se o PDF não existir).
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderConfirm = () => (
    <View>
      <View className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-3 mb-3">
        <Text className="text-sm font-semibold text-emerald-900">Pronto para gerar</Text>
        <Text className="text-xs text-emerald-800 mt-1">
          {`${selectedIds.length} parcela(s) · ${archiveLabel}`}
          {issueMissing ? " · com emissão na Cora" : " · só boletos existentes"}
        </Text>
      </View>
      <View className="rounded-xl border border-gray-200 overflow-hidden max-h-[220px]">
        <ScrollView nestedScrollEnabled>
          {selectedInvoices.map((inv) => renderInvoiceRow(inv, false))}
        </ScrollView>
      </View>
    </View>
  );

  const stepTitle: Record<Step, string> = {
    intro: "Gerar carnê",
    select: "Selecionar parcelas",
    options: "Opções",
    confirm: "Confirmar e baixar",
  };

  const footer = (
    <View className="flex-row gap-2 justify-end">
      {step !== "intro" ? (
        <TouchableOpacity
          onPress={goBack}
          className="px-5 py-2.5 rounded-xl border border-gray-200"
          disabled={generating}
        >
          <Text className="text-sm font-semibold text-gray-700">Voltar</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onClose}
          className="px-5 py-2.5 rounded-xl border border-gray-200"
          disabled={generating}
        >
          <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
        </TouchableOpacity>
      )}
      {step === "confirm" ? (
        <TouchableOpacity
          onPress={runGenerate}
          disabled={generating}
          className="px-5 py-2.5 rounded-xl bg-violet-600 flex-row items-center gap-2"
        >
          {generating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="download-outline" size={16} color="#fff" />
          )}
          <Text className="text-sm font-bold text-white">
            {generating ? "Gerando..." : "Baixar carnê"}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={goNext}
          disabled={loading || (step === "select" && selectedIds.length === 0)}
          className={`px-5 py-2.5 rounded-xl flex-row items-center gap-2 ${
            step === "select" && selectedIds.length === 0 ? "bg-gray-300" : "bg-violet-600"
          }`}
        >
          <Text className="text-sm font-bold text-white">Continuar</Text>
          <Ionicons name="arrow-forward-outline" size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      title={stepTitle[step]}
      onClose={onClose}
      size="md"
      footer={footer}
    >
      {loading ? (
        <View className="py-12 items-center">
          <ActivityIndicator color="#7C3AED" size="large" />
          <Text className="text-xs text-gray-500 mt-3">Consultando boletos na Cora…</Text>
        </View>
      ) : (
        <>
          <StepIndicator current={step} />
          {step === "intro" && renderIntro()}
          {step === "select" && renderSelect()}
          {step === "options" && renderOptions()}
          {step === "confirm" && renderConfirm()}
        </>
      )}
    </Modal>
  );
}
