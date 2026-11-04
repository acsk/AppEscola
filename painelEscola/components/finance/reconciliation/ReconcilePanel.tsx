import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import { fmtMoney } from "../../financeiro/format";
import { fmtDateTime } from "../cora/coraEvents";
import { color } from "../../../constants/theme";
import { getApiResponseMessage } from "../../../utils/apiErrors";
import { historyActionLabel, transactionTypeLabel } from "./reconciliationLabels";
import {
  fetchReconciliationCandidates,
  fetchReconciliationHistory,
  ignoreBankEntry,
  markBankEntryDivergent,
  reconcileBankEntry,
  undoBankEntry,
  type BankEntry,
  type ReconciliationCandidate,
  type ReconciliationHistoryItem,
} from "../../../services/bankReconciliation";

type Props = {
  entry: BankEntry;
  canSettle: boolean;
  /** Chamado depois de uma decisão gravada, com a mensagem da API e a movimentação atualizada. */
  onDecided: (message: string, entry: BankEntry) => void;
};

const MIN_JUSTIFICATION = 10;

const INVOICE_STATUS_LABEL: Record<string, string> = {
  pending: "em aberto",
  overdue: "vencida",
  paid: "paga",
};

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/**
 * Decisão sobre uma movimentação do extrato. Valor e data iguais aparecem só como critérios;
 * quem concilia é a pessoa, com justificativa, e a cobrança Cora só é conciliada se a Cora confirmar.
 */
