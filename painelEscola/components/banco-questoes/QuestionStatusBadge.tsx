import React from "react";
import { View } from "react-native";
import Badge from "../ui/Badge";

type Props = { isAnnulled: boolean; isOutdated: boolean };

/** Situação da questão com palavra (a cor nunca é a única pista). */
export default function QuestionStatusBadge({ isAnnulled, isOutdated }: Props) {
  if (!isAnnulled && !isOutdated) return <Badge label="Regular" tone="success" dot />;
  return (
    <View className="flex-row flex-wrap" style={{ gap: 4 }}>
      {isAnnulled && <Badge label="Anulada" tone="danger" dot />}
      {isOutdated && <Badge label="Desatualizada" tone="warning" dot />}
    </View>
  );
}
