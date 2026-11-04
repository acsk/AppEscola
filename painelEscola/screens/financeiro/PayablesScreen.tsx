import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Plus, RefreshCw, Users } from "lucide-react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import Pagination from "../../components/ui/Pagination";
import DataTableRow from "../../components/ui/DataTableRow";
import {
  TABLE_CELL,
  TABLE_CELL_SEMIBOLD,
  TABLE_CELL_SUBLINE,
  TABLE_HEADER_CELL,
  TABLE_HEADER_ROW,
  TABLE_HEADER_ROW_STYLE,
} from "../../components/ui/dataTableStyles";
import { fmtMoney } from "../../components/financeiro/format";
import ExpenseDrawer from "../../components/finance/payables/ExpenseDrawer";
import ExpenseFormModal from "../../components/finance/payables/ExpenseFormModal";
import SuppliersModal from "../../components/finance/payables/SuppliersModal";
import {
  EXPENSE_SITUATION_LABEL,
  EXPENSE_SITUATION_TONE,
  dueHint,
  expenseMeta,
  fmtDate,
} from "../../components/finance/payables/payablesLabels";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../utils/apiErrors";
import {
  fetchExpenses,
  fetchPayablesOptions,
  fetchPayablesSummary,
  type Expense,
  type ExpenseDetail,
  type ExpenseSituation,
  type ExpensesPage,
  type PayablesOptions,
  type PayablesSummary,
} from "../../services/payables";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
};

const MANAGE = "finance.payables.manage";
const EMPTY_PAGE: ExpensesPage = { items: [], meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 } };

const currentMonth = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
};

const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { due_from: `${month}-01`, due_to: `${month}-${String(last).padStart(2, "0")}` };
};

/**
 * Financeiro › Contas a pagar: despesas fixas e variáveis, fornecedores e comprovantes.
 * Aprovar ou registrar pagamento só atualiza o controle; nada é transferido no banco.
 */
