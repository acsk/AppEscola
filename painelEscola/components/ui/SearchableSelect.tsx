import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SearchableOption = {
  value: string;
  label: string;
  /** Segunda linha exibida no preview e na lista (ex: horários) */
  sublabel?: string;
};

interface Props {
  label?: string;
  required?: boolean;
  placeholder?: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Título da modal */
  modalTitle?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SearchableSelect({
  label,
  required,
  placeholder = "Selecione...",
  options,
  value,
  onChange,
  error,
  disabled = false,
  modalTitle = "Selecionar",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const handleSelect = useCallback(
    (opt: SearchableOption) => {
      onChange(opt.value);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  const handleClear = () => {
    onChange("");
    setQuery("");
  };

  const borderColor = error ? "#EF4444" : "#E5E7EB";

  return (
    <View>
      {/* Label */}
      {label && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "500",
            color: "#4B5563",
            marginBottom: 6,
          }}
        >
          {label}
          {required && <Text style={{ color: "#EF4444" }}> *</Text>}
        </Text>
      )}

      {/* Trigger */}
      <TouchableOpacity
        onPress={() => { if (!disabled) setOpen(true); }}
        activeOpacity={0.8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: disabled ? "#F9FAFB" : "white",
          opacity: disabled ? 0.6 : 1,
          minHeight: 40,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            color: selected ? "#374151" : "#9CA3AF",
          }}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {selected && !disabled && (
            <TouchableOpacity
              onPress={handleClear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
          <Ionicons name="search-outline" size={16} color="#7C3AED" />
        </View>
      </TouchableOpacity>

      {/* Preview da opção selecionada */}
      {selected && (
        <View
          style={{
            marginTop: 8,
            backgroundColor: "#F5F3FF",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderLeftWidth: 3,
            borderLeftColor: "#7C3AED",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#5B21B6" }}>
            {selected.label}
          </Text>
          {selected.sublabel && (
            <Text style={{ fontSize: 12, color: "#7C3AED", marginTop: 2 }}>
              {selected.sublabel}
            </Text>
          )}
        </View>
      )}

      {/* Erro */}
      {error && (
        <Text style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>
          {error}
        </Text>
      )}

      {/* Modal de seleção */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => { setOpen(false); setQuery(""); }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: 520,
              maxHeight: "80%",
              backgroundColor: "white",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>
                {modalTitle}
              </Text>
              <TouchableOpacity
                onPress={() => { setOpen(false); setQuery(""); }}
                style={{
                  padding: 4,
                  backgroundColor: "#F3F4F6",
                  borderRadius: 8,
                }}
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Input de busca */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
                gap: 8,
              }}
            >
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <input
                autoFocus
                placeholder="Buscar..."
                value={query}
                onChange={(e: any) => setQuery(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: "#374151",
                  backgroundColor: "transparent",
                }}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Contador */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 6,
                backgroundColor: "#FAFAFA",
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
              }}
            >
              <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
                {filtered.length} opção{filtered.length !== 1 ? "ões" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {/* Lista */}
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filtered.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 40,
                  }}
                >
                  <Ionicons name="search-outline" size={28} color="#E5E7EB" />
                  <Text
                    style={{ fontSize: 13, color: "#9CA3AF", marginTop: 8 }}
                  >
                    Nenhuma opção encontrada
                  </Text>
                </View>
              ) : (
                filtered.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => handleSelect(opt)}
                      activeOpacity={0.75}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        backgroundColor: isSelected ? "#F5F3FF" : "transparent",
                        borderBottomWidth: 1,
                        borderBottomColor: "#F9FAFB",
                        borderLeftWidth: 3,
                        borderLeftColor: isSelected ? "#7C3AED" : "transparent",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: isSelected ? "600" : "400",
                            color: isSelected ? "#5B21B6" : "#374151",
                          }}
                        >
                          {opt.label}
                        </Text>
                        {opt.sublabel && (
                          <Text
                            style={{
                              fontSize: 12,
                              color: isSelected ? "#7C3AED" : "#9CA3AF",
                              marginTop: 2,
                            }}
                          >
                            {opt.sublabel}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color="#7C3AED"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Footer */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6",
              }}
            >
              <TouchableOpacity
                onPress={() => { setOpen(false); setQuery(""); }}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: "#F3F4F6",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

