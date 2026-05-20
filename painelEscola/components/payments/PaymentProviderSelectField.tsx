import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PaymentProviderLogo from "./PaymentProviderLogo";
import { listPaymentProviders, PaymentProvider } from "../../services/payments";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";

const PROVIDER_META: Record<string, { name: string; sublabel: string }> = {
  cora: {
    name: "Cora",
    sublabel: "Gateway com PIX, boleto e cobrança híbrida",
  },
  manual: {
    name: "Manual",
    sublabel: "Sem gateway — confirmação pela secretaria",
  },
};

export type PaymentProviderSelectOption = {
  slug: string;
  name: string;
  logo_url?: string | null;
  sublabel?: string;
};

type Props = {
  label: string;
  description?: string;
  required?: boolean;
  value: string;
  onChange: (slug: string) => void;
  /** Slugs válidos (ex.: schema.payment.default_provider.options) */
  options: string[];
  error?: string;
  disabled?: boolean;
};

function buildSelectOptions(
  slugs: string[],
  catalog: PaymentProvider[]
): PaymentProviderSelectOption[] {
  return slugs.map((slug) => {
    const normalized = slug.toLowerCase();
    const fromApi = catalog.find((item) => item.slug === normalized);
    const meta = PROVIDER_META[normalized];

    return {
      slug: normalized,
      name: fromApi?.name ?? meta?.name ?? normalized,
      logo_url: fromApi?.logo_url ?? null,
      sublabel: meta?.sublabel,
    };
  });
}

export default function PaymentProviderSelectField({
  label,
  description,
  required,
  value,
  onChange,
  options,
  error,
  disabled = false,
}: Props) {
  const { isMobile } = useResponsiveLayout();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<PaymentProvider[]>([]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listPaymentProviders();
      setCatalog(list);
    } catch {
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const selectOptions = useMemo(
    () => buildSelectOptions(options, catalog),
    [options, catalog]
  );

  const selected = selectOptions.find((item) => item.slug === value.toLowerCase());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectOptions;
    return selectOptions.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        (item.sublabel ?? "").toLowerCase().includes(q)
    );
  }, [query, selectOptions]);

  const borderColor = error ? "#FCA5A5" : "#E5E7EB";

  const handleSelect = (slug: string) => {
    onChange(slug);
    setOpen(false);
    setQuery("");
  };

  return (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-gray-700 mb-1.5">
        {label}
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>

      {description ? (
        <Text className="text-xs text-gray-500 mb-2">{description}</Text>
      ) : null}

      <TouchableOpacity
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        activeOpacity={0.85}
        disabled={disabled}
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: disabled ? "#F3F4F6" : "#F9FAFB",
          opacity: disabled ? 0.75 : 1,
          minHeight: 52,
          gap: 12,
        }}
      >
        <PaymentProviderLogo uri={selected?.logo_url ?? null} size={40} rounded={10} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            className="text-sm font-semibold text-gray-800"
            numberOfLines={1}
          >
            {selected?.name ?? "Selecione o provedor"}
          </Text>
          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
            {selected
              ? selected.sublabel ?? selected.slug
              : "Toque para abrir a lista"}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#6B7280" />
      </TouchableOpacity>

      {error ? <Text className="text-xs text-red-500 mt-1.5">{error}</Text> : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOpen(false);
          setQuery("");
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
            padding: isMobile ? 16 : 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "82%",
              backgroundColor: "white",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
              <Text className="text-base font-bold text-gray-900">
                Provedor de pagamento
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setOpen(false);
                  setQuery("");
                }}
                className="p-1.5 rounded-lg bg-gray-100"
              >
                <Ionicons name="close" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center px-4 py-3 border-b border-gray-100 gap-2">
              <Ionicons name="search-outline" size={16} color="#9CA3AF" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar provedor..."
                placeholderTextColor="#9CA3AF"
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: "#374151",
                  paddingVertical: 4,
                }}
              />
              {query.length > 0 ? (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              ) : null}
            </View>

            {loading ? (
              <View className="py-12 items-center">
                <ActivityIndicator size="small" color="#7C3AED" />
                <Text className="text-xs text-gray-500 mt-2">Carregando provedores...</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 360 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {filtered.length === 0 ? (
                  <View className="py-10 items-center px-4">
                    <Ionicons name="search-outline" size={28} color="#E5E7EB" />
                    <Text className="text-sm text-gray-500 mt-2 text-center">
                      Nenhum provedor encontrado.
                    </Text>
                  </View>
                ) : (
                  filtered.map((item) => {
                    const isSelected = item.slug === value.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={item.slug}
                        onPress={() => handleSelect(item.slug)}
                        activeOpacity={0.8}
                        className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${
                          isSelected ? "bg-violet-50" : "bg-white"
                        }`}
                        style={{
                          borderLeftWidth: 3,
                          borderLeftColor: isSelected ? "#7C3AED" : "transparent",
                        }}
                      >
                        <PaymentProviderLogo uri={item.logo_url ?? null} size={48} rounded={12} />
                        <View className="flex-1 ml-3 min-w-0">
                          <Text
                            className={`text-sm ${
                              isSelected ? "font-bold text-violet-800" : "font-semibold text-gray-800"
                            }`}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={2}>
                            {item.sublabel ?? item.slug}
                          </Text>
                        </View>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            )}

            <View className="flex-row justify-end px-4 py-3 border-t border-gray-100">
              <TouchableOpacity
                onPress={() => {
                  setOpen(false);
                  setQuery("");
                }}
                className="px-5 py-2 rounded-lg bg-gray-100"
              >
                <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
