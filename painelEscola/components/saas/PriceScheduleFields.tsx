import React from "react";
import { Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";

export type PriceTierForm = { from: string; until: string; price: string };

type Props = {
  tiers: PriceTierForm[];
  onChange: (tiers: PriceTierForm[]) => void;
  error?: string;
};

/** Faixas de preço por aluno. A data final vazia significa "daqui em diante". */
export default function PriceScheduleFields({ tiers, onChange, error }: Props) {
  const update = (index: number, patch: Partial<PriceTierForm>) =>
    onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));

  return (
    <View style={{ gap: 8 }}>
      <Text className="text-sm font-semibold text-ink">Faixas de preço por aluno</Text>
      <Text className="text-xs text-ink-muted">
        Antes da primeira data o aluno não é cobrado. Deixe a data final vazia na última faixa para o valor seguir dali em diante. As faixas não podem se sobrepor.
      </Text>
      {tiers.map((tier, index) => (
        <View key={index} className="flex-row flex-wrap items-end" style={{ columnGap: 12 }}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <FormInput label={index === 0 ? "De" : `De (${index + 1})`} value={tier.from} onChangeText={(v) => update(index, { from: v })} placeholder="AAAA-MM-DD" autoCapitalize="none" />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <FormInput label="Até" value={tier.until} onChangeText={(v) => update(index, { until: v })} placeholder="Vazio = em diante" autoCapitalize="none" />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <FormInput label="R$ por aluno" valueFormat="currency" value={tier.price} onChangeText={(v) => update(index, { price: v })} placeholder="0,00" />
          </View>
          <View style={{ paddingBottom: 16 }}>
            <Button size="sm" variant="ghost" label="Remover" onPress={() => onChange(tiers.filter((_, i) => i !== index))} />
          </View>
        </View>
      ))}
      <Button
        size="sm"
        variant="secondary"
        icon={Plus}
        label="Adicionar faixa"
        onPress={() => onChange([...tiers, { from: "", until: "", price: "" }])}
        style={{ alignSelf: "flex-start" }}
      />
      {error ? <Text className="text-xs font-medium text-danger">{error}</Text> : null}
    </View>
  );
}
