import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

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
  { id: "cobrancas", label: "Cobranças", icon: "cash-outline" },
];

const otherItems: NavItem[] = [];

type SidebarProps = {
  activeItem?: string;
  onSelectItem?: (id: string) => void;
};

export default function Sidebar({
  activeItem: externalActive,
  onSelectItem,
}: SidebarProps) {
  const [internalActive, setInternalActive] = useState("dashboard");
  const activeItem = externalActive ?? internalActive;

  const handlePress = (id: string) => {
    setInternalActive(id);
    onSelectItem?.(id);
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
      style={{ width: 220, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 }}
    >
      {/* Logo */}
      <View className="flex-row items-center px-3 mb-8">
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

      <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
        <Text className="text-xs font-semibold text-gray-400 px-3 mb-2 tracking-widest uppercase">
          Menu
        </Text>
        {menuItems.map(renderItem)}

        {otherItems.length > 0 && (
          <>
            <Text className="text-xs font-semibold text-gray-400 px-3 mt-6 mb-2 tracking-widest uppercase">
              Outros
            </Text>
            {otherItems.map(renderItem)}
          </>
        )}
      </ScrollView>

      {/* Version tag */}
      <View className="px-3 py-4">
        <View className="bg-amber-50 rounded-xl p-3 items-center border border-amber-100">
          <Ionicons name="star" size={16} color="#F59E0B" />
          <Text className="text-xs text-amber-700 font-semibold mt-1">
            v 1.0
          </Text>
        </View>
      </View>
    </View>
  );
}
