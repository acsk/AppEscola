import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import buildInfo from "../buildInfo.json";

const formatBuildDateTime = (isoDate: string): string => {
  try {
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoDate;
  }
};

import type { IoniconName, NavItem, SidebarProps } from "../types/components";

type SidebarGroup = {
  title: string;
  icon: IoniconName;
  tone: "violet" | "blue" | "emerald" | "amber" | "slate";
  items: NavItem[];
};

const groupToneStyles: Record<
  SidebarGroup["tone"],
  { iconBg: string; icon: string; activeBg: string; activeBorder: string; label: string }
> = {
  violet: {
    iconBg: "bg-violet-100",
    icon: "#7C3AED",
    activeBg: "bg-violet-50",
    activeBorder: "border-violet-200",
    label: "text-violet-700",
  },
  blue: {
    iconBg: "bg-blue-100",
    icon: "#2563EB",
    activeBg: "bg-blue-50",
    activeBorder: "border-blue-200",
    label: "text-blue-700",
  },
  emerald: {
    iconBg: "bg-emerald-100",
    icon: "#059669",
    activeBg: "bg-emerald-50",
    activeBorder: "border-emerald-200",
    label: "text-emerald-700",
  },
  amber: {
    iconBg: "bg-amber-100",
    icon: "#D97706",
    activeBg: "bg-amber-50",
    activeBorder: "border-amber-200",
    label: "text-amber-700",
  },
  slate: {
    iconBg: "bg-slate-100",
    icon: "#64748B",
    activeBg: "bg-slate-50",
    activeBorder: "border-slate-200",
    label: "text-slate-700",
  },
};

