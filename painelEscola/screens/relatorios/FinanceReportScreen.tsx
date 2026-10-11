import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, RefreshCw, Search, TriangleAlert } from "lucide-react-native";
import api from "../../services/api";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Icon from "../../components/ui/Icon";
import Tabs from "../../components/ui/Tabs";
import Modal from "../../components/ui/Modal";
import ToastBanner from "../../components/ui/ToastBanner";
import ActionsMenu from "../../components/ui/ActionsMenu";
import DataTableRow from "../../components/ui/DataTableRow";
import DatePickerInput from "../../components/ui/DatePickerInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import FilterChip, { ChipDivider } from "../../components/ui/FilterChip";
import FinancePdfExportModal from "../../components/finance/FinancePdfExportModal";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  domainToOptions,
  useInvoiceStatuses,
  useInvoiceTypes,
  usePaymentMethods,
} from "../../hooks/useDomains";
import {
  fetchAllFinanceReportItems,
  fetchFinanceReport,
  type FinanceReport,
  type FinanceReportQuery,
  type FinanceReportStatus,
} from "../../services/financeReport";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import { paymentMethodLabel } from "../../utils/paymentMethods";
import {
  FINANCE_PDF_MODELS,
  exportFinanceCsv,
  exportFinancePdf,
  formatBrl,
  formatIsoDate,
  statusTotals,
  type FinanceExportLabels,
  type FinancePdfModel,
  type FinancePdfOptions,
} from "../../utils/financeReportExport";
import { color, type Tone } from "../../constants/theme";
import { TABLE_HEADER_CELL } from "../../components/ui/dataTableStyles";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const PER_PAGE = 20;

const STATUS_TONE: Record<string, Tone> = {
  paid: "success",
  pending: "warning",
  overdue: "danger",
  cancelled: "neutral",
};

const DATE_BASIS = [
  { value: "due_date", label: "Vencimento" },
  { value: "paid_at", label: "Pagamento" },
  { value: "created_at", label: "Emissão" },
];

/** Chips da tabela de cobranças (mesmo estado do filtro "Situação"). */
const STATUS_CHIPS = [
  { value: "", label: "Todas" },
  { value: "pending", label: "A receber" },
  { value: "paid", label: "Recebidas" },
  { value: "overdue", label: "Vencidas" },
];

type DistributionTab = "turma" | "forma" | "tipo";

const isoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const monthsAgoStart = (months: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  return isoDate(date);
};

const PRESETS = [
  { key: "mes", label: "Este mês", from: () => monthsAgoStart(0) },
  { key: "3m", label: "3 meses", from: () => monthsAgoStart(2) },
  { key: "6m", label: "6 meses", from: () => monthsAgoStart(5) },
  { key: "ano", label: "Este ano", from: () => `${new Date().getFullYear()}-01-01` },
];

const amountOf = (value: string | number | undefined) => (typeof value === "number" ? value : parseFloat(value ?? "0") || 0);

