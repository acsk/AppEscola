import React, { useRef } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  label?: string;
  required?: boolean;
  hint?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  /** Nome do arquivo já salvo (modo edição, quando nenhum novo foi escolhido) */
  currentFileLabel?: string | null;
  error?: string;
  disabled?: boolean;
  onInvalid?: (message: string) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PdfFileUploadField({
  label = "Arquivo PDF",
  required = false,
  hint,
  value,
  onChange,
  currentFileLabel = null,
  error,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = () => {
    if (disabled || Platform.OS !== "web") return;
    inputRef.current?.click();
  };

  const handleInputChange = (e: any) => {
    const file = e.target?.files?.[0] ?? null;
    onChange(file);
  };

  const clearSelection = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const borderColor = error ? "#FCA5A5" : value ? "#C4B5FD" : "#E5E7EB";
  const bgColor = error ? "#FEF2F2" : value ? "#F5F3FF" : "#F9FAFB";

  return (
    <View>
      {label ? (
        <Text style={{ fontSize: 12, fontWeight: "500", color: "#4B5563", marginBottom: 6 }}>
          {label}
          {required ? <Text style={{ color: "#EF4444" }}> *</Text> : null}
        </Text>
      ) : null}

      {hint ? (
        <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, lineHeight: 18 }}>{hint}</Text>
      ) : null}

      <View
        style={{
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          borderStyle: value || currentFileLabel ? "solid" : "dashed",
          backgroundColor: bgColor,
          padding: 14,
          gap: 12,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {value ? (
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: "#EDE9FE",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="document-text" size={22} color="#7C3AED" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
                {value.name}
              </Text>
              <Text className="text-xs text-gray-500 mt-0.5">{formatFileSize(value.size)}</Text>
            </View>
            <TouchableOpacity
              onPress={clearSelection}
              disabled={disabled}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white"
              activeOpacity={0.8}
              accessibilityLabel="Remover arquivo selecionado"
            >
              <Text className="text-xs font-semibold text-gray-600">Remover</Text>
            </TouchableOpacity>
          </View>
        ) : currentFileLabel ? (
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: "#E5E7EB",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="document-attach-outline" size={22} color="#6B7280" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-xs text-gray-500">Arquivo atual</Text>
              <Text className="text-sm font-medium text-gray-700 mt-0.5" numberOfLines={1}>
                {currentFileLabel}
              </Text>
            </View>
          </View>
        ) : (
          <View className="items-center py-2">
            <Ionicons name="cloud-upload-outline" size={28} color="#9CA3AF" />
            <Text className="text-sm text-gray-600 mt-2 text-center">
              Nenhum PDF selecionado
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={openPicker}
          disabled={disabled}
          className="flex-row items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5"
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={value || currentFileLabel ? "Trocar arquivo PDF" : "Selecionar arquivo PDF"}
        >
          <Ionicons name="folder-open-outline" size={16} color="#fff" />
          <Text className="text-sm font-semibold text-white">
            {value || currentFileLabel ? "Trocar PDF" : "Selecionar PDF"}
          </Text>
        </TouchableOpacity>

        {Platform.OS === "web" ? (
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={disabled}
            onChange={handleInputChange}
            style={{ display: "none" }}
            aria-hidden
          />
        ) : null}
      </View>

      {error ? <Text className="text-xs text-red-600 mt-1.5">{error}</Text> : null}
    </View>
  );
}
