import React, { useEffect, useId, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, ScrollView, TextInput, useWindowDimensions } from "react-native";
import {
  Archive,
  Bell,
  BookOpen,
  BookOpenCheck,
  Building2,
  Calculator,
  Calendar,
  ChartColumn,
  CalendarCheck,
  ChartLine,
  Check,
  ChevronRight,
  Search,
  ClipboardCheck,
  ClipboardList,
  Copy,
  CreditCard,
  FileQuestionMark,
  FileText,
  House,
  Landmark,
  FileBarChart,
  GraduationCap,
  LayoutGrid,
  Radar,
  Target,
  TrendingUp,
  Library,
  Link2,
  Palette,
  Sparkles,
  Tags,
  UserCog,
  UserRound,
  Users,
  Webhook,
  ArrowLeftRight,
  ReceiptText,
  ChartNoAxesColumn,
  Settings2,
  FileChartColumn,
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

/** Seção do BI (chave da API) → tela do painel. Seção sem tela aqui não aparece no menu. */
const BI_SCREENS: Record<string, { id: string; icon: LucideIcon }> = {
  overview: { id: "bi-overview", icon: ChartLine },
  diagnosis: { id: "bi-diagnosis", icon: Radar },
  students: { id: "bi-students", icon: TrendingUp },
  performance: { id: "bi-performance", icon: GraduationCap },
  classes: { id: "bi-classes", icon: LayoutGrid },
  subjects: { id: "bi-subjects", icon: BookOpenCheck },
  assessments: { id: "bi-assessments", icon: ClipboardCheck },
  follow_up: { id: "bi-follow-up", icon: ClipboardList },
  engagement: { id: "bi-engagement", icon: CalendarCheck },
  effectiveness: { id: "bi-effectiveness", icon: Target },
  reports: { id: "bi-reports", icon: FileBarChart },
  ai_insights: { id: "bi-insights", icon: Sparkles },
};

/** Seções em sanfona; itens sem rótulo permanecem visíveis. */
type SidebarSection = { label?: string; items: SidebarItem[] };

export default function Sidebar({
  activeItem: externalActive,
  onSelectItem,
  canManageTenants = false,
  canManageUsers = false,
  canManageAi = false,
  canManageExams = false,
  canSendNotifications = false,
  canViewFinance = false,
  biSections = [],
  isMobile = false,
  onClose,
  apiVersion = "-",
}: SidebarProps) {
  const { width } = useWindowDimensions();
  const [internalActive, setInternalActive] = useState("dashboard");
  const [versionCopied, setVersionCopied] = useState(false);
  const activeItem = externalActive ?? internalActive;
  const [query, setQuery] = useState("");
  const searchRef = useRef<TextInput>(null);
  const menuId = useId();
  const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const normalizedQuery = normalize(query.trim());

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
    ...(biSections.length
      ? [
          {
            label: "Inteligência Educacional",
            items: biSections
              .filter((section) => BI_SCREENS[section.key])
              .map((section) => ({ id: BI_SCREENS[section.key].id, label: section.label, icon: BI_SCREENS[section.key].icon })),
          },
        ]
      : []),
    ...(canViewFinance
      ? [
          {
            label: "Financeiro",
            items: [
              { id: "financeiro-visao-geral", label: "Visão geral", icon: ChartLine },
              { id: "cobrancas", label: "Contas a receber", icon: CreditCard },
              { id: "financeiro-conciliacao", label: "Conciliação bancária", icon: ArrowLeftRight },
              { id: "financeiro-contas-a-pagar", label: "Contas a pagar", icon: ReceiptText },
              { id: "financeiro-fluxo-de-caixa", label: "Fluxo de caixa", icon: ChartNoAxesColumn },
              { id: "financeiro-relatorios", label: "Relatórios financeiros", icon: FileChartColumn },
              { id: "financeiro-cora", label: "Integração Cora", icon: Webhook },
              { id: "bancos_crud", label: "Bancos", icon: Landmark },
              { id: "pagamentos", label: "Provedores de pagamento", icon: Link2 },
              { id: "financeiro-configuracoes", label: "Configurações financeiras", icon: Settings2 },
            ],
          },
        ]
      : []),
    {
      label: "Relatórios",
      items: [
        { id: "relatorios-turmas", label: "Turmas (alunos)", icon: ChartColumn },
        ...(canViewFinance ? [{ id: "relatorios-financeiro", label: "Financeiro", icon: ChartColumn }] : []),
      ],
    },
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

  const activeSection = sections.find((section) => section.items.some((item) => item.id === activeItem))?.label ?? null;
  const [openSection, setOpenSection] = useState<string | null>(activeSection);

  useEffect(() => {
    setOpenSection(activeSection);
  }, [activeSection]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey ||
          target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleSections = sections.map((section) => ({
    ...section,
    items: normalizedQuery && !normalize(section.label ?? "").includes(normalizedQuery)
      ? section.items.filter((item) => normalize(item.label).includes(normalizedQuery))
      : section.items,
  })).filter((section) => section.items.length > 0);

  const highlightLabel = (label: string) => {
    const index = normalizedQuery ? normalize(label).indexOf(normalizedQuery) : -1;
    if (index < 0) return label;
    return <>{label.slice(0, index)}<Text style={{ color: color["nav-ink"], fontWeight: "600", borderBottomWidth: 2, borderBottomColor: color["nav-accent"] }}>{label.slice(index, index + normalizedQuery.length)}</Text>{label.slice(index + normalizedQuery.length)}</>;
  };

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
        {...{ title: item.label }}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        style={(state) => ({
          // Layout todo em style: com style em função, o NativeWind descarta o className do Pressable.
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          borderRadius: 4,
          height: 32,
          gap: 10,
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
        <Text className={`flex-1 ${isActive ? "font-medium text-nav-ink" : "text-nav-ink-muted"}`} style={{ fontSize: 13, lineHeight: 18 }} numberOfLines={1}>
          {highlightLabel(item.label)}
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

      <View className="flex-row items-center rounded-ds-md border border-nav-divider bg-nav-hover" style={{ height: 32, marginHorizontal: 12, marginTop: 12, marginBottom: 4 }} data-nav-search>
        <View pointerEvents="none" style={{ position: "absolute", left: 10 }}>
          <Icon icon={Search} color={color["nav-label"]} />
        </View>
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar no menu"
          placeholderTextColor={color["nav-label"]}
          aria-label="Buscar no menu"
          onKeyPress={({ nativeEvent }) => { if (nativeEvent.key === "Escape") setQuery(""); }}
          style={{ flex: 1, minWidth: 0, height: "100%", paddingLeft: 30, paddingRight: 28, fontSize: 13, color: color["nav-ink"] }}
        />
        {!!query && <Pressable aria-label="Limpar busca" role="button" onPress={() => { setQuery(""); searchRef.current?.focus(); }} style={{ position: "absolute", right: 2, width: 28, height: 28, alignItems: "center", justifyContent: "center" }}><Icon icon={X} color={color["nav-label"]} /></Pressable>}
        {!query && <Text aria-hidden className="font-mono text-nav-label border border-nav-divider rounded-ds-sm" style={{ position: "absolute", right: 8, width: 18, height: 18, textAlign: "center", fontSize: 11, lineHeight: 16 }}>/</Text>}
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }} role="navigation" aria-label="Principal">
        {visibleSections.map((section, index) => {
          const isOpen = !section.label || !!normalizedQuery || openSection === section.label;
          const listId = `${menuId}-${sections.findIndex((entry) => entry.label === section.label)}`;
          return (
            <View
              key={section.label ?? "principal"}
              className={index === 0 ? "" : "border-t border-nav-divider"}
              style={{ paddingTop: section.label ? 2 : 8, paddingBottom: isOpen ? 8 : 2 }}
            >
              {section.label && (normalizedQuery ? (
                <Text className="font-semibold text-nav-label uppercase px-4" style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.88, paddingTop: 4, paddingBottom: 8 }}>{section.label}</Text>
              ) : (
                <Pressable
                  role="button"
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  aria-label={section.label}
                  onPress={() => setOpenSection(isOpen ? null : section.label!)}
                  style={(state) => ({
                    flexDirection: "row", alignItems: "center", gap: 8, height: 36,
                    marginHorizontal: 8, paddingHorizontal: 8, borderRadius: 4,
                    backgroundColor: (state as { hovered?: boolean }).hovered ? color["nav-hover"] : "transparent",
                  })}
                >
                  <Text className="font-semibold uppercase flex-1" numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, letterSpacing: 0.72, color: isOpen ? color["nav-ink"] : color["nav-ink-muted"] }}>
                    {section.label}
                  </Text>
                  {!isOpen && activeSection === section.label && <View aria-label="Página atual nesta seção" style={{ width: 6, height: 6, backgroundColor: color["nav-accent"] }} />}
                  <View style={{ transform: [{ rotate: isOpen ? "90deg" : "0deg" }] }}>
                    <Icon icon={ChevronRight} color={isOpen ? color["nav-ink"] : color["nav-ink-muted"]} />
                  </View>
                </Pressable>
              ))}
              <View nativeID={listId} className="px-2" style={{ display: isOpen ? "flex" : "none", gap: 1, paddingTop: section.label ? 2 : 0 }}>
                {section.items.map(renderItem)}
              </View>
            </View>
          );
        })}
        {visibleSections.length === 0 && <Text role="status" className="text-nav-label" style={{ margin: 16, fontSize: 13, lineHeight: 18 }}>Nada encontrado para “{query}”.</Text>}
      </ScrollView>
      <View className="border-t border-nav-divider" style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
        <Text className="font-mono text-nav-label" style={{ fontSize: 11, lineHeight: 14 }}>
          Build {buildDate}
        </Text>
      </View>
    </View>
  );
}