export default function ReconcilePanel({ entry, canSettle, onDecided }: Props) {
  const [candidates, setCandidates] = useState<ReconciliationCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [history, setHistory] = useState<ReconciliationHistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const open = entry.status === "pending" || entry.status === "divergent";
  const isCredit = entry.direction === "credit";
  const canPickInvoice = canSettle && open && isCredit;

  const loadCandidates = useCallback(async () => {
    if (!isCredit) return;
    setLoadingCandidates(true);
    try {
      const items = await fetchReconciliationCandidates(entry.id, search.trim() || undefined);
      setCandidates(items);
      setSelected((current) => (items.some((c) => c.id === current) ? current : null));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar as cobranças candidatas."));
    } finally {
      setLoadingCandidates(false);
    }
  }, [entry.id, isCredit, search]);

  useEffect(() => {
    setSelected(null);
    setJustification("");
    setSearch("");
    setError("");
    fetchReconciliationHistory(entry.id).then(setHistory).catch(() => setHistory([]));
  }, [entry.id, entry.status]);

  useEffect(() => {
    if (!canPickInvoice) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(loadCandidates, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [canPickInvoice, loadCandidates, search]);

  const justificationOk = justification.trim().length >= MIN_JUSTIFICATION;
  const selectedCandidate = candidates.find((c) => c.id === selected) ?? null;

  const run = async (key: string, action: () => Promise<{ entry: BankEntry; message: string }>) => {
    if (!justificationOk) {
      setError(`Escreva uma justificativa com pelo menos ${MIN_JUSTIFICATION} caracteres.`);
      return;
    }
    setBusy(key);
    setError("");
    try {
      const result = await action();
      onDecided(result.message, result.entry);
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível concluir a ação."));
    } finally {
      setBusy(null);
    }
  };

  const text = justification.trim();
  const sign = isCredit ? "+" : "−";

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text className="text-xs font-semibold text-ink-muted uppercase" style={{ letterSpacing: 1 }}>
          Conciliar movimentação
        </Text>
        <Text className={`text-xl font-semibold font-mono ${isCredit ? "text-ink" : "text-danger"}`}>
          {`${sign} ${fmtMoney(entry.amount)}`}
          <Text className="text-sm font-sans text-ink-muted">{` · ${transactionTypeLabel(entry.transaction_type)} · ${fmtDateTime(entry.occurred_at)}`}</Text>
        </Text>
        <Text className="text-xs font-mono text-ink-muted" numberOfLines={2}>
          {[entry.description, entry.counterparty_name, entry.external_id].filter(Boolean).join(" · ")}
        </Text>
      </View>

      <Notice entry={entry} />

      {canPickInvoice ? (
        <View style={{ gap: 8 }}>
          <Text className="text-sm font-semibold text-ink">Cobranças candidatas</Text>
          {loadingCandidates ? (
            <ActivityIndicator color={color.brand} />
          ) : candidates.length === 0 ? (
            <Text className="text-sm text-ink-muted">
              {search
                ? "Nenhuma cobrança Cora gerada pelo sistema com essa busca."
                : "Nenhuma cobrança Cora em aberto com este valor. Busque abaixo por número, aluno ou descrição."}
            </Text>
          ) : (
            candidates.map((c) => <CandidateCard key={c.id} candidate={c} selected={selected === c.id} onPress={() => setSelected(c.id)} />)
          )}
          <FormInput
            label="Buscar outra cobrança"
            value={search}
            onChangeText={setSearch}
            placeholder="Nº (#123), nome do aluno ou descrição"
            dense
          />
          {selectedCandidate && selectedCandidate.status !== "paid" ? (
            <Text className="text-xs text-ink-muted">
              Cobrança em aberto: o sistema consulta a Cora e só concilia se ela confirmar o pagamento.
            </Text>
          ) : null}
          <Text className="text-xs text-ink-subtle">
            Só aparecem cobranças com ID Cora geradas pelo sistema; as importadas da Cora e as sem ID ficam de fora.
          </Text>
        </View>
      ) : null}

      {canSettle && open && !isCredit ? (
        <Text className="text-sm text-ink-muted">
          Saídas serão vinculadas a despesas quando Contas a pagar estiver disponível. Por enquanto, ignore com
          justificativa (ex.: tarifa) ou marque como divergente.
        </Text>
      ) : null}

      {canSettle ? (
        <View style={{ gap: 12 }}>
          <FormInput
            label="Justificativa (obrigatória)"
            value={justification}
            onChangeText={setJustification}
            placeholder="Ex.: pagador confirmado pela secretaria por WhatsApp."
            multiline
            numberOfLines={3}
            maxLength={500}
            style={{ minHeight: 72, textAlignVertical: "top" }}
          />
          {error ? (
            <Text className="text-sm text-danger" aria-live="polite">
              {error}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap" style={{ gap: 8, justifyContent: "flex-end" }}>
            {open ? (
              <Button
                variant="ghost"
                label="Ignorar"
                loading={busy === "ignore"}
                disabled={!!busy}
                onPress={() => run("ignore", () => ignoreBankEntry(entry.id, text))}
              />
            ) : null}
            {entry.status === "pending" ? (
              <Button
                variant="secondary"
                label="Marcar divergência"
                loading={busy === "divergent"}
                disabled={!!busy}
                onPress={() => run("divergent", () => markBankEntryDivergent(entry.id, text))}
              />
            ) : null}
            {entry.status !== "pending" ? (
              <Button
                variant="secondary"
                label="Voltar para pendente"
                loading={busy === "undo"}
                disabled={!!busy}
                onPress={() => run("undo", () => undoBankEntry(entry.id, text))}
              />
            ) : null}
            {canPickInvoice ? (
              <Button
                icon={Check}
                label="Conciliar manualmente"
                loading={busy === "reconcile"}
                disabled={!!busy || selected === null}
                onPress={() => selected !== null && run("reconcile", () => reconcileBankEntry(entry.id, selected, text))}
              />
            ) : null}
          </View>
          {entry.status === "reconciled" ? (
            <Text className="text-xs text-ink-muted">Voltar para pendente não desfaz a baixa da cobrança.</Text>
          ) : null}
        </View>
      ) : null}

      {history.length > 0 ? (
        <View className="border-t border-border" style={{ paddingTop: 12, gap: 8 }}>
          <Text className="text-sm font-semibold text-ink">Histórico</Text>
          {history.map((h) => (
            <View key={h.id} style={{ gap: 2 }}>
              <Text className="text-xs text-ink">
                {`${historyActionLabel(h.action)}${h.invoice_id ? ` · cobrança #${h.invoice_id}` : ""}`}
              </Text>
              <Text className="text-xs text-ink-muted">
                {`${h.user?.name ?? "Sistema"} · ${fmtDateTime(h.created_at)}${h.justification ? ` · “${h.justification}”` : ""}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Notice({ entry }: { entry: BankEntry }) {
  let tone: "warning" | "danger" | "success" | "neutral" = "neutral";
  let title = "";
  let body = "";

  if (entry.status === "reconciled") {
    tone = "success";
    title = entry.match_type === "auto" ? "Conciliada automaticamente pelo ID do pagamento na Cora." : "Conciliada manualmente.";
    body = entry.invoice
      ? `Cobrança #${entry.invoice.id}${entry.invoice.student ? ` · ${entry.invoice.student.name}` : ""} · ${fmtMoney(entry.invoice.amount)}.`
      : "";
    if (entry.divergence) body += ` ${entry.divergence}`;
    if (entry.justification) body += ` Justificativa: ${entry.justification}`;
  } else if (entry.status === "divergent") {
    tone = "danger";
    title = "Divergência.";
    body = entry.divergence ?? "";
  } else if (entry.status === "ignored") {
    title = "Ignorada.";
    body = entry.justification ?? "";
  } else if (entry.direction === "credit") {
    tone = "warning";
    title = "Não é pagamento de cobrança da aplicação.";
    body =
      entry.cited_charge_ids.length > 0
        ? `A movimentação cita ${entry.cited_charge_ids.join(", ")}, que não é uma cobrança gerada pelo sistema.`
        : "O ID deste pagamento não corresponde a nenhuma cobrança gerada pela aplicação: provavelmente foi emitida direto na Cora. " +
          "Se a baixa da cobrança ainda vai chegar, a próxima sincronização liga sozinha. Valor e data iguais não bastam para conciliar.";
  } else {
    tone = "warning";
    title = "Saída pendente.";
    body = "Nenhuma despesa vinculada.";
  }

  const classes = {
    warning: "border-warning bg-warning-tint",
    danger: "border-danger bg-danger-tint",
    success: "border-success bg-success-tint",
    neutral: "border-border bg-surface-sunken",
  }[tone];

  return (
    <View className={`rounded-ds-md border px-3 py-3 ${classes}`}>
      <Text className="text-sm text-ink">
        <Text className="font-semibold">{title}</Text>
        {body ? ` ${body}` : ""}
      </Text>
    </View>
  );
}

function CandidateCard({ candidate, selected, onPress }: { candidate: ReconciliationCandidate; selected: boolean; onPress: () => void }) {
  const chips: { ok: boolean; label: string }[] = [
    { ok: candidate.criteria.charge_id_cited, label: "ID da cobrança" },
    { ok: candidate.criteria.amount_equal, label: "Valor" },
    { ok: candidate.criteria.date_window, label: "Data ±3 dias" },
    { ok: candidate.criteria.name_hint, label: "Sobrenome" },
  ].filter((c) => c.ok);

  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      onPress={onPress}
      className={`rounded-ds-md border px-3 py-3 ${selected ? "border-brand bg-brand-tint" : "border-border bg-surface"}`}
      style={{ gap: 4, borderWidth: selected ? 2 : 1 }}
    >
      <View className="flex-row items-start" style={{ gap: 10 }}>
        <View
          style={{
            width: 16,
            height: 16,
            marginTop: 2,
            borderRadius: 8,
            borderWidth: selected ? 5 : 1.5,
            borderColor: selected ? color.brand : color["border-strong"],
          }}
        />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View className="flex-row justify-between" style={{ gap: 8 }}>
            <Text className="text-sm font-semibold text-ink" style={{ flex: 1 }} numberOfLines={1}>
              {`#${candidate.id} · ${candidate.student?.name ?? "Aluno não informado"}`}
            </Text>
            <Text className="text-sm font-mono text-ink">{fmtMoney(candidate.amount)}</Text>
          </View>
          <Text className="text-xs text-ink-muted" numberOfLines={2}>
            {`${candidate.description ?? "Cobrança"} · vence ${fmtDate(candidate.due_date)} · ${INVOICE_STATUS_LABEL[candidate.status] ?? candidate.status}`}
            {candidate.guardian ? ` · resp. ${candidate.guardian.name}` : ""}
          </Text>
          {chips.length > 0 ? (
            <View className="flex-row flex-wrap" style={{ gap: 4, marginTop: 2 }}>
              {chips.map((chip) => (
                <View key={chip.label} className="flex-row items-center border border-success rounded-ds-sm px-1" style={{ gap: 2 }}>
                  <Check size={10} color={color.success} />
                  <Text className="text-xs text-success">{chip.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="flex-row items-center" style={{ gap: 2 }}>
              <X size={10} color={color["ink-subtle"]} />
              <Text className="text-xs text-ink-subtle">Nenhum critério confere</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
