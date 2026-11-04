import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Download, Paperclip, Trash2, X } from "lucide-react-native";
import OverlayPortal from "../../ui/OverlayPortal";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import FormSelect from "../../ui/FormSelect";
import DatePickerInput from "../../ui/DatePickerInput";
import { fmtMoney } from "../../financeiro/format";
import { fmtDateTime } from "../cora/coraEvents";
import { color } from "../../../constants/theme";
import { useResponsiveLayout } from "../../../hooks/useResponsiveLayout";
import { getApiResponseMessage } from "../../../utils/apiErrors";
import { displayToISO, isoToDisplay } from "../../../utils/masks";
import {
  EXPENSE_PAYMENT_METHOD_LABEL,
  EXPENSE_SITUATION_LABEL,
  EXPENSE_SITUATION_TONE,
  dueHint,
  expenseHistoryLabel,
  fmtDate,
} from "./payablesLabels";
import {
  approveExpense,
  cancelExpense,
  downloadExpenseAttachment,
  fetchExpense,
  payExpense,
  removeExpenseAttachment,
  reopenExpense,
  submitExpense,
  uploadExpenseAttachment,
  type ExpenseDetail,
  type PayablesOptions,
} from "../../../services/payables";

type Props = {
  expenseId: number;
  options: PayablesOptions | null;
  permissions: string[];
  onClose: () => void;
  onEdit: (expense: ExpenseDetail) => void;
  /** Depois de uma ação gravada (para recarregar a lista). */
  onChanged: (message: string) => void;
};

type Pending = { kind: "pay" } | { kind: "reopen" } | { kind: "cancel" } | { kind: "remove"; attachmentId: number; name: string };

