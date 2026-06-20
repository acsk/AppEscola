import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CORA_DUE_DATE_POLICY_HINT } from "../../constants/coraBilling";

type Props = {
  message?: string | null;
  /** Destaque quando o vencimento local será alterado na emissão. */
  emphasized?: boolean;
};

export default function CoraDueDatePolicyBanner({ message, emphasized = false }: Props) {
  const text = (message ?? CORA_DUE_DATE_POLICY_HINT).trim();
  if (!text) return null;

  return (
    <View
      className={`rounded-xl border px-3 py-2.5 flex-row gap-2 ${
        emphasized ? "bg-amber-50 border-amber-200" : "bg-sky-50 border-sky-200"
      }`}
    >
      <Ionicons
        name="information-circle-outline"
        size={18}
        color={emphasized ? "#B45309" : "#0369A1"}
        style={{ marginTop: 1 }}
      />
      <Text
        className={`text-xs flex-1 leading-relaxed ${
          emphasized ? "text-amber-900" : "text-sky-900"
        }`}
      >
        {text}
      </Text>
    </View>
  );
}
