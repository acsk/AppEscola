import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import api from "../../services/api";
import OverlayPortal from "../ui/OverlayPortal";
import Tabs from "../ui/Tabs";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import DefinitionRows from "../ui/DefinitionRows";
import { color } from "../../constants/theme";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { paymentMethodLabel } from "../../utils/paymentMethods";
import type { Invoice } from "../../types/invoices";
import { SITUATION_LABEL, SITUATION_TONE, dueHint, invoiceOrigin, rowSituation } from "./receivables";

export type InvoiceDrawerAction = "settle" | "edit" | "generate_charge" | "cancel";

type Tab = "details" | "payments" | "communication" | "audit";

type Props = {
  /** Linha clicada; o detalhe completo é buscado em GET /invoices/{id}. */
  invoice: Invoice | null;
  onClose: () => void;
  /** As ações abrem os modais já existentes da tela (o painel fecha antes). */
  onAction: (action: InvoiceDrawerAction, invoice: Invoice) => void;
};

const money = (value?: string | number | null) =>
  value === null || value === undefined || value === "" ? "—" : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Detalhe da cobrança em painel lateral, com Detalhes, Pagamentos, Comunicação e Auditoria. */
export default function InvoiceDrawer({ invoice, onClose, onAction }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [tab, setTab] = useState<Tab>("details");
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) return;
    setTab("details");
    setDetail(invoice);
    setLoading(true);
    let active = true;
    api
      .get(`/invoices/${invoice.id}`)
      .then(({ data }) => {
        // O detalhe não traz turma/curso; mantém o resumo vindo da lista.
        if (active) setDetail({ ...invoice, ...(data?.body ?? data), enrollment: invoice.enrollment });
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [invoice]);

  if (!invoice || !detail) return null;

  const situation = rowSituation(detail);
  const hint = dueHint(detail);
  const open = situation === "open" || situation === "overdue";
  const paid = situation === "paid";
  const enrollment = detail.enrollment;

  const copy = async (key: string, text?: string | null) => {
    if (!text || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const field = (label: string, value?: string | null) => (
    <View style={{ width: isMobile ? "100%" : "50%", paddingRight: 12, paddingVertical: 6 }}>
      <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>{label}</Text>
      <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }}>{value || "—"}</Text>
    </View>
  );

  const section = (title: string, children: React.ReactNode) => (
    <View style={{ gap: 8 }}>
      <Text className="font-semibold text-ink" style={{ fontSize: 14 }}>{title}</Text>
      {children}
    </View>
  );

  const copyRow = (key: string, label: string, value?: string | null) =>
    value ? (
      <View className="bg-surface-sunken border border-border rounded-ds-sm flex-row items-center" style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 12 }}>
        <Text className="font-mono text-ink-muted flex-1" style={{ fontSize: 12 }} numberOfLines={1}>
          {`${label}  ${value}`}
        </Text>
        <Pressable onPress={() => copy(key, value)} accessibilityRole="button" aria-label={`Copiar ${label}`}>
          <Text className="text-brand font-medium" style={{ fontSize: 13 }}>{copied === key ? "Copiado" : "Copiar"}</Text>
        </Pressable>
      </View>
    ) : null;

  const empty = (text: string) => (
    <View style={{ paddingVertical: 32, alignItems: "center" }}>
      <Text className="text-ink-subtle" style={{ fontSize: 13, textAlign: "center" }}>{text}</Text>
    </View>
  );

  const act = (action: InvoiceDrawerAction) => {
    onClose();
    onAction(action, detail);
  };

  return (
    <OverlayPortal open onClose={onClose}>
      <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} aria-label="Fechar detalhe" />
      <View
        className="bg-surface border-l border-border"
        role="dialog"
        aria-label={`Cobrança #${detail.id}`}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: isMobile ? "100%" : 560, maxWidth: "100%" }}
      >
        <View style={{ paddingHorizontal: 24, paddingTop: 20, gap: 6 }}>
          <View className="flex-row items-start" style={{ gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-mono text-ink-muted" style={{ fontSize: 12 }} numberOfLines={1}>
                {`Cobrança #${detail.id}${detail.cora?.charge_id ? ` · ${detail.cora.charge_id}` : ""}`}
              </Text>
              <Text className="font-semibold text-ink" style={{ fontSize: 20, lineHeight: 28 }} numberOfLines={2}>
                {detail.student?.name ?? "Aluno não informado"}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" aria-label="Fechar" style={{ padding: 4 }}>
              <Icon icon={X} size={20} color={color["ink-muted"]} />
            </Pressable>
          </View>
          <View className="flex-row items-center flex-wrap" style={{ gap: 10 }}>
            <Text className="font-mono font-semibold text-ink" style={{ fontSize: 26, lineHeight: 32 }}>{money(detail.amount)}</Text>
            <Badge label={SITUATION_LABEL[situation]} tone={SITUATION_TONE[situation]} dot />
            {hint ? (
              <Text className={hint.late ? "text-danger" : "text-ink-muted"} style={{ fontSize: 13 }}>{hint.text}</Text>
            ) : null}
            {loading ? <ActivityIndicator size="small" color={color.brand} /> : null}
          </View>
          <View style={{ marginTop: 8 }}>
            <Tabs<Tab>
              accessibilityLabel="Detalhe da cobrança"
              value={tab}
              onChange={setTab}
              items={[
                { id: "details", label: "Detalhes" },
                { id: "payments", label: "Pagamentos", count: paid ? 1 : 0 },
                { id: "communication", label: "Comunicação" },
                { id: "audit", label: "Auditoria" },
              ]}
            />
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 24 }}>
          {tab === "details" ? (
            <>
              <View className="flex-row flex-wrap">
                {field("Aluno", detail.student?.name)}
                {field("Matrícula", detail.student?.enrollment_number ?? null)}
                {field("Responsável financeiro", detail.guardian?.name ?? "O próprio aluno")}
                {field("Turma", enrollment?.school_class?.name ?? null)}
                {field("Curso", enrollment?.course?.name ?? null)}
                {field("Plano", enrollment?.course_plan?.name ?? null)}
                {field("Descrição", detail.description)}
                {field("Vencimento", fmtDate(detail.due_date))}
                {field("Forma de pagamento", paymentMethodLabel(detail.payment_method))}
                {field("Origem", invoiceOrigin(detail))}
              </View>

              {section(
                "Valores",
                <View className="border border-border rounded-ds-sm" style={{ paddingHorizontal: 12 }}>
                  <DefinitionRows
                    rows={[
                      { label: "Valor da cobrança", value: money(detail.amount) },
                      { label: "Pago", value: paid ? money(detail.amount) : money(0) },
                    ]}
                    total={{ label: open ? "Saldo devido" : "Saldo", value: money(open ? detail.amount : 0) }}
                  />
                </View>
              )}

              {detail.cora?.boleto_digitable || detail.cora?.pix_copy_paste
                ? section(
                    "Cobrança Cora",
                    <View style={{ gap: 8 }}>
                      {copyRow("digitable", "Linha digitável", detail.cora?.boleto_digitable)}
                      {copyRow("pix", "Pix copia e cola", detail.cora?.pix_copy_paste)}
                      <Text className="text-ink-subtle" style={{ fontSize: 12 }}>
                        {`Situação na Cora: ${detail.cora?.status ?? "—"} · última sincronização ${fmtDateTime(detail.cora?.last_synced_at)}`}
                      </Text>
                    </View>
                  )
                : null}

              {detail.notes ? section("Observações", <Text className="text-ink-muted" style={{ fontSize: 14, lineHeight: 20 }}>{detail.notes}</Text>) : null}
              {detail.settlement_hint || detail.lifecycle_hint ? (
                <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 18 }}>{detail.settlement_hint ?? detail.lifecycle_hint}</Text>
              ) : null}
            </>
          ) : null}

          {tab === "payments"
            ? paid
              ? section(
                  "Pagamento registrado",
                  <View className="border border-border rounded-ds-sm" style={{ paddingHorizontal: 12 }}>
                    <DefinitionRows
                      rows={[
                        { label: "Pago em", value: fmtDateTime(detail.paid_at) },
                        { label: "Forma", value: paymentMethodLabel(detail.payment_method), text: true },
                        { label: "Identificador", value: detail.payment_reference ?? "—", muted: !detail.payment_reference },
                        { label: "Valor", value: money(detail.amount) },
                      ]}
                    />
                  </View>
                )
              : empty("Nenhum pagamento registrado para esta cobrança.")
            : null}

          {tab === "communication"
            ? empty("O histórico de lembretes e envios desta cobrança ainda não é registrado pelo sistema.")
            : null}

          {tab === "audit" ? (
            <>
              <View className="border border-border rounded-ds-sm" style={{ paddingHorizontal: 12 }}>
                <DefinitionRows
                  rows={[
                    { label: "Criada em", value: fmtDateTime(detail.created_at) },
                    { label: "Criada por", value: detail.created_by_user?.name ?? "Sistema", text: true },
                    { label: "Última alteração", value: fmtDateTime(detail.updated_at) },
                    { label: "Alterada por", value: detail.updated_by_user?.name ?? "Sistema", text: true },
                    ...(detail.edit_reason ? [{ label: "Motivo da última edição", value: detail.edit_reason, text: true }] : []),
                  ]}
                />
              </View>
              <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 18 }}>
                O histórico completo, alteração por alteração, ainda não é registrado pelo sistema.
              </Text>
            </>
          ) : null}
        </ScrollView>

        <View className="border-t border-border flex-row flex-wrap items-center" style={{ padding: 16, gap: 8, justifyContent: "flex-end" }}>
          {open && detail.can_cancel ? <Button variant="ghost" label="Cancelar cobrança" onPress={() => act("cancel")} /> : null}
          {open && detail.can_edit !== false ? <Button label="Editar" onPress={() => act("edit")} /> : null}
          {open ? <Button label={detail.cora?.charge_id ? "Boleto / Pix" : "Gerar cobrança"} onPress={() => act("generate_charge")} /> : null}
          {open && detail.can_manual_settle ? (
            <Button variant="primary" icon={Check} label="Registrar pagamento" onPress={() => act("settle")} />
          ) : null}
        </View>
      </View>
    </OverlayPortal>
  );
}
