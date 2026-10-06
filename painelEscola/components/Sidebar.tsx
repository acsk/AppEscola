import React, { useState } from "react";
import { View, Text, TouchableOpacity, Pressable, ScrollView, useWindowDimensions } from "react-native";
import {
  Archive,
  Bell,
  BookOpen,
  Building2,
  Calculator,
  Calendar,
  ChartColumn,
  Check,
  ClipboardCheck,
  ClipboardList,
  Copy,
  CreditCard,
  FileQuestionMark,
  FileText,
  House,
  Landmark,
  LayoutGrid,
  Library,
  Link2,
  Palette,
  Sparkles,
  Tags,
  UserCog,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react-native";
import buildInfo from "../buildInfo.json";
import Icon from "./ui/Icon";
import { color, size } from "../constants/theme";
import type { SidebarProps } from "../types/components";

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

type SidebarItem = { id: string; label: string; icon: LucideIcon };

/** Seção plana: rótulo em caixa alta (opcional) e itens — sem acordeões, contadores ou cor por seção. */
type SidebarSection = { label?: string; items: SidebarItem[] };

export default function Sidebar({
  activeItem: externalActive,
  onSelectItem,
  canManageTenants = false,
  canManageUsers = false,
  canManageAi = false,
  canManageExams = false,
  canSendNotifications = false,
  isMobile = false,
  onClose,
  apiVersion = "-",
}: SidebarProps) {
  const { width } = useWindowDimensions();
  const [internalActive, setInternalActive] = useState("dashboard");
  const [versionCopied, setVersionCopied] = useState(false);
  const activeItem = externalActive ?? internalActive;

  const sections: SidebarSection[] = [
    { items: [{ id: "dashboard", label: "Dashboard", icon: House }] },
    {
      label: "Pessoas",
      items: [
        { id: "alunos", label: "Alunos", icon: Users },
        { id: "responsaveis", label: "Responsáveis", icon: UserRound },
        ...(canManageUsers ? [{ id: "users", label: "Usuários", icon: UserCog }] : []),
      ],
    },
    {
      label: "Acadêmico",
      items: [
        { id: "disciplinas", label: "Disciplinas", icon: Library },
        { id: "turmas", label: "Turmas", icon: LayoutGrid },
        { id: "cursos", label: "Cursos", icon: BookOpen },
        ...(canManageExams
          ? [
              { id: "simulados", label: "Simulados", icon: FileText },
              { id: "questoes", label: "Banco de questões", icon: FileQuestionMark },
            ]
          : []),
        { id: "avaliacoes-oficiais", label: "Avaliações presenciais", icon: ClipboardCheck },
        { id: "provas-anteriores", label: "Provas e materiais", icon: Archive },
        { id: "matriculas", label: "Matrículas", icon: ClipboardList },
      ],
    },
    { label: "Relatórios", items: [{ id: "relatorios-turmas", label: "Turmas (alunos)", icon: ChartColumn }] },
    ...(canSendNotifications
      ? [
          {
            label: "Comunicação",
            items: [
              { id: "notificacoes", label: "Notificações", icon: Bell },
              { id: "calendario", label: "Calendário", icon: Calendar },
            ],
          },
        ]
      : []),
    {
      label: "Financeiro",
      items: [
        { id: "cobrancas", label: "Gestão de pagamentos", icon: CreditCard },
        { id: "bancos_crud", label: "Bancos", icon: Landmark },
        { id: "pagamentos", label: "Provedores de pagamento", icon: Link2 },
      ],
    },
    {
      label: "Configurações",
      items: [
        { id: "configuracoes-cobranca", label: "Regras de cobrança", icon: Calculator },
        { id: "configuracoes-tema-mobile", label: "Tema do app mobile", icon: Palette },
        ...(canManageAi ? [{ id: "configuracoes-ia", label: "Integração com IA", icon: Sparkles }] : []),
      ],
    },
    ...(canManageTenants
      ? [
          {
            label: "Administração",
            items: [
              { id: "tenants", label: "Tenants", icon: Building2 },
              { id: "tipos-prova", label: "Tipos de prova", icon: Tags },
            ],
          },
        ]
      : []),
  ].filter((section) => section.items.length > 0);

  const handlePress = (id: string) => {
    setInternalActive(id);
    onSelectItem?.(id);
    if (isMobile) onClose?.();
  };

  const appVersion = (buildInfo as any)?.version ?? "-";
  const buildDate = formatBuildDateTime((buildInfo as any)?.buildDate ?? "");

  const copyVersionInfo = async () => {
    const versionText = [`API v${apiVersion}`, `App ${appVersion}`, `Build: ${appVersion} • ${buildDate}`].join("\n");

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(versionText);
      setVersionCopied(true);
      window.setTimeout(() => setVersionCopied(false), 2500);
    }
  };

  const renderItem = (item: SidebarItem) => {
    const isActive = activeItem === item.id;
    return (
      <Pressable
        key={item.id}
        onPress={() => handlePress(item.id)}
        role="link"
        aria-current={isActive ? "page" : undefined}
        style={(state) => ({
          // Layout todo em style: com style em função, o NativeWind descarta o className do Pressable.
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          borderRadius: 4,
          height: 34,
          gap: 12,
          // `hovered` existe no RN Web (não está nos tipos do RN).
          backgroundColor: isActive
            ? color["nav-active"]
            : (state as { hovered?: boolean }).hovered
              ? color["nav-hover"]
              : "transparent",
        })}
      >
        {/* Barra de acento do item ativo: o único uso de acento na navegação. */}
        {isActive && (
          <View style={{ position: "absolute", left: -8, top: 7, bottom: 7, width: 3, backgroundColor: color["nav-accent"] }} />
        )}
        <Icon icon={item.icon} color={isActive ? color["nav-ink"] : color["nav-ink-muted"]} />
        <Text className={`text-sm flex-1 ${isActive ? "font-medium text-nav-ink" : "text-nav-ink-muted"}`} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      data-nav
      className="bg-nav-bg"
      style={{
        width: isMobile ? Math.min(304, width * 0.86) : size["sidebar-width"],
        height: "100%",
      }}
    >
      {/* Marca + versão */}
      <View className="flex-row items-center border-b border-nav-divider px-4" style={{ height: size["topbar-height"], gap: 12 }}>
        <View className="bg-nav-ink rounded-ds-sm items-center justify-center" style={{ width: 28, height: 28 }} aria-hidden>
          <Text className="text-xs font-semibold text-nav-bg" style={{ letterSpacing: 0.3 }}>
            CH
          </Text>
        </View>
        <TouchableOpacity
          onPress={copyVersionInfo}
          activeOpacity={0.7}
          className="flex-1"
          aria-label={`Cursinho Hub. Versão: API ${apiVersion}, app ${appVersion}. Copiar informações de versão`}
        >
          <Text className="font-semibold text-nav-ink" style={{ fontSize: 15, lineHeight: 18 }}>
            Cursinho Hub
          </Text>
          <View className="flex-row items-center" style={{ gap: 4 }}>
            <Text className="font-mono text-nav-label" style={{ fontSize: 11, lineHeight: 14 }} numberOfLines={1}>
              {appVersion} · API {apiVersion}
            </Text>
            <Icon icon={versionCopied ? Check : Copy} size={16} color={versionCopied ? color["nav-accent"] : color["nav-label"]} />
          </View>
        </TouchableOpacity>
        {isMobile && (
          <TouchableOpacity
            onPress={onClose}
            className="items-center justify-center rounded-ds-md"
            style={{ width: 32, height: 32 }}
            aria-label="Fechar menu"
            activeOpacity={0.8}
          >
            <Icon icon={X} color={color["nav-ink-muted"]} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }} aria-label="Navegação principal">
        {sections.map((section, index) => (
          <View
            key={section.label ?? `secao-${index}`}
            className={index === 0 ? "" : "border-t border-nav-divider"}
            style={{ paddingVertical: 12 }}
          >
            {section.label && (
              <Text
                className="font-semibold text-nav-label uppercase px-4"
                style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.9, paddingTop: 4, paddingBottom: 8 }}
              >
                {section.label}
              </Text>
            )}
            <View className="px-2" style={{ gap: 2 }}>
              {section.items.map(renderItem)}
            </View>
          </View>
        ))}
        <Text className="font-mono text-nav-label px-4" style={{ fontSize: 11, lineHeight: 14 }}>
          Build {buildDate}
        </Text>
      </ScrollView>
    </View>
  );
}
