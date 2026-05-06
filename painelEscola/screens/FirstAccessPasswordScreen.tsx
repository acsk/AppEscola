import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import FormInput from "../components/ui/FormInput";
import { parseApiErrors } from "../utils/apiErrors";

export default function FirstAccessPasswordScreen() {
  const { completeFirstAccess, logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const formErrors: Record<string, string> = {};

    if (!currentPassword) formErrors.current_password = "Informe a senha atual.";
    if (!newPassword) formErrors.password = "Informe a nova senha.";
    if (!confirmPassword) formErrors.password_confirmation = "Confirme a nova senha.";
    if (newPassword && newPassword.length < 8) {
      formErrors.password = "A nova senha deve ter pelo menos 8 caracteres.";
    }
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      formErrors.password_confirmation = "A confirmação da nova senha não confere.";
    }

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      await completeFirstAccess(currentPassword, newPassword, confirmPassword);
    } catch (e: any) {
      if (e.response?.status === 422) {
        setErrors(parseApiErrors(e.response.data?.errors ?? {}));
      } else {
        setErrors({
          general:
            e.response?.data?.message ||
            "Não foi possível atualizar a senha. Tente novamente.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: "#EEEEFF" }}
    >
      <View
        className="bg-white rounded-3xl p-10 w-full"
        style={{
          maxWidth: 460,
          shadowColor: "#7C3AED",
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 10,
        }}
      >
        <View className="items-center mb-6">
          <View className="w-16 h-16 bg-violet-600 rounded-2xl items-center justify-center mb-4">
            <Ionicons name="key-outline" size={30} color="white" />
          </View>
          <Text className="text-2xl font-bold text-gray-800">Primeiro acesso</Text>
          <Text className="text-sm text-gray-500 mt-1 text-center">
            Para continuar, altere sua senha de acesso.
          </Text>
        </View>

        {!!errors.general && (
          <View className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
            <Text className="text-sm text-red-600 ml-2 flex-1">{errors.general}</Text>
          </View>
        )}

        <FormInput
          label="Senha atual"
          value={currentPassword}
          onChangeText={(v) => {
            setCurrentPassword(v);
            setErrors((prev) => ({ ...prev, current_password: "", general: "" }));
          }}
          error={errors.current_password}
          secureTextEntry
        />

        <FormInput
          label="Nova senha"
          value={newPassword}
          onChangeText={(v) => {
            setNewPassword(v);
            setErrors((prev) => ({ ...prev, password: "", general: "" }));
          }}
          error={errors.password}
          secureTextEntry
        />

        <FormInput
          label="Confirmar nova senha"
          value={confirmPassword}
          onChangeText={(v) => {
            setConfirmPassword(v);
            setErrors((prev) => ({ ...prev, password_confirmation: "", general: "" }));
          }}
          error={errors.password_confirmation}
          secureTextEntry
        />

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          className="bg-violet-600 rounded-xl py-3.5 items-center mt-2"
          activeOpacity={0.85}
          style={{ opacity: loading ? 0.75 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-bold text-sm">Atualizar senha</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          disabled={loading}
          className="rounded-xl py-3.5 items-center mt-2"
          activeOpacity={0.75}
        >
          <Text className="text-sm font-medium text-gray-500">Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
