import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import ToastBanner from "../../components/ui/ToastBanner";
import { TABLE_CELL, TABLE_CONTAINER, TABLE_HEADER_CELL, TABLE_HEADER_ROW, TABLE_HEADER_ROW_STYLE } from "../../components/ui/dataTableStyles";
import DataTableRow from "../../components/ui/DataTableRow";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getApiErrorMessage, showApiErrorToast, showApiToast, type ApiToastState } from "../../utils/apiErrors";
import { closeCompetence, fetchCompetenceYear, fmtBrl, fmtIsoDate, type CompetenceMonth, type CompetenceYear } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
};

const YEAR = 2026;

function toneFor(status: CompetenceMonth["status"]): "success" | "warning" | "neutral" {
  if (status === "closed") return "success";
  if (status === "preview") return "warning";
  return "neutral";
}

/** Plataforma › Comercial › Fechamento do ano: contrato de 2026, mês a mês. */
export default function SaasYearCloseScreen({ navigate }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const [data, setData] = useState<CompetenceYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState("");
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchCompetenceYear(YEAR));
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar o fechamento do ano."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeMonth = async (tenantId: number, competence: string) => {
    setClosing(`${tenantId}-${competence}`);
    try {
      const response = await closeCompetence(tenantId, competence);
      showApiToast(setToast, response.data, "Mês fechado.");
      await load();
    } catch (err) {
      showApiErrorToast(setToast, err, "Não foi possível fechar o mês.");
    } finally {
      setClosing("");
    }
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, gap: 16 }}>
      <PageHeader
        breadcrumb={[{ label: "Comercial" }, { label: "Fechamento do ano" }]}
        title={`Contrato anual ${YEAR}`}
        description="Janeiro a junho, R$ 15 por aluno. Julho a dezembro, R$ 20. O painel não é cobrado e a gestão entra só se estiver contratada."
        actions={<Button label="Cobrança do mês" onPress={() => navigate("saas-billing")} />}
      />

      <View className="rounded-ds-md border border-border bg-surface px-4 py-3" style={{ gap: 6 }}>
        <Text className="text-sm text-ink">{data?.note ?? "As chaves de OpenRouter e GPT são do cliente. O custo de IA não entra nesta cobrança."}</Text>
      </View>

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        {[
          ["Ano simulado", data ? fmtBrl(data.year_total) : "—", "fechado + prévia + previsão"],
          ["Já fechado", data ? fmtBrl(data.closed_total) : "—", "não muda mais"],
          ["Ainda aberto", data ? fmtBrl(data.preview_total) : "—", "meses já começados"],
          ["Previsão", data ? fmtBrl(data.forecast_total) : "—", "meses que ainda não começaram"],
        ].map(([label, value, hint]) => (
          <View key={label} className="rounded-ds-md border border-border bg-surface" style={{ flex: 1, minWidth: isMobile ? "100%" : 160, padding: 14, gap: 2 }}>
            <Text className="text-xs font-medium text-ink-muted">{label}</Text>
            <Text className="text-xl font-mono text-ink">{value}</Text>
            <Text className="text-xs text-ink-subtle">{hint}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <View className="rounded-ds-md border border-danger bg-danger-tint px-4 py-3 flex-row items-center justify-between" style={{ gap: 12 }}>
          <Text className="text-sm text-danger" style={{ flex: 1 }}>{error}</Text>
          <Button size="sm" label="Tentar novamente" onPress={load} />
        </View>
      ) : null}

      {loading ? (
        <View style={{ padding: 40, alignItems: "center" }}>
          <ActivityIndicator />
        </View>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Text className="text-sm text-ink-muted">Nenhuma instituição com assinatura. O contrato anual aparece aqui depois da contratação.</Text>
      ) : data?.rows.map((row) => (
        <View key={row.tenant.id} style={{ gap: 8 }}>
          <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
            <Text className="text-base font-semibold text-ink">{row.tenant.name}</Text>
            <Text className="text-sm text-ink-muted">{row.plan ?? "Sem plano"}</Text>
            {row.contract_starts_at ? (
              <Badge label={`${fmtIsoDate(row.contract_starts_at)} a ${fmtIsoDate(row.contract_ends_at)}`} tone="brand" />
            ) : null}
            <Text className="text-sm font-mono text-ink">{`Ano ${fmtBrl(row.year_total)}`}</Text>
            {(row.test_students ?? 0) > 0 ? <Badge label={`${row.test_students} de teste fora`} tone="neutral" /> : null}
          </View>
          <ScrollView horizontal={isMobile} showsHorizontalScrollIndicator={isMobile}>
            <View className={TABLE_CONTAINER} style={{ width: "100%", minWidth: isMobile ? 860 : undefined }}>
              <View className={TABLE_HEADER_ROW} style={TABLE_HEADER_ROW_STYLE}>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1.4, minWidth: 180 }}>Mês</Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 0.7, minWidth: 70, textAlign: "right" }}>Alunos</Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 0.9, minWidth: 90, textAlign: "right" }}>R$/aluno</Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 100, textAlign: "right" }}>App</Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 0.9, minWidth: 90, textAlign: "right" }}>Gestão</Text>
                <Text className={TABLE_HEADER_CELL} style={{ flex: 1, minWidth: 100, textAlign: "right" }}>Total</Text>
                <Text className={TABLE_HEADER_CELL} style={{ width: 150, paddingLeft: 12 }}>Situação</Text>
              </View>
              {row.months.map((month, index) => (
                <DataTableRow key={month.competence} index={index}>
                  <View style={{ flex: 1.4, minWidth: 180 }}>
                    <Text className={TABLE_CELL}>{month.label}</Text>
                    <Text className="text-xs text-ink-subtle">{month.students_basis}</Text>
                  </View>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 0.7, minWidth: 70, textAlign: "right" }}>{month.app_students == null ? "—" : month.app_students.toLocaleString("pt-BR")}</Text>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 0.9, minWidth: 90, textAlign: "right" }}>{fmtBrl(month.unit_price)}</Text>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 1, minWidth: 100, textAlign: "right" }}>{fmtBrl(month.app_amount)}</Text>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 0.9, minWidth: 90, textAlign: "right" }}>{Number(month.gestao_amount) === 0 ? "Grátis" : fmtBrl(month.gestao_amount)}</Text>
                  <Text className="text-sm font-mono text-ink" style={{ flex: 1, minWidth: 100, textAlign: "right" }}>{fmtBrl(month.total)}</Text>
                  <View style={{ width: 150, paddingLeft: 12, gap: 4 }}>
                    <Badge label={month.status_label} tone={toneFor(month.status)} />
                    {month.can_close ? (
                      <Button
                        size="sm"
                        label="Fechar mês"
                        loading={closing === `${row.tenant.id}-${month.competence}`}
                        onPress={() => closeMonth(row.tenant.id, month.competence)}
                      />
                    ) : month.closed_at ? <Text className="text-xs text-ink-subtle">{month.closed_at}</Text> : null}
                  </View>
                </DataTableRow>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((current) => ({ ...current, visible: false }))} />
    </ScrollView>
  );
}
