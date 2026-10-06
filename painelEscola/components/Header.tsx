import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { Bell, LogOut, Menu, Search, Settings } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import Icon from "./ui/Icon";
import { color, size } from "../constants/theme";
import { roleLabel } from "../utils/permissions";

type HeaderProps = {
  isMobile?: boolean;
  onOpenMenu?: () => void;
};

/** Barra superior (TopBar): busca à esquerda; utilitários e usuário (nome + papel) à direita. */
export default function Header({ isMobile = false, onOpenMenu }: HeaderProps) {
  const [search, setSearch] = useState("");
  const { logout, user } = useAuth();
  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  const IconButton = ({ icon, label, onPress }: { icon: typeof Bell; label: string; onPress?: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      aria-label={label}
      className="items-center justify-center rounded-ds-md"
      style={{ width: size["control-md"], height: size["control-md"] }}
      activeOpacity={0.7}
    >
      <Icon icon={icon} />
    </TouchableOpacity>
  );

  return (
    <View
      className="bg-surface border-b border-border flex-row items-center"
      style={{ height: size["topbar-height"], paddingHorizontal: isMobile ? 12 : 32, gap: 16 }}
    >
      {isMobile && <IconButton icon={Menu} label="Abrir menu" onPress={onOpenMenu} />}

      {!isMobile && (
        <View
          className="flex-row items-center bg-surface border border-border-strong rounded-ds-md px-3"
          style={{ width: 320, height: size["control-sm"], gap: 8 }}
        >
          <Icon icon={Search} color={color["ink-subtle"]} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Pesquisar"
            placeholderTextColor={color["ink-subtle"]}
            aria-label="Pesquisar"
            className="flex-1 text-sm text-ink"
          />
        </View>
      )}

      <View className="flex-1" />

      <View className="flex-row items-center" style={{ gap: 8 }}>
        <IconButton icon={Settings} label="Configurações" />
        <IconButton icon={Bell} label="Notificações" />

        <View
          className="flex-row items-center border-l border-border"
          style={{ gap: 12, paddingLeft: 16, marginLeft: 8 }}
        >
          {!isMobile && (
            <View className="items-end">
              <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                {user?.name ?? "Usuário"}
              </Text>
              <Text className="text-xs text-ink-subtle">{roleLabel(user?.role)}</Text>
            </View>
          )}
          <View
            className="bg-surface-sunken border border-border rounded-ds-md items-center justify-center"
            style={{ width: 32, height: 32 }}
            aria-hidden
          >
            <Text className="text-xs font-semibold text-ink">{initials}</Text>
          </View>
          <IconButton icon={LogOut} label="Sair" onPress={logout} />
        </View>
      </View>
    </View>
  );
}
