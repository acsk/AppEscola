import React from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import Button from "./Button";

type Props = {
  currentPage: number;
  lastPage: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ currentPage, lastPage, total, perPage, onPageChange }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 520;
  const start = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, total);

  return (
    <View
      role="navigation"
      aria-label="Paginação"
      className="items-center justify-between py-3"
      style={{ flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 16 }}
    >
      <Text className="font-mono text-ink-muted" style={{ fontSize: 13, lineHeight: 20 }}>
        {start}–{end} de {total}
      </Text>

      <View className="flex-row items-center" style={{ gap: 8 }}>
        <Button
          size="sm"
          icon={ChevronLeft}
          iconOnly
          accessibilityLabel="Página anterior"
          disabled={currentPage <= 1}
          onPress={() => onPageChange(currentPage - 1)}
        />
        <Text className="font-mono text-ink" style={{ fontSize: 13, lineHeight: 20 }} aria-live="polite">
          {currentPage} / {lastPage}
        </Text>
        <Button
          size="sm"
          icon={ChevronRight}
          iconOnly
          accessibilityLabel="Próxima página"
          disabled={currentPage >= lastPage}
          onPress={() => onPageChange(currentPage + 1)}
        />
      </View>
    </View>
  );
}
