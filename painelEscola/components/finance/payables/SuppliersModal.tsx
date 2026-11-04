import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import Modal from "../../ui/Modal";
import Button from "../../ui/Button";
import Badge from "../../ui/Badge";
import FormInput from "../../ui/FormInput";
import { color } from "../../../constants/theme";
import { getApiResponseMessage, parseApiErrors } from "../../../utils/apiErrors";
import { fetchSuppliers, saveSupplier, type Supplier } from "../../../services/payables";

type Props = {
  visible: boolean;
  canManage: boolean;
  onClose: () => void;
  /** Lista mudou (para recarregar as opções do formulário de despesa). */
  onChanged: () => void;
};

type Draft = { id?: number; name: string; document: string; email: string; phone: string; notes: string; active: boolean; system_managed?: boolean };

const EMPTY: Draft = { name: "", document: "", email: "", phone: "", notes: "", active: true };

export default function SuppliersModal({ visible, canManage, onClose, onChanged }: Props) {
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchSuppliers(search.trim() || undefined));
    } catch (err: any) {
      setMessage(getApiResponseMessage(err?.response?.data, "Não foi possível carregar os fornecedores."));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [visible, load, search]);

  useEffect(() => {
    if (visible) {
      setDraft(null);
      setMessage("");
    }
  }, [visible]);

  const edit = (s: Supplier) =>
    setDraft({ id: s.id, name: s.name, document: s.document ?? "", email: s.email ?? "", phone: s.phone ?? "", notes: s.notes ?? "", active: s.active, system_managed: s.system_managed });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return setErrors({ name: "Informe o nome." });
    setSaving(true);
    setErrors({});
    try {
      const { message: msg } = await saveSupplier(
        { name: draft.name.trim(), document: draft.document || null, email: draft.email || null, phone: draft.phone || null, notes: draft.notes || null, active: draft.active },
        draft.id,
      );
      setMessage(msg);
      setDraft(null);
      load();
      onChanged();
    } catch (err: any) {
      const data = err?.response?.data;
      setErrors(parseApiErrors(data?.errors ?? {}));
      setMessage(getApiResponseMessage(data, "Não foi possível salvar o fornecedor."));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Draft) => (value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <Modal
      visible={visible}
      title="Fornecedores"
      onClose={onClose}
      size="md"
      footer={
        draft ? (
          <View className="flex-row justify-end" style={{ gap: 8 }}>
            <Button variant="ghost" label="Voltar" onPress={() => setDraft(null)} disabled={saving} />
            <Button variant="primary" label="Salvar fornecedor" loading={saving} disabled={saving} onPress={save} />
          </View>
        ) : (
          <View className="flex-row justify-end">
            <Button variant="ghost" label="Fechar" onPress={onClose} />
          </View>
        )
      }
    >
      {draft ? (
        <View style={{ gap: 12 }}>
          <FormInput label="Nome" required value={draft.name} onChangeText={set("name")} error={errors.name} maxLength={150} />
          <FormInput label="CNPJ/CPF" value={draft.document} onChangeText={set("document")} maxLength={20} />
          <FormInput label="E-mail" value={draft.email} onChangeText={set("email")} error={errors.email} keyboardType="email-address" maxLength={150} />
          <FormInput label="Telefone" value={draft.phone} onChangeText={set("phone")} maxLength={30} />
          <FormInput label="Observações" value={draft.notes} onChangeText={set("notes")} maxLength={500} />
          {draft.id && !draft.system_managed ? (
            <Pressable onPress={() => setDraft((d) => (d ? { ...d, active: !d.active } : d))} role="switch" aria-checked={draft.active}>
              <Text className="text-sm text-brand underline">{draft.active ? "Desativar fornecedor" : "Reativar fornecedor"}</Text>
            </Pressable>
          ) : null}
          {message ? <Text className="text-sm text-danger">{message}</Text> : null}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View className="flex-row items-end" style={{ gap: 8 }}>
            <View style={{ flex: 1 }}>
              <FormInput label="Buscar" value={search} onChangeText={setSearch} placeholder="Nome do fornecedor" />
            </View>
            {canManage ? <Button variant="primary" icon={Plus} label="Novo" onPress={() => setDraft({ ...EMPTY })} /> : null}
          </View>
          {message ? <Text className="text-sm text-success">{message}</Text> : null}
          {loading ? (
            <ActivityIndicator color={color.brand} />
          ) : items.length === 0 ? (
            <Text className="text-sm text-ink-muted">Nenhum fornecedor cadastrado.</Text>
          ) : (
            items.map((s) => (
              <Pressable
                key={s.id}
                onPress={canManage ? () => edit(s) : undefined}
                className="flex-row items-center border border-border rounded-ds-sm px-3 py-2"
                style={{ gap: 8 }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="text-sm text-ink" numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text className="text-xs text-ink-muted" numberOfLines={1}>
                    {[s.document, s.email, s.phone].filter(Boolean).join(" · ") || "Sem contato"}
                  </Text>
                </View>
                {s.system_managed ? <Badge label="Sistema" tone="neutral" /> : null}
                {!s.active ? <Badge label="Inativo" tone="neutral" /> : null}
              </Pressable>
            ))
          )}
        </View>
      )}
    </Modal>
  );
}
