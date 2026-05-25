import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import Modal from "../components/ui/Modal";
import api from "../services/api";
import appJson from "../app.json";
import buildInfo from "../buildInfo.json";

const APP_VERSION = (appJson as any)?.expo?.version ?? "0.0.0";
const CURRENT_BUILD_VERSION = String((buildInfo as any)?.version ?? "-");
const STORAGE_API_VERSION_KEY = "api_version_seen";
const STORAGE_PANEL_RELOAD_ATTEMPT_KEY = "panel_reload_attempt_version";

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

export default function LoginScreen() {
  const { login } = useAuth();
  const isLocalhost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showPass, setShowPass] = useState(false);
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
    pending: { wrap: "border-violet-200 bg-violet-50", text: "text-violet-800" },
    success: { wrap: "border-emerald-200 bg-emerald-50", text: "text-emerald-800" },
    error: { wrap: "border-red-200 bg-red-50", text: "text-red-700" },
  }[verificationBadge.status];

  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: "#EEEEFF" }}
      contentContainerStyle={{
        minHeight: "100%",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Card */}
      <View
        className="bg-white rounded-3xl p-10 w-full"
        style={{
          maxWidth: 420,
          boxShadow: "0 18px 48px rgba(124, 58, 237, 0.12)",
        }}
      >
        {/* Logo */}
        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-violet-600 rounded-2xl items-center justify-center mb-4">
            <Ionicons name="school" size={32} color="white" />
          </View>
          <Text className="text-2xl font-bold text-gray-800">AppCurso</Text>
          <Text className="text-sm text-gray-400 mt-1">
            Gerência de Cursinho — Painel Admin
          </Text>
          <View className="mt-3 items-center">
            <Text className="text-[11px] font-semibold text-violet-600">
              API v{apiVersion} • App {(buildInfo as any)?.version ?? "-"}
            </Text>
            <Text className="text-[10px] text-gray-400 mt-0.5">
              Contrato {formatDateToPtBr(contractVersion)}
            </Text>
            <Text className="text-[10px] text-gray-400">
              Build: {(buildInfo as any)?.version ?? "-"} • {formatBuildDateTime((buildInfo as any)?.buildDate ?? "")}
            </Text>
          </View>
        </View>

        {metaLoading && (
          <View className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#2563EB" />
            <Text className="text-sm text-blue-700">Validando versão da API...</Text>
          </View>
        )}

        {!metaLoading && mustUpdate && (
          <View className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="text-sm font-semibold text-red-700">Atualização obrigatória</Text>
            <Text className="text-xs text-red-600 mt-1">
              Versão mínima: {minSupportedVersion}. Atual: {APP_VERSION}. Atualize o app para continuar.
            </Text>
          </View>
        )}

        {!metaLoading && shouldRecommendUpdate && (
          <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Text className="text-sm font-semibold text-amber-700">Atualização recomendada</Text>
            <Text className="text-xs text-amber-600 mt-1">
              Recomendado: {recommendedVersion}. Atual: {APP_VERSION}.
            </Text>
          </View>
        )}

        {!metaLoading && !!metaError && (
          <View className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <Text className="text-xs text-gray-600">{metaError}</Text>
          </View>
        )}

        {/* Email */}
        <View className="mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">
            E-mail ou matrícula
          </Text>
          <View
            className={`flex-row items-center border rounded-xl px-4 bg-gray-50 ${
              error ? "border-red-300" : "border-gray-200"
            }`}
          >
            <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
            <TextInput
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError("");
                setVerificationBadge((prev) => ({ ...prev, visible: false }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              autoCorrect={false}
              placeholder="seu@email.com ou matrícula"
              placeholderTextColor="#9CA3AF"
              className="flex-1 ml-2 py-3 text-sm text-gray-800"
            />
          </View>
        </View>

        {/* Senha */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">
            Senha
          </Text>
          <View
            className={`flex-row items-center border rounded-xl px-4 bg-gray-50 ${
              error ? "border-red-300" : "border-gray-200"
            }`}
          >
            <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
            <TextInput
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError("");
                setVerificationBadge((prev) => ({ ...prev, visible: false }));
              }}
              secureTextEntry={!showPass}
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              autoCorrect={false}
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              className="flex-1 ml-2 py-3 text-sm text-gray-800"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPass(!showPass)} className="p-1">
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={18}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tenant opcional */}
        <View className="mb-6">
          <Text className="text-sm font-semibold text-gray-700 mb-1.5">
            Tenant ID (opcional)
          </Text>
          <View
            className={`flex-row items-center border rounded-xl px-4 bg-gray-50 ${
              error ? "border-red-300" : "border-gray-200"
            }`}
          >
            <Ionicons name="business-outline" size={18} color="#9CA3AF" />
            <TextInput
              value={tenantId}
              onChangeText={(v) => {
                setTenantId(v.replace(/\D/g, ""));
                setError("");
              }}
              keyboardType="numeric"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="none"
              importantForAutofill="no"
              autoCorrect={false}
              placeholder="Ex.: 2 (apenas super admin)"
              placeholderTextColor="#9CA3AF"
              className="flex-1 ml-2 py-3 text-sm text-gray-800"
            />
          </View>
          <Text className="text-xs text-gray-400 mt-1">
            Se preenchido, o login será feito no tenant informado.
          </Text>
        </View>

        {/* Verificação inline */}
        {verificationBadge.visible && (
          <View
            className={`mb-4 flex-row items-center justify-center gap-2 self-center rounded-full border px-4 py-2 ${verificationBadgeStyles.wrap}`}
          >
            {verificationBadge.status === "pending" ? (
              <ActivityIndicator size="small" color="#7C3AED" />
            ) : verificationBadge.status === "success" ? (
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
            ) : (
              <Ionicons name="close-circle" size={18} color="#DC2626" />
            )}
            <Text className={`text-xs font-semibold ${verificationBadgeStyles.text}`}>
              {verificationBadge.label}
            </Text>
          </View>
        )}

        {/* Erro */}
        {!!error && (
          <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
            <Text className="text-sm text-red-600 ml-2 flex-1">{error}</Text>
          </View>
        )}

        {/* Botão */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading || metaLoading || mustUpdate}
          className="bg-violet-600 rounded-xl py-3.5 items-center"
          activeOpacity={0.85}
          style={{ opacity: loading || metaLoading || mustUpdate ? 0.75 : 1 }}
        >
          {loading || metaLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-bold text-sm">
              {mustUpdate ? "Atualização obrigatória" : "Entrar"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Info dev */}
        {isLocalhost && (
          <View className="mt-6 bg-violet-50 rounded-xl p-4 border border-violet-100">
            <Text className="text-xs font-semibold text-violet-700 mb-1">
              Acesso de demonstração
            </Text>
            <Text className="text-xs text-violet-600">
              admin@cursinhoexemplo.com{"\n"}Senha: 123456
            </Text>
          </View>
        )}

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
              className="px-5 py-2.5 rounded-xl border border-gray-200"
              activeOpacity={0.75}
            >
              <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={copyDebugInfo}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
              activeOpacity={0.8}
            >
              <Text className="text-sm font-bold text-white">
                {debugCopied ? "Copiado!" : "Copiar JSON"}
              </Text>
            </TouchableOpacity>
          </>
        }
      >
        <View className="bg-gray-950 rounded-xl p-3">
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
              className="px-5 py-2.5 rounded-xl border border-gray-200"
              activeOpacity={0.75}
            >
              <Text className="text-sm font-semibold text-gray-700">Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmReloadAndRefresh}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
              activeOpacity={0.8}
            >
              <Text className="text-sm font-bold text-white">OK, Recarregar</Text>
            </TouchableOpacity>
          </>
        }
      >
        <View className="items-center gap-3">
          <Ionicons name="refresh-outline" size={32} color="#7C3AED" />
          <Text className="text-sm text-gray-700 text-center leading-relaxed">
            {reloadConfirmationMessage}
          </Text>
        </View>
      </Modal>
    </ScrollView>
  );
}
