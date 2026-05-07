import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";

type HeaderProps = {
  isMobile?: boolean;
  onOpenMenu?: () => void;
};

export default function Header({ isMobile = false, onOpenMenu }: HeaderProps) {
  const [search, setSearch] = useState("");
  const { logout, user } = useAuth();
  const initials = user?.name
    ? user.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()
    : "?";

  return (
    <View
      className="h-16 bg-white border-b border-gray-100 flex-row items-center"
      style={{ shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 }}
    >
      <View style={{ width: isMobile ? 12 : 24 }} />
      {isMobile && (
        <TouchableOpacity
          onPress={onOpenMenu}
          className="w-10 h-10 items-center justify-center rounded-full bg-gray-50 border border-gray-200 mr-2"
          activeOpacity={0.8}
        >
          <Ionicons name="menu" size={21} color="#374151" />
        </TouchableOpacity>
      )}
      {/* Search */}
      {!isMobile && (
      <View className="flex-row items-center bg-gray-50 rounded-full px-4 py-2 border border-gray-200" style={{ width: 240 }}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Pesquisar..."
          placeholderTextColor="#9CA3AF"
          className="ml-2 flex-1 text-sm text-gray-700"
          style={{ outline: "none" } as any}
        />
      </View>
      )}

      <View className="flex-1" />

      {/* Configurações */}
      <TouchableOpacity
        className="w-10 h-10 items-center justify-center rounded-full bg-gray-50 border border-gray-200 mr-3"
        activeOpacity={0.7}
      >
        <Feather name="settings" size={17} color="#6B7280" />
      </TouchableOpacity>

      {/* Notificações */}
      <TouchableOpacity
        className="w-10 h-10 items-center justify-center rounded-full bg-gray-50 border border-gray-200"
        style={{ marginRight: isMobile ? 8 : 20 }}
        activeOpacity={0.7}
      >
        <Ionicons name="notifications-outline" size={19} color="#6B7280" />
        <View className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
      </TouchableOpacity>

      {/* User */}
      <View className="flex-row items-center">
        {!isMobile && (
        <View className="mr-3 items-end">
          <Text className="text-sm font-semibold text-gray-800">{user?.name ?? "Usuário"}</Text>
          <Text className="text-xs text-gray-500">{user?.email ?? ""}</Text>
        </View>
        )}
        <View className="w-10 h-10 bg-violet-100 rounded-full items-center justify-center border-2 border-violet-200">
          <Text className="text-violet-700 font-bold text-sm">{initials}</Text>
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity
        onPress={logout}
        className="w-10 h-10 items-center justify-center rounded-full bg-red-50 border border-red-100 ml-2"
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={19} color="#EF4444" />
      </TouchableOpacity>
      <View style={{ width: isMobile ? 12 : 24 }} />
    </View>
  );
}
