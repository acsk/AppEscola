import React, { useEffect, useState } from "react";
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

    if (typeof document === "undefined") return;

    const removeOrphanModalPortals = () => {
      Array.from(document.body.children).forEach((node) => {
        const element = node as HTMLElement;
        const isRoot = element.id === "root";
        const isElementReactPortal =
          element.tagName === "DIV" &&
          !isRoot &&
          element.querySelector('[aria-modal="true"], [role="dialog"]');

        if (isElementReactPortal) {
          element.remove();
        }
      });

      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };

    removeOrphanModalPortals();
    const cleanupTimer = window.setTimeout(removeOrphanModalPortals, 100);
    const observer = new MutationObserver(removeOrphanModalPortals);
    observer.observe(document.body, { childList: true });

    return () => {
      window.clearTimeout(cleanupTimer);
      observer.disconnect();
    };
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Preencha o e-mail e a senha.");
      return;
    }
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
          disabled={loading}
          className="bg-violet-600 rounded-xl py-3.5 items-center"
          activeOpacity={0.85}
          style={{ opacity: loading ? 0.75 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-bold text-sm">Entrar</Text>
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
    </ScrollView>
  );
}
