import React, { useState } from "react";
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

type NavItem = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hasSubmenu?: boolean;
};

const menuItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "home-outline" },
  { id: "alunos", label: "Alunos", icon: "people-outline" },
  { id: "responsaveis", label: "Responsáveis", icon: "person-outline" },
  { id: "cursos", label: "Cursos", icon: "book-outline" },
  { id: "disciplinas", label: "Disciplinas", icon: "library-outline" },
  { id: "turmas", label: "Turmas", icon: "grid-outline" },
  { id: "matriculas", label: "Matrículas", icon: "clipboard-outline" },
  { id: "pagamentos", label: "Pagamentos", icon: "card-outline" },
  { id: "simulados", label: "Simulados", icon: "document-text-outline" },
];

const otherItems: NavItem[] = [];

type SidebarProps = {
  activeItem?: string;
  onSelectItem?: (id: string) => void;
  canManageTenants?: boolean;
  canManageUsers?: boolean;
  isMobile?: boolean;
  onClose?: () => void;
  apiVersion?: string;
};

export default function Sidebar({
  activeItem: externalActive,
  onSelectItem,
  canManageTenants = false,
  canManageUsers = false,
  isMobile = false,
  onClose,
  apiVersion = "-",
}: SidebarProps) {
  const { width } = useWindowDimensions();
  const [internalActive, setInternalActive] = useState("dashboard");
  const [versionCopied, setVersionCopied] = useState(false);
  const activeItem = externalActive ?? internalActive;
  const visibleMenuItems = [
    ...(canManageTenants ? [{ id: "tenants", label: "Tenants", icon: "business-outline" as const }] : []),
    ...(canManageUsers ? [{ id: "users", label: "Usuários", icon: "people-outline" as const }] : []),
    ...menuItems,
  ];

  const handlePress = (id: string) => {
    setInternalActive(id);
    onSelectItem?.(id);
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

  const renderItem = (item: NavItem) => {
    const isActive = activeItem === item.id;
    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => handlePress(item.id)}
        className={`flex-row items-center px-4 py-3 rounded-xl mb-1 ${
          isActive ? "bg-violet-100" : "bg-transparent"
        }`}
        activeOpacity={0.7}
      >
        <Ionicons
          name={item.icon}
          size={20}
          color={isActive ? "#7C3AED" : "#9CA3AF"}
        />
        <Text
          className={`ml-3 text-sm font-medium flex-1 ${
            isActive ? "text-violet-700" : "text-gray-500"
          }`}
        >
          {item.label}
        </Text>
        {item.hasSubmenu && (
          <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      className="bg-white pt-6 px-3 border-r border-gray-100"
      style={{
        width: isMobile ? Math.min(300, width * 0.84) : 220,
        height: "100%",
        boxShadow: isMobile ? "0px 8px 24px rgba(0, 0, 0, 0.16)" : "0px 4px 12px rgba(0, 0, 0, 0.04)",
        elevation: 8,
      }}
    >
      {/* Logo */}
      <View className="flex-row items-center justify-between px-3 mb-6">
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
            className="mt-3 ml-0"
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
        <Text className="text-xs font-semibold text-gray-400 px-3 mb-2 tracking-widest uppercase">
          Menu
        </Text>
        {visibleMenuItems.map(renderItem)}

        {otherItems.length > 0 && (
          <>
            <Text className="text-xs font-semibold text-gray-400 px-3 mt-6 mb-2 tracking-widest uppercase">
              Outros
            </Text>
            {otherItems.map(renderItem)}
          </>
        )}
      </ScrollView>
    </View>
  );
}
