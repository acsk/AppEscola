import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RefreshCw } from "lucide-react-native";
import api from "../../services/api";
import PageHeader from "../../components/ui/PageHeader";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Pagination from "../../components/ui/Pagination";
import DatePickerInput from "../../components/ui/DatePickerInput";
import SearchableSelect from "../../components/ui/SearchableSelect";
import FinanceMonthChart from "../../components/dashboard/FinanceMonthChart";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  domainToOptions,
  useInvoiceStatuses,
  useInvoiceTypes,
  usePaymentMethods,
} from "../../hooks/useDomains";
import {
  fetchFinanceReport,
  type FinanceReport,
  type FinanceReportBucket,
  type FinanceReportClass,
} from "../../services/financeReport";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../utils/masks";
import { paymentMethodLabel } from "../../utils/paymentMethods";
import { color, type Tone } from "../../constants/theme";
import {
  TABLE_CELL,
  TABLE_CELL_MUTED,
  TABLE_CELL_SEMIBOLD,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

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

const BASIS_SERIES: Record<string, string> = {
  due_date: "No vencimento",
  paid_at: "No pagamento",
  created_at: "Na emissão",
};

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

const formatBrl = (value: string | number) =>
  (typeof value === "string" ? parseFloat(value) : value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  return isoToDisplay(day) || day;
};

function BreakdownList({
  rows,
  labelFor,
}: {
  rows: Array<FinanceReportBucket | FinanceReportClass>;
  labelFor: (row: FinanceReportBucket | FinanceReportClass) => string;
}) {
  const max = Math.max(1, ...rows.map((row) => parseFloat(row.amount) || 0));
  if (rows.length === 0) {
    return <Text className="text-sm text-ink-subtle">Nenhum valor neste recorte.</Text>;
  }

  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, index) => {
        const amount = parseFloat(row.amount) || 0;
        const name = labelFor(row);
        const key = "key" in row ? String(row.key ?? "empty") : String(row.school_class_id ?? "none");
        return (
          <View key={`${key}-${index}`} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text className="text-sm text-ink" style={{ flex: 1 }} numberOfLines={1}>
                {name}
              </Text>
              <Text className="font-mono text-ink" style={{ fontSize: 13 }}>
                {formatBrl(amount)}
              </Text>
            </View>
            <View className="bg-surface-sunken rounded-ds-sm overflow-hidden" style={{ height: 6 }}>
              <View style={{ width: `${Math.max((amount / max) * 100, amount > 0 ? 2 : 0)}%`, height: 6, backgroundColor: color.brand }} />
            </View>
            <Text className="text-xs text-ink-subtle">{row.count.toLocaleString("pt-BR")} cobranças</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function FinanceReportScreen({ navigate }: Props) {
  const { contentPadding, isMobile, tableMinWidth } = useResponsiveLayout();
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [courseOptions, setCourseOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [classOptions, setClassOptions] = useState<Array<{ id: number; name: string }>>([]);
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const loadReport = useCallback(async () => {
    if (periodError || dateIncomplete) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFinanceReport({
        date_basis: dateBasis,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status || undefined,
        payment_method: paymentMethod || undefined,
        type: invoiceType || undefined,
        school_class_id: schoolClassId ? Number(schoolClassId) : undefined,
        course_id: courseId ? Number(courseId) : undefined,
        search: search.trim() || undefined,
        page,
        per_page: 20,
      });
      setReport(data);
    } catch (err) {
      setReport(null);
      setError(getApiErrorMessage(err, "Não foi possível carregar o relatório financeiro."));
    } finally {
      setLoading(false);
    }
  }, [courseId, dateBasis, dateFrom, dateIncomplete, dateTo, invoiceType, page, paymentMethod, periodError, schoolClassId, search, status]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const applyPreset = (from: string, to: string) => {
    setDateFromDisplay(isoToDisplay(from));
    setDateToDisplay(isoToDisplay(to));
    setPage(1);
  };

  const statusOf = (key: string) => report?.by_status.find((row) => row.key === key);
  const filterWidth = isMobile ? "100%" : 200;
  const chartData = (report?.by_month ?? []).map((month) => ({
    label: month.label,
    paid: parseFloat(month.paid_amount) || 0,
    reference: parseFloat(month.amount) || 0,
  }));
  const hasChart = chartData.some((bar) => bar.paid > 0 || bar.reference > 0);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, gap: 20 }}>
      <PageHeader
        title="Relatório financeiro"
        description="Totais, evolução mensal e cobranças no recorte escolhido."
        actions={
          <Button variant="secondary" label="Gestão de pagamentos" onPress={() => navigate("cobrancas")} />
        }
      />

      <Panel title="Filtros" description="Combine período, situação, forma de pagamento, tipo, curso e turma.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Button size="sm" label="Este mês" onPress={() => applyPreset(monthsAgoStart(0), isoDate(new Date()))} />
          <Button size="sm" label="Últimos 3 meses" onPress={() => applyPreset(monthsAgoStart(2), isoDate(new Date()))} />
          <Button size="sm" label="Últimos 6 meses" onPress={() => applyPreset(monthsAgoStart(5), isoDate(new Date()))} />
          <Button
            size="sm"
            label="Este ano"
            onPress={() => applyPreset(`${new Date().getFullYear()}-01-01`, isoDate(new Date()))}
          />
        </View>

        <View className="flex-row flex-wrap items-end" style={{ gap: 12 }}>
          <View style={{ width: isMobile ? "100%" : 180 }}>
            <SearchableSelect
              dense
              label="Data de referência"
              modalTitle="Data de referência"
              placeholder="Vencimento"
              showSelectedPreview={false}
              value={dateBasis}
              options={DATE_BASIS}
              onChange={(value) => {
                setDateBasis(value || "due_date");
                setPage(1);
              }}
            />
          </View>
          <View style={{ width: isMobile ? "100%" : 160 }}>
            <DatePickerInput
              label="De"
              value={dateFromDisplay}
              onChangeText={(value) => {
                setDateFromDisplay(value);
                setPage(1);
              }}
            />
          </View>
          <View style={{ width: isMobile ? "100%" : 160 }}>
            <DatePickerInput
              label="Até"
              value={dateToDisplay}
              onChangeText={(value) => {
                setDateToDisplay(value);
                setPage(1);
              }}
            />
          </View>
          <View style={{ width: filterWidth }}>
            <SearchableSelect
              dense
              label="Situação"
              modalTitle="Filtrar por situação"
              placeholder="Todas"
              showSelectedPreview={false}
              value={status}
              options={domainToOptions(invoiceStatuses).map((option) => ({ value: String(option.value), label: option.label }))}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
          </View>
          <View style={{ width: filterWidth }}>
            <SearchableSelect
              dense
              label="Forma de pagamento"
              modalTitle="Filtrar por forma de pagamento"
              placeholder="Todas"
              showSelectedPreview={false}
              value={paymentMethod}
              options={domainToOptions(paymentMethods).map((option) => ({ value: String(option.value), label: option.label }))}
              onChange={(value) => {
                setPaymentMethod(value);
                setPage(1);
              }}
            />
          </View>
          <View style={{ width: filterWidth }}>
            <SearchableSelect
              dense
              label="Tipo"
              modalTitle="Filtrar por tipo de cobrança"
              placeholder="Todos"
              showSelectedPreview={false}
              value={invoiceType}
              options={domainToOptions(invoiceTypes).map((option) => ({ value: String(option.value), label: option.label }))}
              onChange={(value) => {
                setInvoiceType(value);
                setPage(1);
              }}
            />
          </View>
          <View style={{ width: filterWidth }}>
            <SearchableSelect
              dense
              label="Curso"
              modalTitle="Filtrar por curso"
              placeholder="Todos os cursos"
              showSelectedPreview={false}
              value={courseId}
              options={courseOptions.map((course) => ({ value: String(course.id), label: course.name }))}
              onChange={(value) => {
                setCourseId(value);
                setSchoolClassId("");
                setPage(1);
              }}
            />
          </View>
          <View style={{ width: filterWidth }}>
            <SearchableSelect
              dense
              label="Turma"
              modalTitle="Filtrar por turma"
              placeholder="Todas as turmas"
              showSelectedPreview={false}
              value={schoolClassId}
              options={classOptions.map((schoolClass) => ({ value: String(schoolClass.id), label: schoolClass.name }))}
              onChange={(value) => {
                setSchoolClassId(value);
                setPage(1);
              }}
            />
          </View>
          <View style={{ flexGrow: 1, minWidth: isMobile ? "100%" : 220, flexBasis: isMobile ? "100%" : 220 }}>
            <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
              Buscar
            </Text>
            <View className="flex-row items-center bg-surface border border-border-strong rounded-ds-md px-3" style={{ height: 32 }}>
              <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
              <input
                aria-label="Buscar aluno ou descrição"
                placeholder="Aluno ou descrição"
                value={search}
                onChange={(event: { target: { value: string } }) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: "var(--ds-ink)",
                  marginLeft: 8,
                  backgroundColor: "transparent",
                  fontFamily: "inherit",
                }}
              />
            </View>
          </View>
        </View>
        {periodError ? (
          <Text className="text-sm text-danger" style={{ marginTop: 8 }}>
            {periodError}
          </Text>
        ) : null}
      </Panel>

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
      ) : report ? (
        <>
          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 12 }}>
            {[
              { label: "Total no recorte", row: { count: report.totals.count, amount: report.totals.amount } },
              { label: statusLabels.paid ?? "Pago", row: statusOf("paid") },
              { label: statusLabels.pending ?? "Pendente", row: statusOf("pending") },
              { label: statusLabels.overdue ?? "Vencido", row: statusOf("overdue") },
            ].map((card) => (
              <View
                key={card.label}
                className="bg-surface border border-border rounded-ds-md"
                style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 16, gap: 2 }}
              >
                <Text className="text-xs text-ink-muted">{card.label}</Text>
                <Text className="font-mono font-semibold text-ink" style={{ fontSize: 18 }}>
                  {formatBrl(card.row?.amount ?? "0")}
                </Text>
                <Text className="text-xs text-ink-subtle">{(card.row?.count ?? 0).toLocaleString("pt-BR")} cobranças</Text>
              </View>
            ))}
          </View>

          <Panel title="Evolução mensal" description={`Pago e total agrupados pela data de ${DATE_BASIS.find((item) => item.value === dateBasis)?.label.toLowerCase() ?? "vencimento"}.`}>
            {hasChart ? (
              <FinanceMonthChart
                data={chartData}
                paidLabel="Pago"
                referenceLabel={BASIS_SERIES[dateBasis] ?? "Total"}
                accessibilityLabel="Valores pagos e totais por mês no período filtrado"
              />
            ) : (
              <Text className="text-sm text-ink-subtle">Nenhuma cobrança no período.</Text>
            )}
          </Panel>

          <View style={{ flexDirection: isMobile ? "column" : "row", gap: 16, alignItems: "stretch" }}>
            <View style={{ flex: 1 }}>
              <Panel title="Por forma de pagamento">
                <BreakdownList
                  rows={report.by_payment_method}
                  labelFor={(row) => ("key" in row ? paymentMethodLabel(row.key) : "—")}
                />
              </Panel>
            </View>
            <View style={{ flex: 1 }}>
              <Panel title="Por tipo">
                <BreakdownList
                  rows={report.by_type}
                  labelFor={(row) => ("key" in row ? (row.key ? typeLabels[row.key] ?? row.key : "Não informado") : "—")}
                />
              </Panel>
            </View>
            <View style={{ flex: 1 }}>
              <Panel title="Por turma">
                <BreakdownList rows={report.by_class} labelFor={(row) => ("name" in row ? row.name : "—")} />
              </Panel>
            </View>
          </View>

          <Panel title="Cobranças" description={`${report.meta.total.toLocaleString("pt-BR")} no recorte.`}>
            <ScrollView horizontal={isMobile} contentContainerStyle={{ minWidth: tableMinWidth ?? 980 }}>
              <View style={{ minWidth: tableMinWidth ?? 980, width: "100%" }}>
                <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                  {["Aluno", "Descrição", "Turma", "Situação", "Vencimento", "Pagamento", "Valor"].map((label) => (
                    <Text key={label} className={TABLE_HEADER_CELL} style={{ flex: label === "Descrição" ? 1.6 : 1 }}>
                      {label}
                    </Text>
                  ))}
                </View>
                {report.items.length === 0 ? (
                  <Text className="text-sm text-ink-subtle" style={{ paddingVertical: 16 }}>
                    Nenhuma cobrança encontrada.
                  </Text>
                ) : (
                  report.items.map((item) => (
                    <View key={item.id} className="flex-row border-b border-border" style={{ paddingVertical: 10, gap: 8 }}>
                      <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 1 }} numberOfLines={1}>
                        {item.student_name ?? "—"}
                      </Text>
                      <Text className={TABLE_CELL} style={{ flex: 1.6 }} numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text className={TABLE_CELL_MUTED} style={{ flex: 1 }} numberOfLines={1}>
                        {item.school_class_name ?? "—"}
                      </Text>
                      <View style={{ flex: 1, alignItems: "flex-start" }}>
                        <Badge tone={STATUS_TONE[item.status] ?? "neutral"} dot label={statusLabels[item.status] ?? item.status} />
                      </View>
                      <Text className={TABLE_CELL} style={{ flex: 1 }}>
                        {formatDate(item.due_date)}
                      </Text>
                      <Text className={TABLE_CELL} style={{ flex: 1 }}>
                        {formatDate(item.paid_at)}
                      </Text>
                      <Text className={`${TABLE_CELL} font-mono`} style={{ flex: 1 }}>
                        {formatBrl(item.amount)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
            <Pagination
              currentPage={report.meta.current_page}
              lastPage={report.meta.last_page}
              total={report.meta.total}
              perPage={report.meta.per_page}
              onPageChange={setPage}
            />
          </Panel>
        </>
      ) : null}
    </ScrollView>
  );
}
