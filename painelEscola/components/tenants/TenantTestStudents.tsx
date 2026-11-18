import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import FormInput from "../ui/FormInput";
import Icon from "../ui/Icon";
import { color } from "../../constants/theme";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { fetchBillingExclusions, setBillingExclusion, type BillingTestStudent } from "../../services/saas";

type Props = {
  tenantId: number;
};

/** Configurações da instituição: alunos de teste ficam fora da cobrança do app. */
export default function TenantTestStudents({ tenantId }: Props) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [excluded, setExcluded] = useState<BillingTestStudent[]>([]);
  const [matches, setMatches] = useState<BillingTestStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchBillingExclusions(tenantId, term);
      setExcluded(data.excluded);
      setMatches(data.matches);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível carregar os alunos de teste."));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    load(query);
  }, [load, query]);

  const toggle = async (student: BillingTestStudent) => {
    setSavingId(student.id);
    setError("");
    try {
      await setBillingExclusion(tenantId, student.id, !student.excluded);
      await load(query);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível atualizar o aluno."));
    } finally {
      setSavingId(null);
    }
  };

  const visible = query.length >= 2 ? matches : excluded;

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      <Text className="text-sm font-semibold text-ink">Alunos de teste</Text>
      <Text className="text-xs text-ink-muted">
        Quem for marcado aqui não entra na cobrança do app. A mudança vale na hora para os meses ainda abertos. Mês já fechado permanece como foi gravado.
      </Text>
      <FormInput label="Buscar aluno" value={search} onChangeText={setSearch} placeholder="Nome, matrícula ou e-mail" autoCapitalize="none" />
      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
      {loading ? <ActivityIndicator color={color.brand} /> : null}
      {!loading && query.length >= 2 && matches.length === 0 ? <Text className="text-sm text-ink-muted">Nenhum aluno encontrado.</Text> : null}
      {!loading && query.length < 2 && excluded.length === 0 ? <Text className="text-sm text-ink-muted">Nenhum aluno de teste. Busque pelo nome para marcar.</Text> : null}
      {visible.map((student) => (
        <Pressable key={student.id} onPress={() => savingId == null && toggle(student)} className={`flex-row items-center border rounded-ds-md ${student.excluded ? "border-brand bg-brand-tint" : "border-border"}`} style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
          <View className={`items-center justify-center border rounded-ds-sm ${student.excluded ? "bg-brand border-brand" : "border-border-strong"}`} style={{ width: 16, height: 16 }}>
            {student.excluded ? <Icon icon={Check} size={16} color={color["on-brand"]} /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text className="text-sm text-ink" numberOfLines={1}>{student.name}</Text>
            <Text className="text-xs text-ink-subtle" numberOfLines={1}>{[student.enrollment_number, student.email].filter(Boolean).join(" · ") || "Sem matrícula"}</Text>
          </View>
          <Text className="text-xs text-ink-muted">{savingId === student.id ? "Salvando" : student.excluded ? "fora da conta" : "conta"}</Text>
        </Pressable>
      ))}
    </View>
  );
}
