import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";
import FormInput from "../../ui/FormInput";
import { color } from "../../../constants/theme";
import { getApiResponseMessage } from "../../../utils/apiErrors";
import { fetchCatalog, saveCatalogItem, type CatalogItem, type CatalogKind } from "../../../services/payables";

type Props = {
  kind: CatalogKind;
  title: string;
  canConfigure: boolean;
};

/** Lista editável de categorias ou centros de custo. Os usados pelo sistema podem ser renomeados, não desativados. */
export default function CatalogEditor({ kind, title, canConfigure }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchCatalog(kind));
    } catch (err: any) {
      setMessage({ tone: "danger", text: getApiResponseMessage(err?.response?.data, "Não foi possível carregar a lista.") });
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string, input: { name: string; active?: boolean }, id?: number) => {
    if (!input.name.trim()) return;
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ tone: "success", text: await saveCatalogItem(kind, { ...input, name: input.name.trim() }, id) });
      setEditing(null);
      setNewName("");
      load();
    } catch (err: any) {
      const data = err?.response?.data;
      const fieldError = data?.errors?.name?.[0];
      setMessage({ tone: "danger", text: fieldError ? "Já existe um item com esse nome." : getApiResponseMessage(data, "Não foi possível salvar.") });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, minWidth: 260, gap: 10 }}>
      <Text className="text-sm font-semibold text-ink">{title}</Text>
      {loading ? (
        <ActivityIndicator color={color.brand} />
      ) : (
        <View className="border border-border rounded-ds-sm">
          {items.map((item, i) => (
            <View key={item.id} className={`px-3 py-2 ${i > 0 ? "border-t border-border" : ""}`} style={{ gap: 6 }}>
              {editing?.id === item.id ? (
                <View className="flex-row items-end" style={{ gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <FormInput label="Nome" value={editing.name} onChangeText={(name) => setEditing({ id: item.id, name })} maxLength={80} dense />
                  </View>
                  <Button size="sm" variant="ghost" label="Voltar" onPress={() => setEditing(null)} disabled={!!busy} />
                  <Button size="sm" variant="primary" label="Salvar" loading={busy === `edit-${item.id}`} disabled={!!busy} onPress={() => save(`edit-${item.id}`, { name: editing.name }, item.id)} />
                </View>
              ) : (
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text className={`text-sm ${item.active ? "text-ink" : "text-ink-subtle"}`} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-xs text-ink-muted">{`${item.expenses_count} despesa${item.expenses_count === 1 ? "" : "s"}`}</Text>
                  </View>
                  {item.system_managed ? <Badge label="Sistema" tone="neutral" /> : null}
                  {!item.active ? <Badge label="Inativa" tone="neutral" /> : null}
                  {canConfigure ? (
                    <>
                      <Pressable onPress={() => setEditing({ id: item.id, name: item.name })} accessibilityRole="button" aria-label={`Renomear ${item.name}`}>
                        <Text className="text-sm text-brand underline">Renomear</Text>
                      </Pressable>
                      {!item.system_managed ? (
                        <Pressable
                          onPress={() => save(`toggle-${item.id}`, { name: item.name, active: !item.active }, item.id)}
                          accessibilityRole="button"
                          aria-label={`${item.active ? "Desativar" : "Reativar"} ${item.name}`}
                          disabled={!!busy}
                        >
                          <Text className="text-sm text-brand underline">{item.active ? "Desativar" : "Reativar"}</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {canConfigure ? (
        <View className="flex-row items-end" style={{ gap: 8 }}>
          <View style={{ flex: 1 }}>
            <FormInput label="Novo" value={newName} onChangeText={setNewName} maxLength={80} placeholder="Nome" dense />
          </View>
          <Button size="sm" icon={Plus} label="Adicionar" loading={busy === "new"} disabled={!!busy || !newName.trim()} onPress={() => save("new", { name: newName })} />
        </View>
      ) : null}
      {message ? <Text className={`text-sm ${message.tone === "success" ? "text-success" : "text-danger"}`}>{message.text}</Text> : null}
    </View>
  );
}