const pctLabel = (part: number, total: number) =>
  `${(total > 0 ? (part / total) * 100 : 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Célula numérica/monoespaçada alinhada. */
function Mono({ children, style, tone = "ink" }: { children: React.ReactNode; style?: object; tone?: "ink" | "muted" | "subtle" | "danger" }) {
  const cls = { ink: "text-ink", muted: "text-ink-muted", subtle: "text-ink-subtle", danger: "text-danger" }[tone];
  return (
    <Text className={`font-mono ${cls}`} style={[{ fontSize: 13, lineHeight: 20 }, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

export default function FinanceReportScreen({ navigate }: Props) {
  const { contentPadding, isMobile, width } = useResponsiveLayout();
  const twoColumns = width >= 1100;
  const invoiceStatuses = useInvoiceStatuses();
  const invoiceTypes = useInvoiceTypes();
  const paymentMethods = usePaymentMethods();

  const [dateBasis, setDateBasis] = useState("due_date");
  const [dateFromDisplay, setDateFromDisplay] = useState(() => isoToDisplay(monthsAgoStart(5)));
  const [dateToDisplay, setDateToDisplay] = useState(() => isoToDisplay(isoDate(new Date())));
  const [status, setStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [invoiceType, setInvoiceType] = useState("");
  const [courseId, setCourseId] = useState("");
  const [schoolClassId, setSchoolClassId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [courseOptions, setCourseOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [classOptions, setClassOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [report, setReport] = useState<FinanceReport | null>(null);
  /** Contagens por situação sem o filtro de situação (para os chips da tabela). */
  const [statusCounts, setStatusCounts] = useState<FinanceReportStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [distTab, setDistTab] = useState<DistributionTab>("turma");
  const [pdfModel, setPdfModel] = useState<FinancePdfModel | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });

  const statusLabels = useMemo(
    () => Object.fromEntries(domainToOptions(invoiceStatuses).map((option) => [option.value, option.label])),
    [invoiceStatuses]
  );
  const typeLabels = useMemo(
    () => Object.fromEntries(domainToOptions(invoiceTypes).map((option) => [option.value, option.label])),
    [invoiceTypes]
  );

  const dateFrom = dateFromDisplay.trim() === "" ? "" : displayToISO(dateFromDisplay);
  const dateTo = dateToDisplay.trim() === "" ? "" : displayToISO(dateToDisplay);
  const dateIncomplete =
    (dateFromDisplay.trim() !== "" && !dateFrom) || (dateToDisplay.trim() !== "" && !dateTo);

  const periodError = useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    if (dateTo < dateFrom) return "A data final deve ser maior ou igual à data inicial.";
    return null;
  }, [dateFrom, dateTo]);

  // Busca com debounce.
  useEffect(() => {
    if (searchText === search) return;
    const timer = setTimeout(() => {
      setSearch(searchText);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, search]);

  const loadCourses = useCallback(async () => {
    try {
      const { data } = await api.get("/courses", { params: { per_page: 500, status: "active" } });
      const list = Array.isArray(data?.data) ? data.data : [];
      setCourseOptions(
        list
          .filter((item: { id?: number; name?: string }) => Number(item?.id) > 0)
          .map((item: { id: number; name?: string }) => ({ id: Number(item.id), name: String(item.name ?? `Curso #${item.id}`) }))
      );
    } catch {
      setCourseOptions([]);
    }
  }, []);

  const loadClasses = useCallback(async () => {
    try {
      const params: Record<string, number> = { per_page: 500 };
      if (courseId) params.course_id = Number(courseId);
      const { data } = await api.get("/school-classes", { params });
      const list = Array.isArray(data?.data) ? data.data : [];
      setClassOptions(
        list
          .filter((item: { id?: number }) => Number(item?.id) > 0)
          .map((item: { id: number; name?: string }) => ({ id: Number(item.id), name: String(item.name ?? `Turma #${item.id}`) }))
      );
    } catch {
      setClassOptions([]);
    }
  }, [courseId]);

  /** Filtros do recorte (sem paginação): os mesmos na tela, no PDF e no Excel. */
  const query = useMemo<Omit<FinanceReportQuery, "page" | "per_page">>(
    () => ({
      date_basis: dateBasis,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      status: status || undefined,
      payment_method: paymentMethod || undefined,
      type: invoiceType || undefined,
      school_class_id: schoolClassId ? Number(schoolClassId) : undefined,
      course_id: courseId ? Number(courseId) : undefined,
      search: search.trim() || undefined,
    }),
    [courseId, dateBasis, dateFrom, dateTo, invoiceType, paymentMethod, schoolClassId, search, status]
  );

  const loadReport = useCallback(async () => {
    if (periodError || dateIncomplete) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFinanceReport({ ...query, page, per_page: PER_PAGE });
      setReport(data);
      if (!query.status) setStatusCounts(data.by_status);
    } catch (err) {
      setReport(null);
      setError(getApiErrorMessage(err, "Não foi possível carregar o relatório financeiro."));
    } finally {
      setLoading(false);
    }
  }, [dateIncomplete, page, periodError, query]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const today = isoDate(new Date());
  const activePreset = PRESETS.find((preset) => dateFrom === preset.from() && dateTo === today)?.key ?? null;
  const applyPreset = (from: string) => {
    setDateFromDisplay(isoToDisplay(from));
    setDateToDisplay(isoToDisplay(today));
    setPage(1);
  };

  const withPage1 = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  // ── Textos do recorte ──────────────────────────────────────────────────────
  const basisLabel = DATE_BASIS.find((item) => item.value === dateBasis)?.label ?? "Vencimento";
  const courseName = courseOptions.find((c) => String(c.id) === courseId)?.name;
  const className = classOptions.find((c) => String(c.id) === schoolClassId)?.name;
  const periodText =
    dateFrom && dateTo
      ? `entre ${isoToDisplay(dateFrom)} e ${isoToDisplay(dateTo)}`
      : dateFrom
        ? `a partir de ${isoToDisplay(dateFrom)}`
        : dateTo
          ? `até ${isoToDisplay(dateTo)}`
          : "em qualquer data";
  const whereText = className ? `turma ${className}` : courseName ? `curso ${courseName}` : "todos os cursos e turmas";
  const description = `Cobranças com ${basisLabel.toLowerCase()} ${periodText} · ${whereText}.`;
  const extraFilters = [
    status ? `situação ${(statusLabels[status] ?? status).toLowerCase()}` : null,
    paymentMethod ? `forma ${paymentMethodLabel(paymentMethod)}` : null,
    invoiceType ? `tipo ${typeLabels[invoiceType] ?? invoiceType}` : null,
    search.trim() ? `busca "${search.trim()}"` : null,
  ].filter(Boolean);
  const exportScope = [`${basisLabel} ${periodText}`, whereText, ...extraFilters, report ? `${report.totals.count} ${report.totals.count === 1 ? "cobrança" : "cobranças"}` : null]
    .filter(Boolean)
    .join(" · ");

  const exportLabels: FinanceExportLabels = {
    scope: exportScope,
    status: (slug) => statusLabels[slug] ?? slug,
    paymentMethod: (slug) => (slug ? paymentMethodLabel(slug) : "Não informada"),
    type: (slug) => (slug ? typeLabels[slug] ?? slug : "Não informado"),
  };

  // ── Exportações ────────────────────────────────────────────────────────────
  const ensureWeb = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") return true;
    setToast({ visible: true, type: "error", message: "Exportação disponível apenas na versão web." });
    return false;
  };

  const runPdf = async (options: FinancePdfOptions) => {
    if (!report || !ensureWeb()) return;
    setExporting("pdf");
    try {
      const items = options.model === "resumo" ? [] : await fetchAllFinanceReportItems(query);
      await exportFinancePdf(report, items, exportLabels, options);
      setPdfModel(null);
    } catch (err) {
      setToast({ visible: true, type: "error", message: getApiErrorMessage(err, "Não foi possível gerar o PDF.") });
    } finally {
      setExporting(null);
    }
  };

  const runCsv = async () => {
    if (!report || !ensureWeb()) return;
    setExporting("csv");
    try {
      exportFinanceCsv(await fetchAllFinanceReportItems(query), exportLabels);
    } catch (err) {
      setToast({ visible: true, type: "error", message: getApiErrorMessage(err, "Não foi possível gerar a planilha.") });
    } finally {
      setExporting(null);
    }
  };

  // ── Dados derivados ────────────────────────────────────────────────────────
  const total = amountOf(report?.totals.amount);
  const totals = report ? statusTotals(report) : null;
  const noMethod = report?.by_payment_method.find((row) => !row.key && row.count > 0);
  const chipCount = (value: string) =>
    value === "" ? statusCounts.reduce((sum, row) => sum + row.count, 0) : statusCounts.find((row) => row.key === value)?.count ?? 0;

  const distribution = useMemo(() => {
    if (!report) return [];
    if (distTab === "turma") return report.by_class.map((row) => ({ key: String(row.school_class_id ?? "none"), name: row.name, count: row.count, amount: amountOf(row.amount) }));
    if (distTab === "forma")
      return report.by_payment_method.map((row) => ({ key: String(row.key ?? "none"), name: row.key ? paymentMethodLabel(row.key) : "Não informada", count: row.count, amount: amountOf(row.amount) }));
    return report.by_type.map((row) => ({ key: String(row.key ?? "none"), name: row.key ? typeLabels[row.key] ?? row.key : "Não informado", count: row.count, amount: amountOf(row.amount) }));
  }, [distTab, report, typeLabels]);
  const distMax = Math.max(1, ...distribution.map((row) => row.amount));

  const summary = totals
    ? [
        { key: "total", label: "Total no recorte", amount: total, count: report!.totals.count, swatch: null },
        { key: "paid", label: "Recebido", amount: totals.paid.amount, count: totals.paid.count, swatch: color.success },
        { key: "pending", label: "A receber", amount: totals.pending.amount, count: totals.pending.count, swatch: color.warning },
        { key: "overdue", label: "Vencido", amount: totals.overdue.amount, count: totals.overdue.count, swatch: color.danger },
      ]
    : [];

  const meta = report?.meta;
  const rangeStart = meta && meta.total > 0 ? (meta.current_page - 1) * meta.per_page + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.current_page * meta.per_page, meta.total) : 0;

  const COLS = { klass: 1, due: 104, paid: 104, status: 112, amount: 120 };

  return (
    <>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, gap: 16 }}>
        <View style={{ zIndex: 30 }}>
          <PageHeader
            title="Relatório financeiro"
            description={description}
            actions={
              <>
                <Button variant="ghost" label="Gestão de pagamentos" onPress={() => navigate("cobrancas")} />
                <Button
                  icon={FileSpreadsheet}
                  label={exporting === "csv" ? "Gerando..." : "Excel"}
                  loading={exporting === "csv"}
                  disabled={!report || !!exporting}
                  onPress={() => void runCsv()}
                />
                <ActionsMenu
                  heading="Gerar PDF do recorte atual"
                  minWidth={300}
                  align={isMobile ? "left" : "right"}
                  renderTrigger={({ toggle, open }) => (
                    <TouchableOpacity
                      onPress={toggle}
                      disabled={!report}
                      role="button"
                      aria-haspopup="menu"
                      aria-expanded={open}
                      className="flex-row items-center rounded-ds-md bg-brand border border-brand min-h-control-md"
                      style={{ gap: 8, paddingHorizontal: 16, opacity: report ? 1 : 0.45 }}
                    >
                      <Icon icon={FileText} color={color["on-brand"]} />
                      <Text className="font-medium text-on-brand" style={{ fontSize: 14 }}>
                        Exportar PDF
                      </Text>
                      <Icon icon={ChevronDown} color={color["on-brand"]} />
                    </TouchableOpacity>
                  )}
                  items={FINANCE_PDF_MODELS.map((model) => ({
                    key: model.key,
                    label: model.title,
                    description: `${model.pages} · ${model.description}`,
                    icon: FileText,
                    onPress: () => setPdfModel(model.key),
                  }))}
                />
              </>
            }
          />
        </View>

        {/* Filtros numa faixa */}
        <View
          role="group"
          aria-label="Filtros"
          className="flex-row flex-wrap items-center bg-surface border border-border rounded-ds-md"
          style={{ gap: 8, padding: 12 }}
        >
          <View role="radiogroup" aria-label="Período" className="flex-row border border-border-strong rounded-ds-md overflow-hidden" style={{ height: 32 }}>
            {PRESETS.map((preset, i) => {
              const on = activePreset === preset.key;
              return (
                <TouchableOpacity
                  key={preset.key}
                  role="radio"
                  aria-checked={on}
                  onPress={() => applyPreset(preset.from())}
                  className={on ? "bg-surface-sunken" : "bg-surface"}
                  style={{ paddingHorizontal: 12, justifyContent: "center", borderLeftWidth: i ? 1 : 0, borderLeftColor: color["border-strong"] }}
                >
                  <Text className={`font-medium ${on ? "text-ink" : "text-ink-muted"}`} style={{ fontSize: 13 }}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            onPress={() => setRangeOpen(true)}
            role="button"
            aria-label={`Período por ${basisLabel.toLowerCase()}: ${dateFromDisplay || "início"} a ${dateToDisplay || "hoje"}. Alterar`}
            className={`flex-row items-center bg-surface border rounded-ds-md ${periodError ? "border-danger" : "border-border-strong"}`}
            style={{ gap: 8, height: 32, paddingHorizontal: 10 }}
          >
            <Icon icon={Calendar} color={color["ink-muted"]} />
            <Text className="text-ink-subtle" style={{ fontSize: 12 }}>
              {basisLabel}
            </Text>
            <Text className="font-mono text-ink" style={{ fontSize: 13 }}>
              {dateFromDisplay || "…"} → {dateToDisplay || "…"}
            </Text>
          </TouchableOpacity>
          <ChipDivider />
          <FilterChip
            label="Situação"
            options={domainToOptions(invoiceStatuses).map((option) => ({ value: String(option.value), label: option.label }))}
            value={status}
            onChange={withPage1(setStatus)}
          />
          <FilterChip
            label="Forma"
            modalTitle="Filtrar por forma de pagamento"
            options={domainToOptions(paymentMethods).map((option) => ({ value: String(option.value), label: option.label }))}
            value={paymentMethod}
            onChange={withPage1(setPaymentMethod)}
          />
          <FilterChip
            label="Tipo"
            modalTitle="Filtrar por tipo de cobrança"
            options={domainToOptions(invoiceTypes).map((option) => ({ value: String(option.value), label: option.label }))}
            value={invoiceType}
            onChange={withPage1(setInvoiceType)}
          />
          <FilterChip
            label="Curso"
            options={courseOptions.map((course) => ({ value: String(course.id), label: course.name }))}
            value={courseId}
            onChange={(value) => {
              setCourseId(value);
              setSchoolClassId("");
              setPage(1);
            }}
          />
          <FilterChip
            label="Turma"
            options={classOptions.map((schoolClass) => ({ value: String(schoolClass.id), label: schoolClass.name }))}
            value={schoolClassId}
            onChange={withPage1(setSchoolClassId)}
          />
        </View>
        {periodError ? <Text className="text-sm text-danger">{periodError}</Text> : null}

        {loading && !report ? (
          <View className="py-16 items-center">
            <ActivityIndicator size="large" color={color.brand} />
          </View>
        ) : error && !report ? (
          <Panel>
            <Text className="text-sm text-danger" style={{ marginBottom: 12 }}>
              {error}
            </Text>
            <Button icon={RefreshCw} label="Tentar novamente" onPress={() => void loadReport()} />
          </Panel>
        ) : report && totals ? (
          <>
            {/* Resumo + recebimento */}
            <View className="bg-surface border border-border rounded-ds-md" style={{ opacity: loading ? 0.6 : 1 }}>
              <View style={{ flexDirection: isMobile ? "column" : "row" }}>
                {summary.map((card, i) => (
                  <View
                    key={card.key}
                    style={{
                      flex: i === 0 ? 1.25 : 1,
                      paddingVertical: 16,
                      paddingHorizontal: 20,
                      borderLeftWidth: !isMobile && i > 0 ? 1 : 0,
                      borderTopWidth: isMobile && i > 0 ? 1 : 0,
                      borderColor: color.border,
                    }}
                  >
                    <View className="flex-row items-center" style={{ gap: 6 }}>
                      {card.swatch ? <View style={{ width: 8, height: 8, backgroundColor: card.swatch }} /> : null}
                      <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>
                        {card.label}
                      </Text>
                    </View>
                    <Text className="font-mono font-semibold text-ink" style={{ fontSize: 24, lineHeight: 32, letterSpacing: -0.24, marginTop: 4 }} numberOfLines={1}>
                      {formatBrl(card.amount)}
                    </Text>
                    <Text className={card.key === "overdue" && card.count > 0 ? "text-warning" : "text-ink-subtle"} style={{ fontSize: 12, lineHeight: 16 }}>
                      {card.count.toLocaleString("pt-BR")} {card.count === 1 ? "cobrança" : "cobranças"}
                    </Text>
                  </View>
                ))}
              </View>
              <View
                className="border-t border-border"
                style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 8 : 16, paddingVertical: 16, paddingHorizontal: 20 }}
              >
                <Text className="font-medium text-ink" style={{ fontSize: 13 }}>
                  Recebimento do período
                </Text>
                <View
                  role="img"
                  aria-label={`Recebido ${pctLabel(totals.paid.amount, total)}, a receber ${pctLabel(totals.pending.amount, total)}, vencido ${pctLabel(totals.overdue.amount, total)}`}
                  className="flex-row"
                  style={{ flex: isMobile ? undefined : 1, height: 12, gap: 2, backgroundColor: total > 0 ? undefined : color["surface-sunken"] }}
                >
                  {([
                    [totals.paid.amount, color.success],
                    [totals.pending.amount, color.warning],
                    [totals.overdue.amount, color.danger],
                  ] as [number, string][])
                    .filter(([amount]) => amount > 0)
                    .map(([amount, fill], i) => (
                      <View key={i} style={{ width: `${(amount / Math.max(total, 1)) * 100}%`, height: "100%", backgroundColor: fill }} />
                    ))}
                </View>
                <Text className="font-mono font-semibold text-ink" style={{ fontSize: 13 }}>
                  {pctLabel(totals.paid.amount, total)} recebido
                </Text>
              </View>
            </View>

            {/* Distribuição + lateral */}
            <View style={{ flexDirection: twoColumns ? "row" : "column", gap: 16, alignItems: twoColumns ? "flex-start" : "stretch" }}>
              <View className="bg-surface border border-border rounded-ds-md overflow-hidden" style={{ flex: twoColumns ? 1 : undefined, minWidth: 0 }}>
                <View style={{ paddingTop: 16, paddingHorizontal: 20 }}>
                  <Text role="heading" aria-level={2} className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 24 }}>
                    Distribuição
                  </Text>
                  <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18, marginTop: 2 }}>
                    Onde está o valor do recorte.
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
                  <Tabs<DistributionTab>
                    accessibilityLabel="Distribuição do valor"
                    value={distTab}
                    onChange={setDistTab}
                    items={[
                      { id: "turma", label: "Por turma", count: report.by_class.length },
                      { id: "forma", label: "Por forma de pagamento", count: report.by_payment_method.length },
                      { id: "tipo", label: "Por tipo", count: report.by_type.length },
                    ]}
                  />
                </View>
                <View className="flex-row items-center bg-surface-sunken border-b border-border" style={{ gap: 16, paddingVertical: 8, paddingHorizontal: 20 }}>
                  <Text className={TABLE_HEADER_CELL} style={{ flex: 1 }}>
                    {distTab === "turma" ? "Turma" : distTab === "forma" ? "Forma" : "Tipo"}
                  </Text>
                  {!isMobile && (
                    <Text className={TABLE_HEADER_CELL} style={{ width: 120 }}>
                      Valor relativo
                    </Text>
                  )}
                  <Text className={TABLE_HEADER_CELL} style={{ width: 80, textAlign: "right" }}>
                    Cobranças
                  </Text>
                  <Text className={TABLE_HEADER_CELL} style={{ width: 110, textAlign: "right" }}>
                    Valor
                  </Text>
                </View>
                {distribution.length === 0 ? (
                  <Text className="text-sm text-ink-subtle" style={{ padding: 20 }}>
                    Nenhum valor neste recorte.
                  </Text>
                ) : (
                  distribution.map((row, i) => (
                    <View
                      key={`${row.key}-${i}`}
                      className={`flex-row items-center ${i < distribution.length - 1 ? "border-b border-border" : ""}`}
                      style={{ gap: 16, paddingVertical: 10, paddingHorizontal: 20 }}
                    >
                      <Text className="text-ink" style={{ flex: 1, fontSize: 14, lineHeight: 20 }} numberOfLines={1}>
                        {row.name}
                      </Text>
                      {!isMobile && (
                        <View className="bg-surface-sunken border border-border" style={{ width: 120, height: 6 }}>
                          <View style={{ width: `${(row.amount / distMax) * 100}%`, height: "100%", backgroundColor: color.brand }} />
                        </View>
                      )}
                      <Mono tone="muted" style={{ width: 80, textAlign: "right" }}>
                        {row.count.toLocaleString("pt-BR")}
                      </Mono>
                      <Mono style={{ width: 110, textAlign: "right", fontWeight: "500" }}>{formatBrl(row.amount)}</Mono>
                    </View>
                  ))
                )}
              </View>

              <View style={{ width: twoColumns ? 340 : undefined, gap: 16 }}>
                {noMethod ? (
                  <View role="note" className="flex-row bg-surface border border-border rounded-ds-md" style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16 }}>
                    <View style={{ marginTop: 1 }}>
                      <Icon icon={TriangleAlert} size={20} color={color.warning} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text className="font-semibold text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                        {noMethod.count} {noMethod.count === 1 ? "cobrança sem forma de pagamento" : "cobranças sem forma de pagamento"}
                      </Text>
                      <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>
                        {formatBrl(noMethod.amount)} {noMethod.count === 1 ? "aparece" : "aparecem"} como "não informada". Defina a forma em{" "}
                        <Text className="text-brand underline" onPress={() => navigate("configuracoes-cobranca")}>
                          Regras de cobrança
                        </Text>{" "}
                        para o relatório ficar completo.
                      </Text>
                    </View>
                  </View>
                ) : null}

                <Panel title="Relatórios em PDF" description="Gerados com os filtros acima." flush>
                  {FINANCE_PDF_MODELS.map((model, i) => (
                    <DataTableRow
                      key={model.key}
                      index={i}
                      onPress={() => setPdfModel(model.key)}
                      style={{ paddingVertical: 10, paddingHorizontal: 24, gap: 10, alignItems: "center", borderBottomWidth: i < FINANCE_PDF_MODELS.length - 1 ? 1 : 0 }}
                    >
                      <View
                        aria-hidden
                        className="bg-surface border border-border-strong items-center justify-end"
                        style={{ width: 28, height: 34, paddingBottom: 3 }}
                      >
                        <Text className="font-mono font-semibold text-ink-muted" style={{ fontSize: 8 }}>
                          PDF
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text className="font-medium text-ink" style={{ fontSize: 14, lineHeight: 18 }}>
                          {model.title}
                        </Text>
                        <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                          {model.description}
                        </Text>
                      </View>
                      <Icon icon={ChevronRight} color={color["ink-subtle"]} />
                    </DataTableRow>
                  ))}
                </Panel>
              </View>
            </View>

            {/* Cobranças */}
            <Panel
              title="Cobranças"
              description={`${report.meta.total.toLocaleString("pt-BR")} no recorte, por ${basisLabel.toLowerCase()} (mais recentes primeiro).`}
              actions={<Button size="sm" icon={FileText} label="PDF desta lista" onPress={() => setPdfModel("lista")} />}
              flush
            >
              <View
                className="border-b border-border"
                style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20 }}
              >
                <View className="flex-row flex-wrap" style={{ gap: 4 }} role="radiogroup" aria-label="Situação">
                  {STATUS_CHIPS.map((chip) => {
                    const on = status === chip.value;
                    return (
                      <TouchableOpacity
                        key={chip.value || "all"}
                        role="radio"
                        aria-checked={on}
                        onPress={() => withPage1(setStatus)(chip.value)}
                        className={`flex-row items-center rounded-ds-md ${on ? "bg-brand-tint" : ""}`}
                        style={{ gap: 6, height: 30, paddingHorizontal: 10 }}
                      >
                        <Text className={`font-medium ${on ? "text-brand" : "text-ink-muted"}`} style={{ fontSize: 13 }}>
                          {chip.label}
                        </Text>
                        <Text className={`font-mono ${on ? "text-brand" : "text-ink-muted"}`} style={{ fontSize: 12 }}>
                          {chipCount(chip.value).toLocaleString("pt-BR")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View
                  className="flex-row items-center bg-surface border border-border-strong rounded-ds-md"
                  style={{ height: 32, paddingHorizontal: 10, width: isMobile ? "100%" : 260, marginLeft: isMobile ? 0 : "auto" }}
                >
                  <Icon icon={Search} color={color["ink-subtle"]} />
                  <TextInput
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Aluno ou descrição"
                    placeholderTextColor={color["ink-subtle"]}
                    aria-label="Buscar cobrança"
                    className="flex-1 text-ink"
                    style={{ marginLeft: 8, fontSize: 13, height: 30 }}
                  />
                </View>
              </View>

              <ScrollView horizontal={isMobile} contentContainerStyle={{ width: isMobile ? undefined : "100%" }}>
                <View style={{ width: "100%", minWidth: isMobile ? 760 : undefined, opacity: loading ? 0.6 : 1 }}>
                  <View className="flex-row items-center bg-surface-sunken border-b border-border" style={{ gap: 12, paddingVertical: 8, paddingHorizontal: 20 }}>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4 }}>
                      Aluno
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ flex: COLS.klass }}>
                      Turma
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ width: COLS.due }}>
                      Vencimento
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ width: COLS.paid }}>
                      Pagamento
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ width: COLS.status }}>
                      Situação
                    </Text>
                    <Text className={TABLE_HEADER_CELL} style={{ width: COLS.amount, textAlign: "right" }}>
                      Valor
                    </Text>
                  </View>
                  {report.items.length === 0 ? (
                    <Text className="text-sm text-ink-subtle" style={{ paddingVertical: 20, paddingHorizontal: 20 }}>
                      Nenhuma cobrança encontrada.
                    </Text>
                  ) : (
                    report.items.map((item, i) => (
                      <DataTableRow key={item.id} index={i} style={{ gap: 12, paddingVertical: 9, paddingHorizontal: 20, alignItems: "center" }}>
                        <View style={{ flex: 1.4, minWidth: 0 }}>
                          <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>
                            {item.student_name ?? "—"}
                          </Text>
                          <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                            {item.description}
                          </Text>
                        </View>
                        <Text className="text-ink" style={{ flex: COLS.klass, fontSize: 14, lineHeight: 20 }} numberOfLines={1}>
                          {item.school_class_name ?? "—"}
                        </Text>
                        <Mono tone={item.status === "overdue" ? "danger" : "ink"} style={{ width: COLS.due }}>
                          {formatIsoDate(item.due_date)}
                        </Mono>
                        <Mono tone={item.paid_at ? "ink" : "subtle"} style={{ width: COLS.paid }}>
                          {formatIsoDate(item.paid_at)}
                        </Mono>
                        <View style={{ width: COLS.status, alignItems: "flex-start" }}>
                          <Badge tone={STATUS_TONE[item.status] ?? "neutral"} dot label={statusLabels[item.status] ?? item.status} />
                        </View>
                        <Mono style={{ width: COLS.amount, textAlign: "right", fontWeight: "500" }}>{formatBrl(item.amount)}</Mono>
                      </DataTableRow>
                    ))
                  )}
                  {report.items.length > 0 && (
                    <View className="flex-row items-center bg-surface-sunken" style={{ gap: 12, paddingVertical: 10, paddingHorizontal: 20 }}>
                      <Text className="font-medium text-ink" style={{ flex: 1, fontSize: 13 }}>
                        Total do recorte · {report.totals.count.toLocaleString("pt-BR")} {report.totals.count === 1 ? "cobrança" : "cobranças"}
                      </Text>
                      <Mono style={{ width: COLS.amount, textAlign: "right", fontWeight: "600" }}>{formatBrl(total)}</Mono>
                    </View>
                  )}
                </View>
              </ScrollView>

              {meta && meta.total > 0 && (
                <View className="flex-row items-center border-t border-border" style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 20 }}>
                  <Text className="text-ink-muted" style={{ fontSize: 13 }} aria-live="polite">
                    {rangeStart}–{rangeEnd} de {meta.total.toLocaleString("pt-BR")}
                  </Text>
                  {meta.last_page > 1 && (
                    <View role="navigation" aria-label="Paginação" className="flex-row items-center" style={{ gap: 8, marginLeft: "auto" }}>
                      <Button size="sm" iconOnly icon={ChevronLeft} accessibilityLabel="Página anterior" disabled={meta.current_page <= 1} onPress={() => setPage(meta.current_page - 1)} />
                      <Mono>
                        {meta.current_page} / {meta.last_page}
                      </Mono>
                      <Button
                        size="sm"
                        iconOnly
                        icon={ChevronRight}
                        accessibilityLabel="Próxima página"
                        disabled={meta.current_page >= meta.last_page}
                        onPress={() => setPage(meta.current_page + 1)}
                      />
                    </View>
                  )}
                </View>
              )}
            </Panel>
          </>
        ) : null}
      </ScrollView>

      <Modal
        visible={rangeOpen}
        title="Período"
        onClose={() => setRangeOpen(false)}
        size="sm"
        compact
        footer={<Button variant="primary" label="Concluir" onPress={() => setRangeOpen(false)} disabled={!!periodError || dateIncomplete} />}
      >
        <View style={{ gap: 4 }}>
          <SearchableSelect
            dense
            label="Data de referência"
            modalTitle="Data de referência"
            showSelectedPreview={false}
            value={dateBasis}
            options={DATE_BASIS}
            onChange={(value) => {
              setDateBasis(value || "due_date");
              setPage(1);
            }}
          />
          <View className="flex-row" style={{ gap: 12 }}>
            <View style={{ flex: 1 }}>
              <DatePickerInput label="De" value={dateFromDisplay} onChangeText={withPage1(setDateFromDisplay)} />
            </View>
            <View style={{ flex: 1 }}>
              <DatePickerInput label="Até" value={dateToDisplay} onChangeText={withPage1(setDateToDisplay)} />
            </View>
          </View>
          {periodError ? <Text className="text-sm text-danger">{periodError}</Text> : null}
        </View>
      </Modal>

      <FinancePdfExportModal
        model={pdfModel}
        scope={exportScope}
        exporting={exporting === "pdf"}
        onClose={() => setPdfModel(null)}
        onExport={(options) => void runPdf(options)}
      />

      <ToastBanner
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </>
  );
}