export default function PayablesScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [summary, setSummary] = useState<PayablesSummary | null>(null);
  const [options, setOptions] = useState<PayablesOptions | null>(null);
  const [page, setPage] = useState<ExpensesPage>(EMPTY_PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const [month, setMonth] = useState(currentMonth());
  /** "" = todos os vencimentos; senão AAAA-MM. */
  const [period, setPeriod] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [recurrence, setRecurrence] = useState<"" | "recurring" | "one_off">("");
  const [situation, setSituation] = useState<ExpenseSituation | "">("");
  const [withoutReceipt, setWithoutReceipt] = useState(false);
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  const [openId, setOpenId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDetail | null>(null);
  const [suppliersOpen, setSuppliersOpen] = useState(false);

  const permissions = summary?.permissions ?? [];
  const canManage = permissions.includes(MANAGE);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await fetchPayablesSummary(month));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar o resumo."));
    }
  }, [month]);

  const loadOptions = useCallback(async () => {
    try {
      setOptions(await fetchPayablesOptions());
    } catch {
      setOptions(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPage(
        await fetchExpenses({
          search: search.trim(),
          category_id: categoryId ? Number(categoryId) : "",
          cost_center_id: costCenterId ? Number(costCenterId) : "",
          recurrence,
          situation,
          without_receipt: withoutReceipt,
          ...(period ? monthRange(period) : {}),
          page: pageNumber,
        })
      );
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as despesas."));
      setPage(EMPTY_PAGE);
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, costCenterId, recurrence, situation, withoutReceipt, period, pageNumber]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const timer = setTimeout(loadList, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadList, search]);

  const reload = () => {
    loadSummary();
    loadList();
  };

  const changed = (message: string) => {
    setFeedback(message);
    reload();
  };

  /** Mexer num filtro desfaz o atalho do cartão. */
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setActiveCard(null);
    setWithoutReceipt(false);
    setPageNumber(1);
  };

  const periodOptions = useMemo(() => {
    const base = currentMonth();
    return [
      { value: "", label: "Todos os vencimentos" },
      ...[-3, -2, -1, 0, 1, 2, 3].map((delta) => {
        const m = shiftMonth(base, delta);
        return { value: m, label: `Vencimentos de ${monthLabel(m)}` };
      }),
    ];
  }, []);

  const cards: { key: string; label: string; total?: { count: number; amount: string }; tone: string; situation: ExpenseSituation | ""; allPeriods: boolean }[] = [
    { key: "due", label: "A pagar em 30 dias", total: summary?.due_30_days, tone: color["ink-subtle"], situation: "", allPeriods: false },
    { key: "overdue", label: "Vencidas", total: summary?.overdue, tone: color.danger, situation: "overdue", allPeriods: true },
    { key: "approval", label: "Em aprovação", total: summary?.pending_approval, tone: color.warning, situation: "pending_approval", allPeriods: true },
    { key: "paid", label: "Pagas no mês", total: summary?.paid_in_month, tone: color.success, situation: "paid", allPeriods: false },
    { key: "receipt", label: "Sem comprovante", total: summary?.without_receipt, tone: color.warning, situation: "", allPeriods: false },
  ];

  const pickCard = (card: (typeof cards)[number]) => {
    setActiveCard(card.key);
    setSituation(card.situation);
    setWithoutReceipt(card.key === "receipt");
    setPeriod(card.allPeriods ? "" : month);
    setPageNumber(1);
  };

  const maxCategory = Math.max(1, ...(summary?.by_category ?? []).map((c) => Number(c.amount)));
  const categoryTotal = (summary?.by_category ?? []).reduce((sum, c) => sum + Number(c.amount), 0);

  const situationCell = (e: Expense) => <Badge label={EXPENSE_SITUATION_LABEL[e.situation]} tone={EXPENSE_SITUATION_TONE[e.situation]} dot />;

  const dueCell = (e: Expense) => {
    const hint = dueHint(e);
    return (
      <>
        <Text className={`${TABLE_CELL} font-mono`}>{fmtDate(e.due_date)}</Text>
        {hint ? <Text className={`text-xs ${hint.late ? "text-danger" : "text-ink-muted"}`}>{hint.late ? `▼ ${hint.text}` : hint.text}</Text> : null}
      </>
    );
  };

  const listState = () => {
    if (loading) {
      return (
        <View className="items-center justify-center py-20">
          <ActivityIndicator size="large" color={color.brand} />
        </View>
      );
    }
    if (page.items.length === 0) {
      return (
        <View className="items-center justify-center py-16" style={{ paddingHorizontal: 16 }}>
          <Text className="text-ink-subtle text-sm" style={{ textAlign: "center" }}>
            {canManage ? "Nenhuma despesa com esses filtros. Use “Nova despesa” para cadastrar." : "Nenhuma despesa com esses filtros."}
          </Text>
        </View>
      );
    }
    return null;
  };

  const pagination =
    page.meta.total > 0 ? (
      <Pagination currentPage={page.meta.current_page} lastPage={page.meta.last_page} total={page.meta.total} perPage={page.meta.per_page} onPageChange={setPageNumber} />
    ) : null;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 24 }}>
      <PageHeader
        breadcrumb={[{ label: "Financeiro" }, { label: "Contas a pagar" }]}
        title="Contas a pagar"
        description="Despesas fixas e variáveis, fornecedores e comprovantes."
        actions={
          <>
            <Button icon={Users} label="Fornecedores" onPress={() => setSuppliersOpen(true)} />
            <Button icon={RefreshCw} label="Atualizar" onPress={reload} loading={loading} />
            {canManage ? (
              <Button
                variant="primary"
                icon={Plus}
                label="Nova despesa"
                onPress={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              />
            ) : null}
          </>
        }
      />

      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <Text className="text-sm text-ink-muted">Mês de referência dos cartões:</Text>
        <Button size="sm" variant="ghost" label="‹" accessibilityLabel="Mês anterior" onPress={() => setMonth((m) => shiftMonth(m, -1))} />
        <Text className="text-sm font-semibold text-ink">{monthLabel(month)}</Text>
        <Button size="sm" variant="ghost" label="›" accessibilityLabel="Próximo mês" onPress={() => setMonth((m) => shiftMonth(m, 1))} />
      </View>

      <View className="flex-row flex-wrap bg-surface border border-border rounded-ds-md overflow-hidden">
        {cards.map((card, i) => {
          const active = activeCard === card.key;
          return (
            <Pressable
              key={card.key}
              role="button"
              aria-pressed={active}
              onPress={() => pickCard(card)}
              className={`${i > 0 && !isMobile ? "border-l border-border" : ""} ${active ? "bg-brand-tint" : ""}`}
              style={{ flexGrow: 1, flexBasis: isMobile ? "50%" : 0, minWidth: isMobile ? "50%" : 160, padding: 16, gap: 4, borderBottomWidth: active ? 2 : 0, borderBottomColor: color.brand }}
            >
              <View className="flex-row items-center" style={{ gap: 6 }}>
                <View style={{ width: 8, height: 8, backgroundColor: card.tone }} />
                <Text className="text-xs text-ink-muted">{card.label}</Text>
              </View>
              <Text className="text-xl font-semibold text-ink">{card.total ? String(card.total.count) : "—"}</Text>
              <Text className="text-xs font-mono text-ink-muted">{card.total ? fmtMoney(card.total.amount) : ""}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1.4, minWidth: isMobile ? "100%" : 360, padding: 20, gap: 12 }}>
          <View>
            <Text className="text-base font-semibold text-ink">Despesas por categoria</Text>
            <Text className="text-sm text-ink-muted">{`Previstas para ${monthLabel(month)} · ${fmtMoney(categoryTotal)}`}</Text>
          </View>
          {(summary?.by_category ?? []).length === 0 ? (
            <Text className="text-sm text-ink-muted">Nenhuma despesa prevista neste mês.</Text>
          ) : (
            summary!.by_category.map((c) => (
              <View key={c.name} style={{ gap: 4 }}>
                <View className="flex-row justify-between" style={{ gap: 8 }}>
                  <Text className="text-sm text-ink">{c.name}</Text>
                  <Text className="text-sm font-mono text-ink">{fmtMoney(c.amount)}</Text>
                </View>
                <View className="bg-surface-sunken" style={{ height: 8 }}>
                  <View style={{ height: 8, width: `${Math.max(1, (Number(c.amount) / maxCategory) * 100)}%`, backgroundColor: color.brand }} />
                </View>
              </View>
            ))
          )}
        </View>
        <View style={{ flex: 1, minWidth: isMobile ? "100%" : 300, gap: 12 }}>
          <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, borderLeftWidth: 3, borderLeftColor: color["ink-muted"] }}>
            <Text className="text-sm text-ink">
              <Text className="font-semibold">Registrar pagamento não movimenta dinheiro.</Text> Aprovar ou dar baixa numa despesa só atualiza o
              controle. Transferências bancárias, quando existirem, terão autorização própria.
            </Text>
          </View>
          <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, borderLeftWidth: 3, borderLeftColor: color["ink-muted"] }}>
            <Text className="text-sm text-ink">
              <Text className="font-semibold">Saídas do extrato.</Text> As tarifas da Cora entram sozinhas na despesa “Tarifas bancárias Cora” do mês. As
              demais saídas são ligadas a uma despesa aprovada na{" "}
              <Text className="text-brand underline" role="link" onPress={() => navigate("financeiro-conciliacao")}>
                Conciliação bancária
              </Text>
              .
            </Text>
          </View>
        </View>
      </View>

      {feedback ? (
        <View className="rounded-ds-md border border-success bg-success-tint px-4 py-3" aria-live="polite">
          <Text className="text-sm text-success">{feedback}</Text>
        </View>
      ) : null}
      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3">
          <Text className="text-sm text-danger">{error}</Text>
        </View>
      ) : null}

      <View style={{ gap: 16 }}>
        <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16 }}>
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            <View style={{ flex: 2, minWidth: isMobile ? "100%" : 200 }}>
              <FormInput label="Buscar" value={search} onChangeText={reset(setSearch)} placeholder="Despesa, fornecedor ou nº (D-0123)" />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 180 }}>
              <FormSelect label="Vencimento" value={period} options={periodOptions} onChange={reset(setPeriod)} />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <FormSelect
                label="Situação"
                value={situation}
                options={[{ value: "", label: "Todas as situações" }, ...Object.entries(EXPENSE_SITUATION_LABEL).map(([value, label]) => ({ value, label }))]}
                onChange={(v) => reset(setSituation)(v as ExpenseSituation | "")}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <FormSelect
                label="Categoria"
                value={categoryId}
                options={[{ value: "", label: "Todas as categorias" }, ...(options?.categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
                onChange={reset(setCategoryId)}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <FormSelect
                label="Centro de custo"
                value={costCenterId}
                options={[{ value: "", label: "Todos os centros de custo" }, ...(options?.cost_centers ?? []).map((c) => ({ value: String(c.id), label: c.name }))]}
                onChange={reset(setCostCenterId)}
              />
            </View>
            <View style={{ flex: 1, minWidth: isMobile ? "100%" : 140 }}>
              <FormSelect
                label="Tipo"
                value={recurrence}
                options={[
                  { value: "", label: "Fixas e variáveis" },
                  { value: "recurring", label: "Só recorrentes" },
                  { value: "one_off", label: "Só avulsas" },
                ]}
                onChange={(v) => reset(setRecurrence)(v as "" | "recurring" | "one_off")}
              />
            </View>
          </View>
        </View>

        {isMobile ? (
          <View style={{ gap: 12 }}>
            {listState() ??
              page.items.map((e) => (
                <Pressable key={e.id} onPress={() => setOpenId(e.id)} className="bg-surface rounded-ds-md border border-border-strong px-3 py-3" style={{ gap: 6 }}>
                  <View className="flex-row justify-between" style={{ gap: 8 }}>
                    <Text className={TABLE_CELL_SEMIBOLD} style={{ flex: 1 }} numberOfLines={2}>
                      {e.description}
                    </Text>
                    <Text className="text-sm font-mono text-ink">{fmtMoney(e.amount)}</Text>
                  </View>
                  <Text className="text-xs font-mono text-ink-muted" numberOfLines={1}>
                    {expenseMeta(e)}
                  </Text>
                  <Text className="text-xs text-ink-muted" numberOfLines={1}>
                    {[e.supplier?.name, e.category?.name, e.cost_center?.name].filter(Boolean).join(" · ") || "Sem fornecedor"}
                  </Text>
                  <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                    <View>{dueCell(e)}</View>
                    {situationCell(e)}
                  </View>
                </Pressable>
              ))}
            {pagination ? <View className="bg-surface rounded-ds-md border border-border px-3">{pagination}</View> : null}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: "100%" }} contentContainerStyle={{ width: "100%" }}>
            <View className="bg-surface rounded-ds-md overflow-hidden border border-border" style={{ width: "100%", minWidth: 960 }}>
              <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1.6, minWidth: 220 }}>
                  Despesa
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 140 }}>
                  Fornecedor
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 140 }}>
                  Categoria / centro
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ width: 150 }}>
                  Vencimento
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ width: 120, textAlign: "right", paddingRight: 16 }}>
                  Valor
                </Text>
                <Text className={TABLE_HEADER_CELL} style={{ width: 170 }}>
                  Situação
                </Text>
              </View>

              {listState() ??
                page.items.map((e, i) => (
                  <DataTableRow key={e.id} index={i} onPress={() => setOpenId(e.id)}>
                    <View style={{ flex: 1.6, minWidth: 220, paddingRight: 10 }}>
                      <Text className={TABLE_CELL_SEMIBOLD} numberOfLines={1}>
                        {e.description}
                      </Text>
                      <Text className={`${TABLE_CELL_SUBLINE} font-mono`} numberOfLines={1}>
                        {expenseMeta(e)}
                      </Text>
                    </View>
                    <Text className={TABLE_CELL} style={{ flex: 1, minWidth: 140, paddingRight: 10 }} numberOfLines={1}>
                      {e.supplier?.name ?? "—"}
                    </Text>
                    <View style={{ flex: 1, minWidth: 140, paddingRight: 10 }}>
                      <Text className={TABLE_CELL} numberOfLines={1}>
                        {e.category?.name ?? "—"}
                      </Text>
                      {e.cost_center ? (
                        <Text className={TABLE_CELL_SUBLINE} numberOfLines={1}>
                          {e.cost_center.name}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ width: 150, paddingRight: 8 }}>{dueCell(e)}</View>
                    <Text className={`${TABLE_CELL} font-mono`} style={{ width: 120, textAlign: "right", paddingRight: 16 }}>
                      {fmtMoney(e.amount)}
                    </Text>
                    <View style={{ width: 170 }}>{situationCell(e)}</View>
                  </DataTableRow>
                ))}

              {pagination ? <View className="px-4 border-t border-border">{pagination}</View> : null}
            </View>
          </ScrollView>
        )}
      </View>

      {openId !== null ? (
        <ExpenseDrawer
          expenseId={openId}
          options={options}
          permissions={permissions}
          onClose={() => setOpenId(null)}
          onEdit={(expense) => {
            setEditing(expense);
            setFormOpen(true);
          }}
          onChanged={changed}
        />
      ) : null}

      <ExpenseFormModal
        visible={formOpen}
        options={options}
        expense={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(message, expense) => {
          setFormOpen(false);
          changed(message);
          // Reabre o detalhe atualizado.
          setOpenId(null);
          setTimeout(() => setOpenId(expense.id), 0);
        }}
      />

      <SuppliersModal visible={suppliersOpen} canManage={canManage} onClose={() => setSuppliersOpen(false)} onChanged={loadOptions} />
    </ScrollView>
  );
}
