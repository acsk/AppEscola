import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const isLocalhost =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const [email, setEmail] = useState(
    isLocalhost ? "admin@cursinhoexemplo.com" : ""
  );
  const [password, setPassword] = useState(isLocalhost ? "123456" : "");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Preencha o e-mail e a senha.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(email, password);
    } catch (e: any) {
      const msg =
        e.response?.data?.message ||
        "Credenciais inválidas. Verifique e tente novamente.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: "#EEEEFF" }}
    >
      {/* Card */}
      <View
        className="bg-white rounded-3xl p-10 w-full"
        style={{
          maxWidth: 420,
          shadowColor: "#7C3AED",
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 10,
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
              autoComplete="email"
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
    </View>
  );
}
