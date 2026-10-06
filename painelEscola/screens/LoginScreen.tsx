import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Building2, ChevronRight, CircleCheck, Eye, EyeOff, Lock, Mail, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { useAuth } from "../contexts/AuthContext";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";
import api from "../services/api";
import appJson from "../app.json";
import buildInfo from "../buildInfo.json";
import { color } from "../constants/theme";

const APP_VERSION = (appJson as any)?.expo?.version ?? "0.0.0";
const CURRENT_BUILD_VERSION = String((buildInfo as any)?.version ?? "-");
const STORAGE_API_VERSION_KEY = "api_version_seen";
const STORAGE_PANEL_RELOAD_ATTEMPT_KEY = "panel_reload_attempt_version";
/** Acesso de demonstração (só exibido em localhost). */
const DEMO_LOGIN = { email: "admin@cursinhoexemplo.com", password: "123456" };
/** Abaixo desta largura o lado institucional some e fica só o formulário. */
const SIDE_PANEL_MIN_WIDTH = 900;
const PASSWORD_INPUT_ID = "login-password-input";

type VerificationBadgeStatus = "pending" | "success" | "error";

type VerificationBadgeState = {
  visible: boolean;
  label: string;
  status: VerificationBadgeStatus;
};

const compareVersions = (left: string, right: string) => {
  const leftParts = left.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const rightParts = right.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const max = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < max; i++) {
    const a = leftParts[i] ?? 0;
    const b = rightParts[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
};

const compareBuildVersions = (left: string, right: string) => {
  const normalize = (value: string) =>
    String(value || "")
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const max = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < max; i++) {
    const a = leftParts[i] ?? 0;
    const b = rightParts[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
};

const formatDateToPtBr = (dateStr: string): string => {
  if (!dateStr || dateStr === "-") return dateStr;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

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

/**
 * Mosaico do lado institucional (mesmo padrão da capa do design system): blocos de 16px num
 * passo de 24px, alguns unidos em dois (valor 2). Feito com Views para funcionar também no nativo.
 */
const TILE_ROWS = [
  [1, 1, 2, 1, 0, 1, 2],
  [0, 2, 1, 1, 1, 0, 1],
  [1, 1, 0, 2, 1, 1, 0],
  [2, 1, 1, 0, 1, 2, 1],
  [1, 0, 1, 1, 2, 1, 1],
  [0, 1, 2, 1, 1, 0, 1],
  [1, 1, 1, 0, 2, 1, 0],
  [2, 0, 1, 1, 1, 1, 1],
];

function LoginTiles() {
  return (
    <View aria-hidden style={{ position: "absolute", right: -1, top: 96, width: 232, height: 184 }}>
      {TILE_ROWS.flatMap((row, rowIndex) => {
        let x = 0;
        return row.map((cell, cellIndex) => {
          const wide = cell === 2;
          const backgroundColor =
            rowIndex === 2 && cellIndex === 3
              ? color["nav-accent"]
              : (rowIndex + cellIndex) % 3 === 0
                ? color["nav-divider"]
                : color["nav-active"];
          const tile = (
            <View
              key={`${rowIndex}-${cellIndex}`}
              style={{ position: "absolute", left: x, top: rowIndex * 24, width: wide ? 40 : 16, height: 16, borderRadius: 2, backgroundColor }}
            />
          );
          x += wide ? 48 : 24;
          return tile;
        });
      })}
    </View>
  );
}

type LoginFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  icon: LucideIcon;
  invalid?: boolean;
  mono?: boolean;
  /** Ação à direita dentro do campo (ex.: mostrar senha). */
  trailing?: React.ReactNode;
  /** Ajuda ou aviso abaixo do campo. */
  hint?: React.ReactNode;
};

/** Campo de 44px com ícone à esquerda, como na tela de login do design system. */
function LoginField({ label, icon, invalid = false, mono = false, trailing, hint, nativeID, ...inputProps }: LoginFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = invalid ? color.danger : focused ? color.brand : color["border-strong"];
  const ring = focused && !invalid ? 2 : 1;
  return (
    <View style={{ gap: 6 }}>
      <Text nativeID={nativeID ? `${nativeID}-label` : undefined} className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
        {label}
      </Text>
      <View
        // Desliga o anel de foco do input interno (global.css): o anel fica no contêiner.
        dataSet={{ fieldShell: "true" }}
        className="flex-row items-center rounded-ds-md bg-surface"
        style={{
          height: 44,
          // Foco = borda + anel de 1px em `brand`, feito com borda de 2px; o padding compensa para o conteúdo não se mexer.
          borderWidth: ring,
          borderColor,
          paddingLeft: 13 - ring,
          paddingRight: (trailing ? 5 : 13) - ring,
          gap: 10,
        }}
      >
        <Icon icon={icon} size={16} color={color["ink-subtle"]} />
        <TextInput
          {...inputProps}
          nativeID={nativeID}
          aria-labelledby={nativeID ? `${nativeID}-label` : undefined}
          aria-invalid={invalid || undefined}
          placeholderTextColor={color["ink-subtle"]}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          className={`flex-1 text-ink ${mono ? "font-mono" : ""}`}
          style={{ height: 42, minWidth: 0, fontSize: mono ? 13 : 15 }}
        />
        {trailing}
      </View>
      {hint}
    </View>
  );
}

/** Aviso em bloco (erro, sucesso, atenção ou informação) acima do formulário. */
function LoginAlert({
  tone,
  title,
  children,
  role,
}: {
  tone: "danger" | "success" | "warning" | "brand" | "neutral";
  title?: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
}) {
  const palette = {
    danger: { border: color.danger, bg: color["danger-tint"], fg: color.danger, icon: TriangleAlert },
    success: { border: color.success, bg: color["success-tint"], fg: color.success, icon: CircleCheck },
    warning: { border: color.warning, bg: color["warning-tint"], fg: color.warning, icon: TriangleAlert },
    brand: { border: color.border, bg: color["brand-tint"], fg: color.brand, icon: null },
    neutral: { border: color.border, bg: color["surface-sunken"], fg: color["ink-muted"], icon: null },
  }[tone];
  return (
    <View
      role={role}
      className="flex-row rounded-ds-md"
      style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg }}
    >
      {tone === "brand" ? (
        <ActivityIndicator size="small" color={color.brand} />
      ) : palette.icon ? (
        <View style={{ marginTop: 1 }}>
          <Icon icon={palette.icon} size={16} color={palette.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {!!title && (
          <Text className="font-semibold" style={{ fontSize: 13, lineHeight: 18, color: palette.fg }}>
            {title}
          </Text>
        )}
        {!!children && (
          <Text style={{ fontSize: 13, lineHeight: 18, color: tone === "neutral" || tone === "brand" ? palette.fg : color.ink }}>{children}</Text>
        )}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const isLocalhost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [superAdminOpen, setSuperAdminOpen] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const showSidePanel = windowWidth >= SIDE_PANEL_MIN_WIDTH;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState<Record<string, any> | null>(null);
  const [debugCopied, setDebugCopied] = useState(false);
  const lastLoginAttemptRef = useRef(0);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState("");
  const [apiVersion, setApiVersion] = useState<string>("-");
  const [contractVersion, setContractVersion] = useState<string>("-");
  const [minSupportedVersion, setMinSupportedVersion] = useState<string>("");
  const [recommendedVersion, setRecommendedVersion] = useState<string>("");
  const [mustUpdate, setMustUpdate] = useState(false);
  const [shouldRecommendUpdate, setShouldRecommendUpdate] = useState(false);
  const [verificationBadge, setVerificationBadge] = useState<VerificationBadgeState>({
    visible: false,
    label: "",
    status: "pending",
  });
  const [reloadConfirmationVisible, setReloadConfirmationVisible] = useState(false);
  const [reloadConfirmationMessage, setReloadConfirmationMessage] = useState("");

  const showVerification = (label: string, status: VerificationBadgeStatus = "pending") => {
    setVerificationBadge({ visible: true, label, status });
  };

  const testInternetConnection = async () => {
    try {
      const baseUrl = String(api.defaults.baseURL ?? "").replace(/\/$/, "");
      console.log("🌐 Iniciando teste de conexão com internet...");
      console.log("📍 Base URL:", baseUrl);
      
      if (!baseUrl) {
        console.error("❌ Base URL está vazia!");
        return false;
      }

      const healthUrl = `${baseUrl}/health`;
      console.log("🔗 Tentando conectar em:", healthUrl);
      
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => {
        console.warn("⏱️ Timeout! Abortando requisição após 6 segundos");
        controller.abort();
      }, 6000);

      const startTime = performance.now();
      const response = await fetch(healthUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-cache",
        credentials: "include",
      });

      const endTime = performance.now();
      window.clearTimeout(timeoutId);
      
      console.log(`✅ Resposta recebida: ${response.status} ${response.statusText}`);
      console.log(`⏱️ Tempo de resposta: ${(endTime - startTime).toFixed(0)}ms`);
      
      return response.ok;
    } catch (error: any) {
      console.error("❌ Erro ao testar conexão com internet:", error);
      console.error("📋 Detalhes:", {
        name: error?.name,
        message: error?.message,
        type: error?.type,
      });
      return false;
    }
  };

  const fetchMetaInfo = async () => {
    const metaUrl = `${String(api.defaults.baseURL ?? "").replace(/\/$/, "")}/meta`;
    const response = await fetch(metaUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const rawData = await response.json().catch(() => ({}));
    const body = rawData?.body ?? rawData ?? {};

    const nextApiVersion =
      body?.api_version ?? response.headers.get("x-api-version") ?? "-";
    const nextContractVersion =
      body?.contract_version ?? response.headers.get("x-api-contract-version") ?? "-";
    const nextMinSupportedVersion =
      body?.min_supported_app_version ??
      response.headers.get("x-min-supported-app-version") ??
      "";
    const nextRecommendedVersion =
      body?.recommended_app_version ??
      response.headers.get("x-recommended-app-version") ??
      "";

    return {
      apiVersion: String(nextApiVersion),
      contractVersion: String(nextContractVersion),
      minSupportedVersion: String(nextMinSupportedVersion || ""),
      recommendedVersion: String(nextRecommendedVersion || ""),
    };
  };

  const fetchPanelVersion = async () => {
    const panelVersionUrl = `${String(api.defaults.baseURL ?? "").replace(/\/$/, "")}/version/panel`;
    const response = await fetch(panelVersionUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const rawData = await response.json().catch(() => ({}));
    const body = rawData?.body ?? rawData ?? {};

    return {
      version: String(body?.version ?? "-"),
      releaseDate: String(body?.release_date ?? "-"),
    };
  };

  const checkPanelBuildAndReload = async () => {
    try {
      const panel = await fetchPanelVersion();
      if (!panel.version || panel.version === "-") return false;

      if (typeof localStorage !== "undefined") {
        localStorage.setItem("panel_version_latest", panel.version);
      }

      const versionDiff = compareBuildVersions(panel.version, CURRENT_BUILD_VERSION);
      if (versionDiff > 0) {
        const alreadyAttemptedVersion =
          typeof localStorage !== "undefined"
            ? localStorage.getItem(STORAGE_PANEL_RELOAD_ATTEMPT_KEY)
            : null;

        if (alreadyAttemptedVersion !== panel.version) {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(STORAGE_PANEL_RELOAD_ATTEMPT_KEY, panel.version);
          }
          setError(
            `Nova versão do painel detectada (${panel.version}). Versão atual no navegador: ${CURRENT_BUILD_VERSION}.`
          );
          return true;
        }

        setError(
          `Versão nova detectada (${panel.version}), mas o navegador manteve a versão antiga (${CURRENT_BUILD_VERSION}). Faça recarga forçada (Ctrl+F5) para atualizar.`
        );
        return false;
      }

      // Se a versão remota for igual ou menor, não há atualização pendente.
      if (versionDiff <= 0) {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(STORAGE_PANEL_RELOAD_ATTEMPT_KEY);
        }
        return false;
      }

      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_PANEL_RELOAD_ATTEMPT_KEY);
      }
    } catch {
      // Se falhar leitura da versão do painel, mantém fluxo normal de login.
    }

    return false;
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setTenantId("");
    setShowPass(false);
    setSuperAdminOpen(false);
    setError("");
    setDebugInfo(null);
    setDebugCopied(false);
  };

  useEffect(() => {
    resetForm();

    let active = true;
    const loadMeta = async () => {
      setMetaLoading(true);
      setMetaError("");
      try {
        const requiresReload = await checkPanelBuildAndReload();
        if (requiresReload || !active) return;

        const {
          apiVersion: nextApiVersion,
          contractVersion: nextContractVersion,
          minSupportedVersion: nextMinSupportedVersion,
          recommendedVersion: nextRecommendedVersion,
        } = await fetchMetaInfo();

        if (!active) return;

        setApiVersion(nextApiVersion);
        setContractVersion(nextContractVersion);
        setMinSupportedVersion(nextMinSupportedVersion);
        setRecommendedVersion(nextRecommendedVersion);

        if (typeof localStorage !== "undefined") {
          localStorage.setItem(STORAGE_API_VERSION_KEY, nextApiVersion);
        }

        const requireUpdate =
          !!nextMinSupportedVersion &&
          compareVersions(APP_VERSION, nextMinSupportedVersion) < 0;
        const recommendUpdate =
          !!nextRecommendedVersion &&
          compareVersions(APP_VERSION, nextRecommendedVersion) < 0;

        setMustUpdate(requireUpdate);
        setShouldRecommendUpdate(!requireUpdate && recommendUpdate);
      } catch {
        if (!active) return;
        setMetaError("Não foi possível validar versão da API agora. Você pode tentar o login.");
      } finally {
        if (active) setMetaLoading(false);
      }
    };

    loadMeta();
    return () => {
      active = false;
    };
  }, []);

  // Aviso de Caps Lock no campo de senha (só na web, onde o teclado físico informa o estado).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const check = (event: KeyboardEvent) => {
      if ((document.activeElement as HTMLElement | null)?.id !== PASSWORD_INPUT_ID) return;
      setCapsLockOn(event.getModifierState?.("CapsLock") ?? false);
    };
    document.addEventListener("keydown", check);
    document.addEventListener("keyup", check);
    return () => {
      document.removeEventListener("keydown", check);
      document.removeEventListener("keyup", check);
    };
  }, []);

  const fillDemoLogin = () => {
    setEmail(DEMO_LOGIN.email);
    setPassword(DEMO_LOGIN.password);
    setError("");
    setVerificationBadge((prev) => ({ ...prev, visible: false }));
  };

  const handleLogin = async () => {
    if (loading) return;

    setError("");
    showVerification("Verificando conexão com a internet...");

    console.log("🔍 Etapa 1: Verificando conexão com internet...");
    const isConnected = await testInternetConnection();

    if (!isConnected) {
      console.error("🛑 Falha na conexão com a API!");
      showVerification("Falha na conexão com a API", "error");
      setError("Não foi possível conectar com a API. Verifique se tem conexão com a internet e tente novamente.");
      return;
    }

    console.log("✅ Conexão com internet estabelecida!");
    showVerification("Validando versão da API...");

    let latestApiVersion = "-";
    let latestContractVersion = "-";
    let latestMinSupportedVersion = "";
    let latestRecommendedVersion = "";

    try {
      const latestMeta = await fetchMetaInfo();
      latestApiVersion = latestMeta.apiVersion;
      latestContractVersion = latestMeta.contractVersion;
      latestMinSupportedVersion = latestMeta.minSupportedVersion;
      latestRecommendedVersion = latestMeta.recommendedVersion;

      setApiVersion(latestApiVersion);
      setContractVersion(latestContractVersion);
      setMinSupportedVersion(latestMinSupportedVersion);
      setRecommendedVersion(latestRecommendedVersion);

      const requireUpdate =
        !!latestMinSupportedVersion &&
        compareVersions(APP_VERSION, latestMinSupportedVersion) < 0;
      const recommendUpdate =
        !!latestRecommendedVersion &&
        compareVersions(APP_VERSION, latestRecommendedVersion) < 0;

      setMustUpdate(requireUpdate);
      setShouldRecommendUpdate(!requireUpdate && recommendUpdate);

      if (typeof localStorage !== "undefined") {
        const previousApiVersion = localStorage.getItem(STORAGE_API_VERSION_KEY);
        if (previousApiVersion && previousApiVersion !== latestApiVersion) {
          showVerification("Nova versão da API detectada", "error");
          setError(
            `Nova versão da API detectada: v${latestApiVersion}. Será necessário recarregar.`
          );
          localStorage.clear();
          localStorage.setItem("app_version", APP_VERSION);
          localStorage.setItem(STORAGE_API_VERSION_KEY, latestApiVersion);
          setReloadConfirmationMessage(
            "Uma nova versão da API foi detectada. O painel será recarregado para atualizar."
          );
          setReloadConfirmationVisible(true);
          return;
        }
        localStorage.setItem(STORAGE_API_VERSION_KEY, latestApiVersion);
      }
    } catch {
      showVerification("Não foi possível validar a API", "error");
      setError("Não foi possível validar atualização da API.");
      return;
    }

    showVerification("Verificando versão do painel...");
    const requiresReload = await checkPanelBuildAndReload();
    if (requiresReload) {
      showVerification("Nova versão do painel detectada", "error");
      setReloadConfirmationMessage(
        "Uma nova versão do painel foi detectada. O painel será recarregado para atualizar."
      );
      setReloadConfirmationVisible(true);
      return;
    }

    if (metaLoading) {
      showVerification("Aguardando validação de versão...", "pending");
      setError("Aguarde a validação de versão antes de entrar.");
      return;
    }

    if (mustUpdate) {
      showVerification("Atualização do app obrigatória", "error");
      setError(
        `Atualização obrigatória: versão mínima suportada ${minSupportedVersion}. Versão atual ${APP_VERSION}.`
      );
      return;
    }

    if (!email || !password) {
      showVerification("Preencha e-mail e senha", "error");
      setError("Preencha o e-mail e a senha.");
      return;
    }

    const now = Date.now();
    if (now - lastLoginAttemptRef.current < 300) return;
    lastLoginAttemptRef.current = now;

    setLoading(true);
    setDebugInfo(null);
    setDebugCopied(false);
    showVerification("Autenticando...");
    try {
      const tenantIdValue = tenantId.trim();
      const parsedTenantId = tenantIdValue ? Number(tenantIdValue) : null;
      if (tenantIdValue && (!Number.isInteger(Number(tenantIdValue)) || Number(tenantIdValue) <= 0)) {
        showVerification("Tenant ID inválido", "error");
        setError("Tenant ID deve ser um número inteiro válido.");
        setLoading(false);
        return;
      }
      await login(email, password, parsedTenantId);
      showVerification("Login autorizado", "success");
    } catch (e: any) {
      showVerification("Credenciais inválidas", "error");
      const msg =
        e.response?.data?.message ||
        "Credenciais inválidas. Verifique e tente novamente.";
      setError(msg);
      setDebugInfo({
        timestamp: new Date().toISOString(),
        error_type: e.code ?? (e.response ? "HTTP_ERROR" : "NETWORK_ERROR"),
        message: e.message,
        status: e.response?.status ?? null,
        status_text: e.response?.statusText ?? null,
        url: e.config?.url ?? e.request?.responseURL ?? null,
        method: e.config?.method?.toUpperCase() ?? null,
        base_url: e.config?.baseURL ?? null,
        response_data: e.response?.data ?? null,
        timeout: e.config?.timeout ?? null,
        page_origin: typeof window !== "undefined" ? window.location.origin : null,
      });
    } finally {
      setLoading(false);
    }
  };

  const closeDebug = () => {
    setDebugInfo(null);
    setDebugCopied(false);
  };

  const copyDebugInfo = async () => {
    if (!debugInfo) return;
    const text = JSON.stringify(debugInfo, null, 2);

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }

    setDebugCopied(true);
    window.setTimeout(() => setDebugCopied(false), 2500);
  };

  const confirmReloadAndRefresh = () => {
    setReloadConfirmationVisible(false);
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const closeReloadConfirmation = () => {
    setReloadConfirmationVisible(false);
  };

  const verificationBadgeStyles = {
    pending: { wrap: "border-border bg-brand-tint", text: "text-brand" },
    success: { wrap: "border-success bg-success-tint", text: "text-success" },
    error: { wrap: "border-danger bg-danger-tint", text: "text-danger" },
  }[verificationBadge.status];

  const submitDisabled = loading || metaLoading || mustUpdate;
  const submitLabel = mustUpdate ? "Atualização obrigatória" : loading ? "Entrando…" : "Entrar";

  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: color.surface }}
      contentContainerStyle={{ minHeight: "100%", flexDirection: "row" }}
    >
      {/* Lado institucional — mesmo azul-tinta da sidebar */}
      {showSidePanel && (
        <View
          style={{
            flex: 1.05,
            backgroundColor: color["nav-bg"],
            justifyContent: "space-between",
            paddingVertical: 24,
            paddingHorizontal: 32,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View className="rounded-ds-sm items-center justify-center" style={{ width: 32, height: 32, backgroundColor: color["nav-ink"] }} aria-hidden>
              <Text className="font-semibold" style={{ fontSize: 13, lineHeight: 13, color: color["nav-bg"] }}>
                CH
              </Text>
            </View>
            <Text className="font-semibold" style={{ fontSize: 16, lineHeight: 20, color: color["nav-ink"] }}>
              Cursinho Hub
            </Text>
          </View>

          <LoginTiles />

          <View style={{ maxWidth: 440 }}>
            <Text role="heading" aria-level={2} className="font-semibold" style={{ fontSize: 40, lineHeight: 46, letterSpacing: -0.8, color: color["nav-ink"] }}>
              A secretaria do seu cursinho, num só lugar.
            </Text>
            <Text style={{ marginTop: 16, fontSize: 16, lineHeight: 24, color: color["nav-ink-muted"] }}>
              Turmas, matrículas, frequência e simulados com o mesmo registro para toda a equipe.
            </Text>
          </View>

          <Text style={{ fontSize: 12, lineHeight: 16, color: color["nav-label"] }}>© {new Date().getFullYear()} Cursinho Hub</Text>
        </View>
      )}

      {/* Formulário */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ width: "100%", maxWidth: 400 }}>
          {!showSidePanel && (
            <View className="flex-row items-center mb-6" style={{ gap: 12 }}>
              <View className="bg-nav-bg rounded-ds-sm items-center justify-center" style={{ width: 32, height: 32 }} aria-hidden>
                <Text className="font-semibold text-nav-ink" style={{ fontSize: 13, lineHeight: 13 }}>
                  CH
                </Text>
              </View>
              <Text className="font-semibold text-ink" style={{ fontSize: 16, lineHeight: 20 }}>
                Cursinho Hub
              </Text>
            </View>
          )}

          <Text role="heading" aria-level={1} className="font-semibold text-ink" style={{ fontSize: 28, lineHeight: 36, letterSpacing: -0.28 }}>
            Entrar
          </Text>
          <Text className="text-ink-muted" style={{ fontSize: 14, lineHeight: 22, marginTop: 4, marginBottom: 24 }}>
            Use seu e-mail ou número de matrícula para acessar o painel.
          </Text>

          <View style={{ gap: 20 }}>
            {metaLoading && <LoginAlert tone="brand" role="status">Validando versão da API…</LoginAlert>}

            {!metaLoading && mustUpdate && (
              <LoginAlert tone="danger" role="alert" title="Atualização obrigatória">
                Versão mínima: {minSupportedVersion}. Atual: {APP_VERSION}. Atualize o app para continuar.
              </LoginAlert>
            )}

            {!metaLoading && shouldRecommendUpdate && (
              <LoginAlert tone="warning" title="Atualização recomendada">
                Recomendado: {recommendedVersion}. Atual: {APP_VERSION}.
              </LoginAlert>
            )}

            {!metaLoading && !!metaError && <LoginAlert tone="neutral">{metaError}</LoginAlert>}

            {!!error && (
              <LoginAlert tone="danger" role="alert" title="Não foi possível entrar">
                {error}
              </LoginAlert>
            )}

            <LoginField
              label="E-mail ou matrícula"
              icon={Mail}
              invalid={!!error}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError("");
                setVerificationBadge((prev) => ({ ...prev, visible: false }));
              }}
              nativeID="login-email-input"
              testID="login-email-input"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              autoCorrect={false}
              placeholder="nome@escola.com.br"
            />

            <LoginField
              label="Senha"
              icon={Lock}
              invalid={!!error}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError("");
                setVerificationBadge((prev) => ({ ...prev, visible: false }));
              }}
              nativeID={PASSWORD_INPUT_ID}
              testID={PASSWORD_INPUT_ID}
              secureTextEntry={!showPass}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              autoCorrect={false}
              aria-describedby={capsLockOn ? "login-caps-lock" : undefined}
              onBlur={() => setCapsLockOn(false)}
              onSubmitEditing={handleLogin}
              trailing={
                <Pressable
                  onPress={() => setShowPass(!showPass)}
                  testID="login-password-toggle"
                  role="button"
                  aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPass}
                  style={(state) => ({
                    width: 36,
                    height: 36,
                    borderRadius: 4,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: (state as { hovered?: boolean }).hovered ? color["surface-sunken"] : "transparent",
                  })}
                >
                  <Icon icon={showPass ? EyeOff : Eye} size={16} color={color["ink-muted"]} />
                </Pressable>
              }
              hint={
                capsLockOn ? (
                  <Text nativeID="login-caps-lock" style={{ fontSize: 12, lineHeight: 16, color: color.warning }}>
                    Caps Lock está ativado.
                  </Text>
                ) : null
              }
            />

            {/* Verificação inline */}
            {verificationBadge.visible && (
              <View
                role="status"
                className={`flex-row items-center justify-center gap-2 self-center rounded-ds-sm border px-3 py-1.5 ${verificationBadgeStyles.wrap}`}
              >
                {verificationBadge.status === "pending" ? (
                  <ActivityIndicator size="small" color={color.brand} />
                ) : verificationBadge.status === "success" ? (
                  <Icon icon={CircleCheck} size={16} color={color.success} />
                ) : (
                  <Icon icon={TriangleAlert} size={16} color={color.danger} />
                )}
                <Text className={`text-xs font-semibold ${verificationBadgeStyles.text}`}>{verificationBadge.label}</Text>
              </View>
            )}

            <Button
              variant="primary"
              label={submitLabel}
              onPress={handleLogin}
              loading={metaLoading}
              disabled={submitDisabled}
              fullWidth
              style={{ height: 44 }}
            />

            {/* Acesso de super admin: entra direto num tenant */}
            <View className="border-t border-border" style={{ paddingTop: 16 }}>
              <Pressable
                onPress={() => setSuperAdminOpen(!superAdminOpen)}
                role="button"
                aria-expanded={superAdminOpen}
                aria-controls="login-super-admin"
                testID="login-super-admin-toggle"
                className="flex-row items-center self-start"
                style={{ gap: 8 }}
              >
                <View style={{ transform: [{ rotate: superAdminOpen ? "90deg" : "0deg" }] }}>
                  <Icon icon={ChevronRight} size={16} color={color["ink-muted"]} />
                </View>
                <Text className="font-medium text-ink-muted" style={{ fontSize: 13, lineHeight: 18 }}>
                  Acesso de super admin
                </Text>
              </Pressable>
              {superAdminOpen && (
                <View nativeID="login-super-admin" style={{ marginTop: 12 }}>
                  <LoginField
                    label="ID da organização (tenant)"
                    icon={Building2}
                    mono
                    value={tenantId}
                    onChangeText={(v) => {
                      setTenantId(v.replace(/\D/g, ""));
                      setError("");
                    }}
                    nativeID="login-tenant-id-input"
                    testID="login-tenant-id-input"
                    keyboardType="numeric"
                    autoCapitalize="none"
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                    autoCorrect={false}
                    placeholder="Ex.: 2"
                    aria-describedby="login-tenant-hint"
                    onSubmitEditing={handleLogin}
                    hint={
                      <Text nativeID="login-tenant-hint" className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16 }}>
                        Opcional. Entra diretamente na organização informada.
                      </Text>
                    }
                  />
                </View>
              )}
            </View>

            {/* Acesso de demonstração (só em localhost) */}
            {isLocalhost && (
              <View
                className="flex-row items-center justify-between rounded-ds-md"
                style={{ gap: 16, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderStyle: "dashed", borderColor: color["border-strong"] }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="font-semibold text-ink" style={{ fontSize: 13, lineHeight: 18 }}>
                    Ambiente de demonstração
                  </Text>
                  <Text className="font-mono text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
                    {DEMO_LOGIN.email} · {DEMO_LOGIN.password}
                  </Text>
                </View>
                <Button size="sm" label="Preencher" onPress={fillDemoLogin} />
              </View>
            )}
          </View>

          {/* Versão */}
          <View style={{ marginTop: 32, gap: 2, alignItems: "center" }}>
            <Text className="font-mono text-ink-subtle text-center" style={{ fontSize: 11, lineHeight: 16 }}>
              API {apiVersion} · App {(buildInfo as any)?.version ?? "-"} · Contrato {formatDateToPtBr(contractVersion)}
            </Text>
            <Text className="font-mono text-ink-subtle text-center" style={{ fontSize: 11, lineHeight: 16 }}>
              Build {(buildInfo as any)?.version ?? "-"} · {formatBuildDateTime((buildInfo as any)?.buildDate ?? "")}
            </Text>
          </View>
        </View>
      </View>

      <Modal
        visible={!!debugInfo}
        title="Debug da rede"
        onClose={closeDebug}
        size="lg"
        footer={
          <>
            <TouchableOpacity
              onPress={closeDebug}
              className="px-5 rounded-ds-md border border-border-strong py-2 min-h-control-md justify-center"
              activeOpacity={0.75}
            >
              <Text className="text-sm font-semibold text-ink">Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={copyDebugInfo}
              className="px-5 rounded-ds-md bg-brand py-2 min-h-control-md justify-center"
              activeOpacity={0.8}
            >
              <Text className="text-sm font-medium text-on-brand">
                {debugCopied ? "Copiado!" : "Copiar JSON"}
              </Text>
            </TouchableOpacity>
          </>
        }
      >
        <View className="bg-gray-950 rounded-ds-md p-3">
          <Text
            selectable
            className="text-gray-200 text-xs leading-relaxed"
            style={{ fontFamily: "monospace" }}
          >
            {JSON.stringify(debugInfo, null, 2)}
          </Text>
        </View>
      </Modal>

      <Modal
        visible={reloadConfirmationVisible}
        title="Atualizar painel"
        onClose={closeReloadConfirmation}
        size="sm"
        footer={
          <>
            <TouchableOpacity
              onPress={closeReloadConfirmation}
              className="px-5 rounded-ds-md border border-border-strong py-2 min-h-control-md justify-center"
              activeOpacity={0.75}
            >
              <Text className="text-sm font-semibold text-ink">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmReloadAndRefresh}
              className="px-5 rounded-ds-md bg-brand py-2 min-h-control-md justify-center"
              activeOpacity={0.8}
            >
              <Text className="text-sm font-medium text-on-brand">OK, Recarregar</Text>
            </TouchableOpacity>
          </>
        }
      >
        <View className="items-center gap-3">
          <Ionicons name="refresh-outline" size={32} color="var(--ds-brand)" />
          <Text className="text-sm text-ink text-center leading-relaxed">
            {reloadConfirmationMessage}
          </Text>
        </View>
      </Modal>
    </ScrollView>
  );
}
