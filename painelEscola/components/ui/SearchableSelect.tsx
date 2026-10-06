import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import OverlayPortal from "./OverlayPortal";

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
  /** Busca assíncrona no servidor; quando informado, a lista vem da API em vez de filtrar `options` localmente */
  onSearch?: (query: string) => Promise<SearchableOption[]>;
  /** Opção selecionada quando não está na lista atual (ex.: busca server-side) */
  selectedOption?: SearchableOption;
  /** Exibe caixa roxa abaixo do trigger (desligar em formulários densos) */
  showSelectedPreview?: boolean;
  dense?: boolean;
}

const MODAL_WIDTH = 380;
const MODAL_HEIGHT = 420;
const LIST_HEIGHT = 240;

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
  onSearch,
  selectedOption,
  showSelectedPreview = true,
  dense = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [asyncOptions, setAsyncOptions] = useState<SearchableOption[]>([]);
  const [searching, setSearching] = useState(false);
  /** Mantém label/sublabel visíveis após seleção em modo assíncrono */
  const [pickedOption, setPickedOption] = useState<SearchableOption | null>(null);

  const asyncMode = !!onSearch;

  const selected =
    (selectedOption?.value === value ? selectedOption : null) ??
    (pickedOption?.value === value ? pickedOption : null) ??
    options.find((o) => o.value === value) ??
    asyncOptions.find((o) => o.value === value);

  const filtered = asyncMode
    ? asyncOptions
    : query.trim()
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(query.toLowerCase()) ||
            (o.sublabel ?? "").toLowerCase().includes(query.toLowerCase())
        )
      : options;

  useEffect(() => {
    if (!open || !onSearch) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await onSearch(query);
        if (!cancelled) setAsyncOptions(results);
      } catch {
        if (!cancelled) setAsyncOptions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, onSearch]);

  const handleSelect = useCallback(
    (opt: SearchableOption) => {
      setPickedOption(opt);
      onChange(opt.value);
      setOpen(false);
      setQuery("");
      setAsyncOptions([]);
    },
    [onChange]
  );

  const handleClear = () => {
    onChange("");
    setQuery("");
    setPickedOption(null);
  };

  useEffect(() => {
    if (!value) {
      setPickedOption(null);
      return;
    }
    if (selectedOption?.value === value) {
      setPickedOption(selectedOption);
    }
  }, [value, selectedOption]);

  const borderColor = error ? "var(--ds-danger)" : "var(--ds-border-strong)"; // `border-strong` em controles (≥3:1)

  const closePicker = () => {
    setOpen(false);
    setQuery("");
    setAsyncOptions([]);
  };

  const pickerContent = (
      <View
        style={{
          width: MODAL_WIDTH,
          height: MODAL_HEIGHT,
          maxWidth: "92vw" as unknown as number,
          backgroundColor: "var(--ds-surface)",
          borderRadius: 6,
          overflow: "hidden",
          flexDirection: "column",
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
            borderBottomColor: "var(--ds-surface-sunken)",
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "var(--ds-ink)" }}>
            {modalTitle}
          </Text>
          <TouchableOpacity
            onPress={closePicker}
            style={{
              padding: 4,
              backgroundColor: "var(--ds-surface-sunken)",
              borderRadius: 4,
            }}
          >
            <Ionicons name="close" size={18} color="var(--ds-ink-muted)" />
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
            borderBottomColor: "var(--ds-surface-sunken)",
            gap: 8,
          }}
        >
          <Ionicons name="search-outline" size={16} color="var(--ds-ink-subtle)" />
          {Platform.OS === "web" ? (
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
                color: "var(--ds-ink)",
                backgroundColor: "transparent",
              }}
            />
          ) : (
            <TextInput
              autoFocus
              placeholder="Buscar..."
              value={query}
              onChangeText={setQuery}
              style={{
                flex: 1,
                fontSize: 14,
                color: "var(--ds-ink)",
                padding: 0,
              }}
              placeholderTextColor="var(--ds-ink-subtle)"
            />
          )}
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Contador */}
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 6,
            backgroundColor: "var(--ds-surface-sunken)",
            borderBottomWidth: 1,
            borderBottomColor: "var(--ds-surface-sunken)",
          }}
        >
          <Text style={{ fontSize: 11, color: "var(--ds-ink-subtle)" }}>
            {searching
              ? "Buscando..."
              : `${filtered.length} opção${filtered.length !== 1 ? "ões" : ""} encontrada${filtered.length !== 1 ? "s" : ""}`}
          </Text>
        </View>

        {/* Lista (altura fixa para rolagem) */}
        <ScrollView
          style={{ height: LIST_HEIGHT }}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {searching && filtered.length === 0 ? (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 40,
              }}
            >
              <ActivityIndicator size="small" color="var(--ds-brand)" />
              <Text
                style={{ fontSize: 13, color: "var(--ds-ink-subtle)", marginTop: 8 }}
              >
                Buscando...
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 40,
              }}
            >
              <Ionicons name="search-outline" size={28} color="var(--ds-border)" />
              <Text
                style={{ fontSize: 13, color: "var(--ds-ink-subtle)", marginTop: 8 }}
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
                    backgroundColor: isSelected ? "var(--ds-brand-tint)" : "transparent",
                    borderBottomWidth: 1,
                    borderBottomColor: "var(--ds-surface-sunken)",
                    borderLeftWidth: 3,
                    borderLeftColor: isSelected ? "var(--ds-brand)" : "transparent",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: isSelected ? "600" : "400",
                        color: isSelected ? "var(--ds-brand-hover)" : "var(--ds-ink)",
                      }}
                    >
                      {opt.label}
                    </Text>
                    {opt.sublabel && (
                      <Text
                        style={{
                          fontSize: 13,
                          color: isSelected ? "var(--ds-brand)" : "var(--ds-ink-subtle)",
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
                      color="var(--ds-brand)"
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
            borderTopColor: "var(--ds-surface-sunken)",
          }}
        >
          <TouchableOpacity
            onPress={closePicker}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 8,
              borderRadius: 4,
              backgroundColor: "var(--ds-surface-sunken)",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: "var(--ds-ink)" }}>
              Fechar
            </Text>
          </TouchableOpacity>
        </View>
      </View>
  );

  return (
    <View style={{ marginBottom: dense ? 8 : 16 }}>
      {/* Label */}
      {label && (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "500",
            color: "var(--ds-ink)",
            marginBottom: 6,
          }}
        >
          {label}
          {required && <Text style={{ color: "var(--ds-danger)" }}> *</Text>}
        </Text>
      )}

      {/* Trigger */}
      <TouchableOpacity
        onPress={() => { if (!disabled) setOpen(true); }}
        activeOpacity={0.8}
        role="combobox"
        aria-label={label ?? placeholder}
        aria-expanded={open}
        aria-disabled={disabled}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor,
          borderRadius: 4,
          paddingHorizontal: 12,
          backgroundColor: disabled ? "var(--ds-surface-sunken)" : "var(--ds-surface)",
          opacity: disabled ? 0.45 : 1,
          height: dense ? 32 : 38,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            color: selected ? "var(--ds-ink)" : "var(--ds-ink-subtle)",
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
              <Ionicons name="close-circle" size={16} color="var(--ds-ink-subtle)" />
            </TouchableOpacity>
          )}
          <Ionicons name="search-outline" size={16} color="var(--ds-brand)" />
        </View>
      </TouchableOpacity>

      {/* Linha secundária da opção selecionada (ex.: matrícula do aluno), como texto de ajuda */}
      {showSelectedPreview && selected?.sublabel ? (
        <Text style={{ fontSize: 12, lineHeight: 16, color: "var(--ds-ink-subtle)", marginTop: 6 }}>{selected.sublabel}</Text>
      ) : null}

      {/* Erro */}
      {error && (
        <Text style={{ fontSize: 12, fontWeight: "500", color: "var(--ds-danger)", marginTop: 6 }}>
          {error}
        </Text>
      )}

      {/* Modal de seleção — no web porta para body (acima do Modal do formulário) */}
      <OverlayPortal open={open} onClose={closePicker}>
        {pickerContent}
      </OverlayPortal>
    </View>
  );
}

