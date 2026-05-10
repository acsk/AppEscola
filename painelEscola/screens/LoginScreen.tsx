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
const STORAGE_API_VERSION_KEY = "api_version_seen";

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
  const [versionCopied, setVersionCopied] = useState(false);
  const lastLoginAttemptRef = useRef(0);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState("");
  const [apiVersion, setApiVersion] = useState<string>("-");
  const [contractVersion, setContractVersion] = useState<string>("-");
  const [minSupportedVersion, setMinSupportedVersion] = useState<string>("");
  const [recommendedVersion, setRecommendedVersion] = useState<string>("");
  const [mustUpdate, setMustUpdate] = useState(false);
  const [shouldRecommendUpdate, setShouldRecommendUpdate] = useState(false);

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

    try {
      const {
        apiVersion: latestApiVersion,
        contractVersion: latestContractVersion,
        minSupportedVersion: latestMinSupportedVersion,
        recommendedVersion: latestRecommendedVersion,
      } = await fetchMetaInfo();

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
          setError(
            `Nova versão da API detectada: v${latestApiVersion}. A página será reiniciada para atualizar.`
          );
          localStorage.clear();
          localStorage.setItem("app_version", APP_VERSION);
          localStorage.setItem(STORAGE_API_VERSION_KEY, latestApiVersion);
          window.setTimeout(() => {
            if (typeof window !== "undefined") window.location.reload();
          }, 1400);
          return;
        }
        localStorage.setItem(STORAGE_API_VERSION_KEY, latestApiVersion);
      }
    } catch {
      // fallback: mantém o fluxo de login atual mesmo sem leitura de /meta na tentativa
    }

    if (metaLoading) {
      setError("Aguarde a validação de versão antes de entrar.");
      return;
    }

    if (mustUpdate) {
      setError(
        `Atualização obrigatória: versão mínima suportada ${minSupportedVersion}. Versão atual ${APP_VERSION}.`
      );
      return;
    }

    if (!email || !password) {
      setError("Preencha o e-mail e a senha.");
      return;
    }

    const now = Date.now();
    if (now - lastLoginAttemptRef.current < 300) return;
    lastLoginAttemptRef.current = now;

    setLoading(true);
    setError("");
    setDebugInfo(null);
    setDebugCopied(false);
    try {
      const tenantIdValue = tenantId.trim();
      const parsedTenantId = tenantIdValue ? Number(tenantIdValue) : null;
      if (tenantIdValue && (!Number.isInteger(Number(tenantIdValue)) || Number(tenantIdValue) <= 0)) {
        setError("Tenant ID deve ser um número inteiro válido.");
        setLoading(false);
        return;
      }
      await login(email, password, parsedTenantId);
    } catch (e: any) {
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
        browser_online: typeof navigator !== "undefined" ? navigator.onLine : null,
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

  const copyVersionInfo = async () => {
    const versionText = `API v${apiVersion} • Contrato ${formatDateToPtBr(contractVersion)}\nAppPainel v${APP_VERSION}\nBuild: ${formatBuildDateTime((buildInfo as any)?.buildDate ?? "")}`;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(versionText);
    }

    setVersionCopied(true);
    window.setTimeout(() => setVersionCopied(false), 2500);
  };

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

        {/* Version Info */}
        <TouchableOpacity
          onPress={copyVersionInfo}
          activeOpacity={0.7}
          className="mt-6 pt-4 border-t border-gray-100"
        >
          <View className="flex-row items-center justify-center gap-2">
            <View className="flex-1 items-center">
              <Text className="text-xs font-medium text-gray-700">
                API v{apiVersion}
              </Text>
              <Text className="text-[11px] text-gray-500 mt-1">
                Contrato {formatDateToPtBr(contractVersion)}
              </Text>
              <Text className="text-[11px] text-gray-500 mt-0.5">
                App v{APP_VERSION}
              </Text>
              <Text className="text-[10px] text-gray-400 mt-0.5">
                Build: {formatBuildDateTime((buildInfo as any)?.buildDate ?? "")}
              </Text>
            </View>
            <View className="items-center justify-center px-3 py-2">
              <Ionicons
                name={versionCopied ? "checkmark" : "copy"}
                size={16}
                color={versionCopied ? "#10B981" : "#9CA3AF"}
              />
              <Text className="text-[10px] text-gray-400 mt-1">
                {versionCopied ? "Copiado" : "Copiar"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

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
    </ScrollView>
  );
}
