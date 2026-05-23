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
type AccordionKey = "excluded" | "eligible" | "confirmExcluded" | "confirmSelected";

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

function dueAmountLine(inv: { due_date: string | null; amount: string }) {
  return `Venc. ${inv.due_date ? isoToDisplay(inv.due_date) : "—"} · ${money(inv.amount)}`;
}

function AccordionSection({
  title,
  badge,
  expanded,
  onToggle,
  tone,
  headerAction,
  maxBodyHeight,
  children,
}: {
  title: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  tone: "amber" | "violet" | "emerald";
  headerAction?: React.ReactNode;
  maxBodyHeight?: number;
  children: React.ReactNode;
}) {
  const tones = {
    amber: {
      wrap: "border-amber-200 bg-amber-50/30",
      head: "bg-amber-50",
      title: "text-amber-950",
      badge: "bg-amber-100 text-amber-900",
    },
    violet: {
      wrap: "border-violet-200 bg-violet-50/20",
      head: "bg-violet-50",
      title: "text-violet-950",
      badge: "bg-violet-100 text-violet-900",
    },
    emerald: {
      wrap: "border-emerald-200 bg-emerald-50/20",
      head: "bg-emerald-50",
      title: "text-emerald-950",
      badge: "bg-emerald-100 text-emerald-900",
    },
  }[tone];

  return (
    <View className={`rounded-xl border mb-3 overflow-hidden ${tones.wrap}`}>
      <View className={`flex-row items-center gap-2 px-3 py-2.5 ${tones.head}`}>
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.8}
          className="flex-row items-center gap-2 flex-1 min-w-0"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={tone === "amber" ? "#B45309" : tone === "violet" ? "#6D28D9" : "#047857"}
          />
          <Text className={`flex-1 text-sm font-bold ${tones.title}`} numberOfLines={1}>
            {title}
          </Text>
          {badge ? (
            <View className={`rounded-full px-2 py-0.5 ${tones.badge}`}>
              <Text className="text-[10px] font-bold">{badge}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        {headerAction}
      </View>
      {expanded ? (
        <View className="px-2 pb-2 pt-1">
          {maxBodyHeight ? (
            <ScrollView
              style={{ maxHeight: maxBodyHeight }}
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      ) : null}
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
  const [step, setStep] = useState<Step>("select");
  const [preview, setPreview] = useState<CarnePreview | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [issueMissing, setIssueMissing] = useState(false);
  const [requireAll, setRequireAll] = useState(true);
  const [openSections, setOpenSections] = useState<Record<AccordionKey, boolean>>({
    excluded: true,
    eligible: true,
    confirmExcluded: false,
    confirmSelected: true,
  });

  const toggleSection = (key: AccordionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCarnePreview(enrollmentId);
      setPreview(data);
      const initial: Record<number, boolean> = {};
      data.invoices.forEach((inv) => {
        const ready = inv.carne_ready ?? inv.has_boleto;
        initial[inv.invoice_id] = ready;
      });
      setSelected(initial);
      setIssueMissing(false);
      setRequireAll(true);
      setStep("select");
      setOpenSections({
        excluded: (data.excluded_invoices?.length ?? 0) > 0,
        eligible: (data.invoices?.length ?? 0) > 0,
        confirmExcluded: false,
        confirmSelected: true,
      });
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

  const selectedNeedingIssue = selectedInvoices.filter(
    (inv) => !(inv.carne_ready ?? inv.has_boleto)
  ).length;

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

  const onContinue = () => {
    if (selectedIds.length === 0) {
      onError?.("Selecione ao menos uma cobrança.");
      return;
    }
    if (!issueMissing && selectedNeedingIssue > 0) {
      onError?.(
        `${selectedNeedingIssue} parcela(s) selecionada(s) ainda não têm boleto emitido. ` +
          "Marque \"Emitir faltantes no provedor\" ou selecione só parcelas com boleto pronto."
      );
      return;
    }
    setStep("confirm");
    setOpenSections((prev) => ({
      ...prev,
      confirmExcluded: excluded.length > 0,
      confirmSelected: true,
    }));
  };

  const renderOptionToggle = (
    label: string,
    hint: string,
    value: boolean,
    onToggle: () => void
  ) => (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      className="flex-row items-start gap-2.5 px-3 py-2.5 rounded-lg border border-gray-200 bg-white mb-2"
    >
      <Ionicons
        name={value ? "checkbox" : "square-outline"}
        size={18}
        color={value ? "#7C3AED" : "#9CA3AF"}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1 }}>
        <Text className="text-sm font-semibold text-gray-800">{label}</Text>
        <Text className="text-xs text-gray-500 leading-relaxed">{hint}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEligibleRow = (inv: CarnePreviewInvoice, selectable = true) => {
    const checked = !!selected[inv.invoice_id];
    const ready = inv.carne_ready ?? inv.has_boleto;
    const metaSuffix = ready
      ? " · Pronta para carnê"
      : issueMissing
        ? " · Será emitida no provedor"
        : " · Emitir boleto antes";
    const metaColor = ready ? "#047857" : issueMissing ? "#B45309" : "#DC2626";

    const content = (
      <>
        {selectable ? (
          <Ionicons
            name={checked ? "checkbox" : "square-outline"}
            size={18}
            color={checked ? "#7C3AED" : "#9CA3AF"}
            style={{ marginTop: 1 }}
          />
        ) : (
          <Ionicons name="checkmark-circle" size={18} color="#7C3AED" style={{ marginTop: 1 }} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
            {inv.description}
          </Text>
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {dueAmountLine(inv)}
            <Text style={{ color: metaColor, fontWeight: "600" }}>{metaSuffix}</Text>
          </Text>
        </View>
      </>
    );

    if (!selectable) {
      return (
        <View
          key={inv.invoice_id}
          className="flex-row items-start gap-2 px-2 py-2 rounded-lg bg-white border border-violet-100 mb-1"
        >
          {content}
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={inv.invoice_id}
        onPress={() => toggle(inv.invoice_id)}
        activeOpacity={0.85}
        className={`flex-row items-start gap-2 px-2 py-2 rounded-lg border mb-1 ${
          checked ? "border-violet-300 bg-white" : "border-gray-100 bg-white/80"
        }`}
      >
        {content}
      </TouchableOpacity>
    );
  };

  const renderExcludedRow = (inv: CarneExcludedInvoice) => (
    <View
      key={inv.invoice_id}
      className="flex-row items-start gap-2 px-2 py-2 rounded-lg border border-gray-100 bg-white mb-1"
    >
      <Ionicons name="close-circle" size={16} color="#D1D5DB" style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
          {inv.description}
        </Text>
        <Text className="text-xs text-gray-500" numberOfLines={1}>
          {`${dueAmountLine(inv)} · ${STATUS_LABELS[inv.status] ?? inv.status} · ${inv.reason_label}`}
        </Text>
      </View>
    </View>
  );

  const studentLabel = preview?.student_name ?? "Aluno";

  const renderSelectStep = () => (
    <>
      <View className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 mb-3 flex-row gap-2">
        <Ionicons name="information-circle-outline" size={17} color="#2563EB" />
        <Text className="text-xs text-blue-800 flex-1 leading-relaxed">
          {issueMissing
            ? "Modo emissão: cria ou atualiza cobranças no provedor e monta o arquivo. Pode falhar parcela a parcela."
            : `Modo carnê (padrão): monta ${preview?.archive_format === "zip" ? "ZIP" : "PDF"} só com boletos já emitidos — sem nova cobrança no provedor.`}
        </Text>
      </View>

      {renderOptionToggle(
        "Exigir todas as parcelas selecionadas",
        "Se alguma falhar, o carnê inteiro não é baixado (recomendado).",
        requireAll,
        () => setRequireAll((v) => !v)
      )}
      {renderOptionToggle(
        "Emitir faltantes no provedor",
        "Parcelas sem boleto serão emitidas na Cora ao gerar (comportamento antigo).",
        issueMissing,
        () => setIssueMissing((v) => !v)
      )}

      {preview && preview.invoices.length > 0 ? (
        <Text className="text-xs text-gray-600 mb-2 px-1">
          {`${preview.ready_for_bundle_count ?? 0} com boleto pronto · ${preview.invoices.length - (preview.ready_for_bundle_count ?? 0)} aguardando emissão`}
        </Text>
      ) : null}

      {excluded.length > 0 ? (
        <AccordionSection
          title="Não entram no carnê"
          badge={String(excluded.length)}
          expanded={openSections.excluded}
          onToggle={() => toggleSection("excluded")}
          tone="amber"
          maxBodyHeight={200}
        >
          {excluded.map(renderExcludedRow)}
        </AccordionSection>
      ) : null}

      {!preview || preview.invoices.length === 0 ? (
        <View className="py-8 items-center gap-2">
          <Ionicons name="document-outline" size={32} color="#D1D5DB" />
          <Text className="text-sm text-gray-500 text-center px-4">
            {excluded.length > 0
              ? "Não há cobranças aptas. Abra a seção acima para ver o motivo de cada uma."
              : "Não há cobranças nesta matrícula para o carnê."}
          </Text>
        </View>
      ) : (
        <AccordionSection
          title={`Aptas — ${studentLabel}`}
          badge={`${selectedIds.length}/${preview.invoices.length}`}
          expanded={openSections.eligible}
          onToggle={() => toggleSection("eligible")}
          tone="violet"
          maxBodyHeight={280}
          headerAction={
            <TouchableOpacity
              onPress={() => toggleAll(selectedIds.length !== preview.invoices.length)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text className="text-[10px] font-bold text-violet-700">
                {selectedIds.length === preview.invoices.length ? "Desmarcar" : "Marcar"}
              </Text>
            </TouchableOpacity>
          }
        >
          {preview.invoices.map((inv) => renderEligibleRow(inv, true))}
        </AccordionSection>
      )}
    </>
  );

  const renderConfirmStep = () => (
    <>
      <View className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
        <Text className="text-sm font-semibold text-amber-900">Confirme a geração</Text>
        <Text className="text-xs text-amber-800 mt-0.5" numberOfLines={2}>
          {`${selectedIds.length} parcela(s) · ${
            preview?.archive_format === "zip" ? "ZIP para impressão" : "PDF único"
          }${issueMissing ? " · com emissão no provedor" : " · só boletos existentes"}`}
        </Text>
      </View>

      {excluded.length > 0 ? (
        <AccordionSection
          title="Excluídas do carnê"
          badge={String(excluded.length)}
          expanded={openSections.confirmExcluded}
          onToggle={() => toggleSection("confirmExcluded")}
          tone="amber"
          maxBodyHeight={140}
        >
          {excluded.map(renderExcludedRow)}
        </AccordionSection>
      ) : null}

      <AccordionSection
        title={`Serão geradas — ${studentLabel}`}
        badge={String(selectedIds.length)}
        expanded={openSections.confirmSelected}
        onToggle={() => toggleSection("confirmSelected")}
        tone="emerald"
        maxBodyHeight={220}
      >
        {selectedInvoices.map((inv) => renderEligibleRow(inv, false))}
      </AccordionSection>
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
              ? "Confirmar ZIP"
              : "Confirmar PDF"}
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
