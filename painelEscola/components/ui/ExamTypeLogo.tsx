import React, { useState } from "react";
import { Image, Text, View } from "react-native";

type Props = {
  label?: string | null;
  logoUrl?: string | null;
  /** Lado do quadrado em px. */
  size?: number;
};

/** Sigla curta da modalidade: "IFAL", "CPM", "ENEM" ficam como estão; nomes longos viram iniciais. */
export function examTypeInitials(label?: string | null): string {
  const words = (label ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return "—";
  // Sigla no início ("CPM (Colégio da Polícia Militar)", "ENEM", "IFAL") vale como está.
  if (/^[A-Z0-9]{2,5}$/.test(words[0])) return words[0];
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  const initials = words.filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w)).map((w) => w[0]).join("");
  return (initials || words[0]).slice(0, 4).toUpperCase();
}

/**
 * Ícone da modalidade (IFAL, CPM, ENEM…): logo enviado pelo super admin em Tipos de prova;
 * sem logo (ou se a imagem falhar), mostra a sigla num quadrado neutro.
 */
export default function ExamTypeLogo({ label, logoUrl, size = 32 }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = !!logoUrl && !failed;
  return (
    <View
      className={`items-center justify-center rounded-ds-md border border-border ${showImage ? "bg-surface" : "bg-brand-tint"}`}
      style={{ width: size, height: size, overflow: "hidden" }}
      accessibilityLabel={label ? `Modalidade ${label}` : "Modalidade"}
    >
      {showImage ? (
        <Image source={{ uri: logoUrl! }} style={{ width: size - 4, height: size - 4 }} resizeMode="contain" onError={() => setFailed(true)} />
      ) : (
        <Text className="font-semibold text-brand" style={{ fontSize: Math.max(9, Math.round(size / 3.4)) }} numberOfLines={1}>
          {examTypeInitials(label)}
        </Text>
      )}
    </View>
  );
}