export default function Sidebar({
  activeItem: externalActive,
  onSelectItem,
  canManageTenants = false,
  canManageUsers = false,
  canSendNotifications = false,
  isMobile = false,
  onClose,
  apiVersion = "-",
}: SidebarProps) {
  const { width } = useWindowDimensions();
  const [internalActive, setInternalActive] = useState("dashboard");
  const [versionCopied, setVersionCopied] = useState(false);
  const activeItem = externalActive ?? internalActive;
  const menuGroups: SidebarGroup[] = [
    {
      title: "Início",
      icon: "home-outline",
      tone: "violet",
      items: [{ id: "dashboard", label: "Dashboard", icon: "home-outline" }],
    },
    {
      title: "Pessoas",
      icon: "people-outline",
      tone: "blue",
      items: [
        { id: "alunos", label: "Alunos", icon: "people-outline" },
        { id: "responsaveis", label: "Responsáveis", icon: "person-outline" },
        ...(canManageUsers
          ? [{ id: "users", label: "Usuários", icon: "people-circle-outline" as const }]
          : []),
      ],
    },
    {
      title: "Acadêmico",
      icon: "school-outline",
      tone: "emerald",
      items: [
        { id: "disciplinas", label: "Disciplinas", icon: "library-outline" },
        { id: "turmas", label: "Turmas", icon: "grid-outline" },
        { id: "cursos", label: "Cursos", icon: "book-outline" },
        { id: "simulados", label: "Simulados", icon: "document-text-outline" },
        { id: "matriculas", label: "Matrículas", icon: "clipboard-outline" },
      ],
    },
    ...(canSendNotifications
      ? [
          {
            title: "Comunicação",
            icon: "chatbubbles-outline" as const,
            tone: "amber" as const,
            items: [
              { id: "notificacoes", label: "Notificações", icon: "notifications-outline" },
              { id: "calendario", label: "Calendário", icon: "calendar-outline" },
            ],
          },
        ]
      : []),
    {
      title: "Financeiro",
      icon: "wallet-outline",
      tone: "violet",
      items: [
        { id: "cobrancas", label: "Gestão de Pagamentos", icon: "wallet-outline" },
        { id: "bancos_crud", label: "Cadastro de Bancos", icon: "add-circle-outline" },
        { id: "pagamentos", label: "Configuração de Provedores", icon: "cog-outline" },
        {
          id: "configuracoes-cobranca",
          label: "Configurações de Cobrança",
          icon: "settings-outline",
        },
      ],
    },
    ...(canManageTenants
      ? [
          {
            title: "Administração",
            icon: "business-outline" as const,
            tone: "slate" as const,
            items: [{ id: "tenants", label: "Tenants", icon: "business-outline" }],
          },
        ]
      : []),
  ].filter((group) => group.items.length > 0);
  const activeGroupTitle = useMemo(
    () => menuGroups.find((group) => group.items.some((item) => item.id === activeItem))?.title,
    [activeItem, menuGroups]
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroupTitle ? [activeGroupTitle] : ["Início"])
  );

  useEffect(() => {
    if (!activeGroupTitle) return;
    setOpenGroups((prev) => {
      if (prev.has(activeGroupTitle)) return prev;
      const next = new Set(prev);
      next.add(activeGroupTitle);
      return next;
    });
  }, [activeGroupTitle]);

  const handlePress = (id: string) => {
    setInternalActive(id);
    onSelectItem?.(id);
    if (isMobile) onClose?.();
  };

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const copyVersionInfo = async () => {
    const versionText = [
      `API v${apiVersion}`,
      `App ${(buildInfo as any)?.version ?? "-"}`,
      `Build: ${(buildInfo as any)?.version ?? "-"} • ${formatBuildDateTime((buildInfo as any)?.buildDate ?? "")}`,
    ].join("\n");

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(versionText);
      setVersionCopied(true);
      window.setTimeout(() => setVersionCopied(false), 2500);
    }
  };

  const renderItem = (item: NavItem, groupTone: SidebarGroup["tone"]) => {
    const isActive = activeItem === item.id;
    const tone = groupToneStyles[groupTone];
    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => handlePress(item.id)}
        className={`flex-row items-center px-2.5 py-2 rounded-lg mb-1 border ${
          isActive ? "bg-white border-violet-200" : "bg-transparent border-transparent"
        }`}
        style={isActive ? { shadowColor: "#7C3AED", shadowOpacity: 0.08, shadowRadius: 8 } : undefined}
        activeOpacity={0.7}
      >
        <Ionicons
          name={item.icon}
          size={16}
          color={isActive ? tone.icon : "#94A3B8"}
        />
        <Text
          className={`ml-2 text-[13px] flex-1 ${
            isActive ? `font-bold ${tone.label}` : "font-medium text-gray-600"
          }`}
          numberOfLines={2}
        >
          {item.label}
        </Text>
        {isActive ? <View className="w-1.5 h-1.5 rounded-full bg-violet-500" /> : null}
      </TouchableOpacity>
    );
  };

  const renderGroup = (group: SidebarGroup) => {
    const isOpen = openGroups.has(group.title);
    const hasActiveItem = group.items.some((item) => item.id === activeItem);
    const tone = groupToneStyles[group.tone];

    return (
      <View
        key={group.title}
        className={`mb-2 rounded-2xl border px-2 py-2 ${
          hasActiveItem ? `${tone.activeBg} ${tone.activeBorder}` : "bg-gray-50/80 border-gray-100"
        }`}
      >
        <TouchableOpacity
          onPress={() => toggleGroup(group.title)}
          className="flex-row items-center gap-2"
          activeOpacity={0.78}
        >
          <View className={`w-8 h-8 rounded-xl items-center justify-center ${tone.iconBg}`}>
            <Ionicons name={group.icon} size={16} color={tone.icon} />
          </View>
          <View className="flex-1">
            <Text className={`text-[11px] font-extrabold uppercase tracking-wide ${hasActiveItem ? tone.label : "text-gray-600"}`}>
              {group.title}
            </Text>
            <Text className="text-[10px] text-gray-400 mt-0.5">
              {group.items.length} {group.items.length === 1 ? "item" : "itens"}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            {hasActiveItem ? <View className="w-2 h-2 rounded-full bg-violet-500" /> : null}
            <Ionicons
              name={isOpen ? "chevron-up" : "chevron-down"}
              size={15}
              color={hasActiveItem ? tone.icon : "#94A3B8"}
            />
          </View>
        </TouchableOpacity>

        {isOpen ? (
          <View className="mt-2 pt-2 border-t border-white/70">
            {group.items.map((item) => renderItem(item, group.tone))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      className="bg-white pt-3 px-2.5 border-r border-gray-100"
      style={{
        width: isMobile ? Math.min(304, width * 0.86) : 244,
        height: "100%",
        boxShadow: isMobile ? "0px 8px 24px rgba(0, 0, 0, 0.16)" : "0px 4px 12px rgba(0, 0, 0, 0.04)",
        elevation: 8,
      }}
    >
      {/* Logo */}
      <View className="flex-row items-center justify-between px-1.5 mb-3">
        <View className="flex-1">
          <View className="flex-row items-center">
            <View className="w-9 h-9 bg-violet-600 rounded-xl items-center justify-center mr-2">
              <Ionicons name="school" size={20} color="white" />
            </View>
            <View>
              <Text className="text-base font-bold text-gray-800 leading-tight">
                Cursinho
              </Text>
              <Text className="text-xs text-violet-500 font-semibold leading-tight">
                Hub
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={copyVersionInfo}
            activeOpacity={0.7}
            className="mt-1.5 ml-0"
          >
            <Text className="text-[10px] font-medium text-violet-600">
              API v{apiVersion}
            </Text>
            <Text className="text-[10px] font-medium text-violet-600 mt-0.5">
              App {(buildInfo as any)?.version ?? "-"}
            </Text>
            <View className="flex-row items-center mt-0.5">
              <Text className="text-[9px] text-gray-400 flex-1">
                Build: {(buildInfo as any)?.version ?? "-"} • {formatBuildDateTime((buildInfo as any)?.buildDate ?? "")}
              </Text>
              <Ionicons
                name={versionCopied ? "checkmark" : "copy-outline"}
                size={12}
                color={versionCopied ? "#10B981" : "#9CA3AF"}
              />
            </View>
          </TouchableOpacity>
        </View>
        {isMobile && (
          <TouchableOpacity
            onPress={onClose}
            className="w-9 h-9 rounded-full bg-gray-50 border border-gray-200 items-center justify-center"
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        {menuGroups.map(renderGroup)}
      </ScrollView>
    </View>
  );
}
