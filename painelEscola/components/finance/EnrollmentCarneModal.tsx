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

type Step = "select" | "confirm";

const money = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  overdue: "Vencida",
  paid: "Paga",
  cancelled: "Cancelada",
};

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
  const [step, setStep] = useState<Step>("select");
  const [preview, setPreview] = useState<CarnePreview | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCarnePreview(enrollmentId);
      setPreview(data);
      const initial: Record<number, boolean> = {};
      data.invoices.forEach((inv) => {
        initial[inv.invoice_id] = true;
      });
      setSelected(initial);
      setStep("select");
    } catch (e: any) {
      onError?.(e?.response?.data?.message || "Não foi possível carregar o carnê.");
      setPreview(null);
    }
    setLoading(false);
  }, [enrollmentId, onError]);

  useEffect(() => {
    if (visible) {
      load();
    } else {
      setPreview(null);
      setSelected({});
      setStep("select");
    }
  }, [visible, load]);

  const excluded = preview?.excluded_invoices ?? [];
  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([id]) => Number(id));

  const selectedInvoices =
    preview?.invoices.filter((inv) => selected[inv.invoice_id]) ?? [];

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
      const { blob, filename, format, generatedCount, errorCount } = await generateCarneArchive(
        enrollmentId,
        { environment, invoiceIds: selectedIds }
      );
      downloadBlob(blob, filename);
      let message =
        format === "zip"
          ? `Carnê ZIP com ${generatedCount} boleto(s) (um PDF por parcela).`
          : `Carnê PDF único com ${generatedCount} boleto(s).`;
      if (errorCount > 0) {
        message += ` ${errorCount} cobrança(s) não puderam ser incluídas.`;
      }
      onSuccess?.(message);
      onClose();
    } catch (e: any) {
      const payload = e?.response?.data;
      let message = "Falha ao gerar carnê.";

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

  const onContinue = () => {
    if (selectedIds.length === 0) {
      onError?.("Selecione ao menos uma cobrança.");
      return;
    }
    setStep("confirm");
  };

  const renderEligibleRow = (inv: CarnePreviewInvoice) => {
    const checked = !!selected[inv.invoice_id];
    return (
      <TouchableOpacity
        key={inv.invoice_id}
        onPress={() => toggle(inv.invoice_id)}
        activeOpacity={0.85}
        className={`flex-row items-start gap-3 px-3 py-3 rounded-xl border mb-2 ${
          checked ? "border-violet-300 bg-violet-50/50" : "border-gray-200 bg-white"
        }`}
      >
        <Ionicons
          name={checked ? "checkbox" : "square-outline"}
          size={20}
          color={checked ? "#7C3AED" : "#9CA3AF"}
        />
        <View style={{ flex: 1 }}>
          <Text className="text-sm font-semibold text-gray-800">{inv.description}</Text>
          <Text className="text-xs text-gray-500 mt-0.5">
            {`Venc.: ${inv.due_date ? isoToDisplay(inv.due_date) : "—"} · ${money(inv.amount)}`}
          </Text>
          {inv.has_boleto ? (
            <Text className="text-[10px] text-emerald-700 font-semibold mt-1">
              Já possui boleto no provedor
            </Text>
          ) : (
            <Text className="text-[10px] text-amber-700 mt-1">
              Será emitido no provedor ao gerar o carnê
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderExcludedRow = (inv: CarneExcludedInvoice) => (
    <View
      key={inv.invoice_id}
      className="flex-row items-start gap-3 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 mb-2"
    >
      <Ionicons name="close-circle-outline" size={18} color="#9CA3AF" style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text className="text-sm font-medium text-gray-700">{inv.description}</Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {`Venc.: ${inv.due_date ? isoToDisplay(inv.due_date) : "—"} · ${money(inv.amount)} · ${
            STATUS_LABELS[inv.status] ?? inv.status
          }`}
        </Text>
        <Text className="text-[10px] text-gray-600 mt-1 leading-relaxed">{inv.reason_label}</Text>
      </View>
    </View>
  );

  const renderExcludedBlock = (compact = false) => {
    if (excluded.length === 0) return null;

    return (
      <View className={compact ? "mb-4" : "mb-5"}>
        <View className="flex-row items-center gap-2 mb-2">
          <Ionicons name="alert-circle-outline" size={16} color="#B45309" />
          <Text className="text-xs font-bold text-amber-800 uppercase tracking-wide">
            {excluded.length} cobrança(s) não entram no carnê
          </Text>
        </View>
        <ScrollView
          style={{ maxHeight: compact ? 160 : 200 }}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {excluded.map(renderExcludedRow)}
        </ScrollView>
      </View>
    );
  };

  const renderConfirmStep = () => (
    <>
      <View className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
        <Text className="text-sm font-semibold text-amber-900 mb-1">Confirme a geração</Text>
        <Text className="text-xs text-amber-800 leading-relaxed">
          Serão emitidos boletos no provedor e montado o arquivo para impressão. Cobranças abaixo
          não serão incluídas.
        </Text>
      </View>

      <View className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4">
        <Text className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">
          Incluídas no carnê
        </Text>
        <Text className="text-lg font-bold text-emerald-900">
          {selectedIds.length} cobrança(s) selecionada(s)
        </Text>
        <Text className="text-xs text-emerald-700 mt-1">
          {preview?.archive_format === "zip"
            ? "Download em ZIP (um PDF por parcela)"
            : "Download em PDF único"}
        </Text>
      </View>

      {renderExcludedBlock(true)}

      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Parcelas que serão geradas
      </Text>
      <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator nestedScrollEnabled>
        {selectedInvoices.map((inv) => (
          <View
            key={inv.invoice_id}
            className="flex-row items-center gap-2 px-3 py-2 rounded-lg bg-violet-50/60 border border-violet-100 mb-1.5"
          >
            <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
            <View style={{ flex: 1 }}>
              <Text className="text-sm text-gray-800" numberOfLines={1}>
                {inv.description}
              </Text>
              <Text className="text-xs text-gray-500">
                {`Venc.: ${inv.due_date ? isoToDisplay(inv.due_date) : "—"} · ${money(inv.amount)}`}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );

  const renderSelectStep = () => (
    <>
      <View className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 mb-4 flex-row gap-2">
        <Ionicons name="information-circle-outline" size={18} color="#2563EB" />
        <Text className="text-xs text-blue-800 flex-1 leading-relaxed">
          {preview?.archive_format_hint ??
            "Emite boleto no provedor para cada parcela e prepara o arquivo para impressão ou entrega aos pais."}
        </Text>
      </View>

      {excluded.length > 0 && renderExcludedBlock()}

      {!preview || preview.invoices.length === 0 ? (
        <View className="py-10 items-center gap-2">
          <Ionicons name="document-outline" size={36} color="#D1D5DB" />
          <Text className="text-sm text-gray-500 text-center px-4">
            {excluded.length > 0
              ? "Não há cobranças em aberto aptas para o carnê. As cobranças listadas acima não podem ser incluídas."
              : "Não há cobranças nesta matrícula para o carnê."}
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm text-gray-600 flex-1 mr-2">
              {`${preview.student_name ?? "Aluno"} · ${selectedIds.length} de ${preview.invoices.length} selecionada(s)`}
            </Text>
            <TouchableOpacity onPress={() => toggleAll(selectedIds.length !== preview.invoices.length)}>
              <Text className="text-xs font-semibold text-violet-700">
                {selectedIds.length === preview.invoices.length ? "Desmarcar todas" : "Marcar todas"}
              </Text>
            </TouchableOpacity>
          </View>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Aptas para o carnê
          </Text>
          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator nestedScrollEnabled>
            {preview.invoices.map(renderEligibleRow)}
          </ScrollView>
        </>
      )}
    </>
  );

  const footerSelect = (
    <>
      <TouchableOpacity
        onPress={onClose}
        className="px-5 py-2.5 rounded-xl border border-gray-200"
        disabled={generating}
      >
        <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onContinue}
        disabled={loading || selectedIds.length === 0}
        className={`px-5 py-2.5 rounded-xl flex-row items-center gap-2 ${
          selectedIds.length === 0 ? "bg-gray-300" : "bg-violet-600"
        }`}
      >
        <Ionicons name="arrow-forward-outline" size={16} color="#fff" />
        <Text className="text-sm font-bold text-white">Continuar</Text>
      </TouchableOpacity>
    </>
  );

  const footerConfirm = (
    <>
      <TouchableOpacity
        onPress={() => setStep("select")}
        className="px-5 py-2.5 rounded-xl border border-gray-200"
        disabled={generating}
      >
        <Text className="text-sm font-semibold text-gray-700">Voltar</Text>
      </TouchableOpacity>
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
          {generating
            ? "Gerando..."
            : preview?.archive_format === "zip"
              ? "Confirmar e baixar ZIP"
              : "Confirmar e baixar PDF"}
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal
      visible={visible}
      title={step === "confirm" ? "Confirmar carnê" : "Gerar carnê (boletos)"}
      onClose={onClose}
      size="md"
      footer={step === "confirm" ? footerConfirm : footerSelect}
    >
      {loading ? (
        <View className="py-12 items-center">
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : step === "confirm" ? (
        renderConfirmStep()
      ) : (
        renderSelectStep()
      )}
    </Modal>
  );
}