const MANAGE = "finance.payables.manage";
const APPROVE = "finance.payables.approve";
const MIN_REASON = 10;
const todayISO = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Detalhe da despesa. Registrar pagamento só atualiza o controle; nada é transferido no banco. */
export default function ExpenseDrawer({ expenseId, options, permissions, onClose, onEdit, onChanged }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [method, setMethod] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const canManage = permissions.includes(MANAGE);
  const canApprove = permissions.includes(APPROVE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await fetchExpense(expenseId));
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível carregar a despesa."));
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, action: () => Promise<{ expense: ExpenseDetail; message: string }>) => {
    setBusy(key);
    setError("");
    try {
      const result = await action();
      setDetail(result.expense);
      setPending(null);
      setReason("");
      onChanged(result.message);
    } catch (err: any) {
      setError(getApiResponseMessage(err?.response?.data, "Não foi possível concluir a ação."));
    } finally {
      setBusy(null);
    }
  };

  const openPending = (next: Pending) => {
    setPending(next);
    setReason("");
    setError("");
    setPaidAt(todayISO());
    setMethod(detail?.auto_debit ? "auto_debit" : "");
  };

  const confirmPending = () => {
    if (!detail || !pending) return;
    if (pending.kind === "pay") {
      if (!method) return setError("Selecione a forma de pagamento.");
      return run("pay", () => payExpense(detail.id, { paid_at: paidAt, payment_method: method }));
    }
    if (reason.trim().length < MIN_REASON) return setError(`Escreva um motivo com pelo menos ${MIN_REASON} caracteres.`);
    if (pending.kind === "reopen") return run("reopen", () => reopenExpense(detail.id, reason.trim()));
    if (pending.kind === "cancel") return run("cancel", () => cancelExpense(detail.id, reason.trim()));
    return run("remove", () => removeExpenseAttachment(detail.id, pending.attachmentId, reason.trim()));
  };

  const pickFile = () => fileInput.current?.click();
  const onFile = (file: File | undefined) => {
    if (!file || !detail) return;
    if (fileInput.current) fileInput.current.value = "";
    run("upload", () => uploadExpenseAttachment(detail.id, file));
  };

  const download = async (attachmentId: number, name: string) => {
    if (!detail) return;
    try {
      await downloadExpenseAttachment(detail.id, attachmentId, name);
    } catch {
      setError("Não foi possível baixar o comprovante.");
    }
  };

  const field = (label: string, value: string | null | undefined) => (
    <View key={label} style={{ width: isMobile ? "100%" : "50%", paddingVertical: 6, paddingRight: 12 }}>
      <Text className="text-xs text-ink-muted">{label}</Text>
      <Text className="text-sm text-ink">{value || "—"}</Text>
    </View>
  );

  const section = (title: string, children: React.ReactNode, action?: React.ReactNode) => (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-ink">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );

  const open = detail && !detail.system_managed && ["draft", "pending_approval", "approved"].includes(detail.status);
  const hint = detail ? dueHint(detail) : null;

  return (
    <OverlayPortal open onClose={onClose}>
      <Pressable style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} onPress={onClose} aria-label="Fechar detalhe" />
      <View
        className="bg-surface border-l border-border"
        role="dialog"
        aria-label={detail ? `Despesa ${detail.code}` : "Despesa"}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: isMobile ? "100%" : 560, maxWidth: "100%" }}
      >
        <View className="flex-row items-start border-b border-border" style={{ paddingHorizontal: 24, paddingVertical: 20, gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text className="font-mono text-ink-muted" style={{ fontSize: 12 }} numberOfLines={1}>
              {detail ? `${detail.code}${detail.supplier ? ` · ${detail.supplier.name}` : ""}` : "Despesa"}
            </Text>
            <Text className="font-semibold text-ink" style={{ fontSize: 20, lineHeight: 28 }} numberOfLines={2}>
              {detail?.description ?? ""}
            </Text>
            {detail ? (
              <View className="flex-row items-center flex-wrap" style={{ gap: 10 }}>
                <Text className="font-mono font-semibold text-ink" style={{ fontSize: 24 }}>{fmtMoney(detail.amount)}</Text>
                <Badge label={EXPENSE_SITUATION_LABEL[detail.situation]} tone={EXPENSE_SITUATION_TONE[detail.situation]} dot />
                {hint ? <Text className={`text-sm ${hint.late ? "text-danger" : "text-ink-muted"}`}>{hint.text}</Text> : null}
              </View>
            ) : null}
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" aria-label="Fechar" style={{ padding: 4 }}>
            <X size={20} color={color["ink-muted"]} />
          </Pressable>
        </View>

        {loading && !detail ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator color={color.brand} />
          </View>
        ) : detail ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 24 }}>
            {detail.system_managed ? (
              <View className="rounded-ds-md border border-border bg-surface-sunken px-3 py-3">
                <Text className="text-sm text-ink">Mantida pelo sistema a partir das tarifas do extrato Cora: o valor é a soma das saídas ligadas.</Text>
              </View>
            ) : null}

            {/* Ações */}
            {open || (detail.status === "paid" && canManage && !detail.system_managed) ? (
              <View style={{ gap: 12 }}>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {open && canManage ? <Button variant="secondary" label="Editar" onPress={() => onEdit(detail)} disabled={!!busy} /> : null}
                  {detail.status === "draft" && canManage ? (
                    <Button variant="secondary" label="Enviar para aprovação" loading={busy === "submit"} disabled={!!busy} onPress={() => run("submit", () => submitExpense(detail.id))} />
                  ) : null}
                  {["draft", "pending_approval"].includes(detail.status) && canApprove ? (
                    <Button variant="primary" label="Aprovar" loading={busy === "approve"} disabled={!!busy} onPress={() => run("approve", () => approveExpense(detail.id))} />
                  ) : null}
                  {detail.status === "approved" && canManage ? (
                    <Button variant="primary" label="Registrar pagamento" disabled={!!busy} onPress={() => openPending({ kind: "pay" })} />
                  ) : null}
                  {detail.status === "paid" && canManage && !detail.reconciled ? (
                    <Button variant="ghost" label="Desfazer pagamento" disabled={!!busy} onPress={() => openPending({ kind: "reopen" })} />
                  ) : null}
                  {open && canManage ? <Button variant="ghost" label="Cancelar despesa" disabled={!!busy} onPress={() => openPending({ kind: "cancel" })} /> : null}
                </View>

                {pending ? (
                  <View className="rounded-ds-md border border-border-strong px-3 py-3" style={{ gap: 12 }}>
                    {pending.kind === "pay" ? (
                      <>
                        <Text className="text-sm text-ink">
                          <Text className="font-semibold">Registrar pagamento não movimenta dinheiro.</Text> Só registra que a despesa foi paga.
                        </Text>
                        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                          <View style={{ flex: 1, minWidth: 180 }}>
                            <DatePickerInput label="Pago em" value={isoToDisplay(paidAt)} onChangeText={(v) => setPaidAt(displayToISO(v))} />
                          </View>
                          <View style={{ flex: 1, minWidth: 180 }}>
                            <FormSelect
                              label="Forma de pagamento"
                              value={method}
                              options={[{ value: "", label: "Selecione" }, ...(options?.payment_methods ?? [])]}
                              onChange={setMethod}
                            />
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text className="text-sm text-ink">
                          {pending.kind === "reopen"
                            ? "Desfazer o registro de pagamento (a despesa volta para aprovada)."
                            : pending.kind === "cancel"
                              ? "Cancelar a despesa."
                              : `Remover o comprovante “${pending.name}”.`}
                        </Text>
                        <FormInput label="Motivo (obrigatório)" value={reason} onChangeText={setReason} maxLength={500} />
                      </>
                    )}
                    <View className="flex-row justify-end" style={{ gap: 8 }}>
                      <Button variant="ghost" label="Voltar" onPress={() => setPending(null)} disabled={!!busy} />
                      <Button
                        variant={pending.kind === "pay" ? "primary" : "danger"}
                        label={pending.kind === "pay" ? "Registrar pagamento" : "Confirmar"}
                        loading={!!busy}
                        disabled={!!busy}
                        onPress={confirmPending}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {error ? (
              <Text className="text-sm text-danger" aria-live="polite">
                {error}
              </Text>
            ) : null}

            <View className="flex-row flex-wrap">
              {field("Fornecedor", detail.supplier?.name)}
              {field("Categoria", detail.category?.name)}
              {field("Centro de custo", detail.cost_center?.name)}
              {field("Vencimento", fmtDate(detail.due_date))}
              {field("Recorrência", detail.recurrence === "monthly" ? "Mensal" : "Avulsa")}
              {field("Débito automático", detail.auto_debit ? "Sim" : "Não")}
              {field("Pago em", detail.paid_at ? new Date(detail.paid_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null)}
              {field("Forma de pagamento", detail.payment_method ? EXPENSE_PAYMENT_METHOD_LABEL[detail.payment_method] ?? detail.payment_method : null)}
              {detail.notes ? field("Observações", detail.notes) : null}
            </View>

            {section(
              "Comprovantes",
              detail.attachments.length === 0 ? (
                <Text className="text-sm text-ink-muted">Nenhum comprovante anexado.</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {detail.attachments.map((a) => (
                    <View key={a.id} className="flex-row items-center border border-border rounded-ds-sm px-3 py-2" style={{ gap: 8 }}>
                      <Paperclip size={14} color={color["ink-muted"]} />
                      <Text className="text-sm text-ink" style={{ flex: 1 }} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Pressable onPress={() => download(a.id, a.name)} accessibilityRole="button" aria-label={`Baixar ${a.name}`} style={{ padding: 4 }}>
                        <Download size={16} color={color.brand} />
                      </Pressable>
                      {canManage && detail.status !== "cancelled" ? (
                        <Pressable onPress={() => openPending({ kind: "remove", attachmentId: a.id, name: a.name })} accessibilityRole="button" aria-label={`Remover ${a.name}`} style={{ padding: 4 }}>
                          <Trash2 size={16} color={color.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ),
              canManage && detail.status !== "cancelled" && !detail.system_managed && Platform.OS === "web" ? (
                <>
                  <Button size="sm" variant="secondary" icon={Paperclip} label="Anexar" loading={busy === "upload"} disabled={!!busy} onPress={pickFile} />
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                </>
              ) : undefined,
            )}

            {detail.bank_entries.length > 0
              ? section(
                  "Saídas do extrato ligadas",
                  <View style={{ gap: 4 }}>
                    {detail.bank_entries.map((e) => (
                      <Text key={e.id} className="text-xs text-ink-muted font-mono">
                        {`${fmtDateTime(e.occurred_at)} · ${fmtMoney(e.amount)}${e.description ? ` · ${e.description}` : ""}`}
                      </Text>
                    ))}
                  </View>,
                )
              : null}

            {section(
              "Histórico",
              <View style={{ gap: 8 }}>
                {detail.history.map((h) => (
                  <View key={h.id} style={{ gap: 2 }}>
                    <Text className="text-xs text-ink">{expenseHistoryLabel(h.action)}</Text>
                    <Text className="text-xs text-ink-muted">
                      {`${h.user?.name ?? "Sistema"} · ${fmtDateTime(h.created_at)}${h.reason ? ` · “${h.reason}”` : ""}`}
                    </Text>
                  </View>
                ))}
              </View>,
            )}
          </ScrollView>
        ) : (
          <Text className="text-sm text-danger" style={{ padding: 24 }}>
            {error}
          </Text>
        )}
      </View>
    </OverlayPortal>
  );
}
