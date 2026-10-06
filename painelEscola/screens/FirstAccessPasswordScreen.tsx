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
import { color } from "../constants/theme";

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
      style={{ backgroundColor: color.bg }}
    >
      <View className="bg-surface border border-border rounded-ds-md w-full" style={{ maxWidth: 460, padding: 32 }}>
        <View className="mb-6">
          <Text role="heading" aria-level={1} className="font-semibold text-ink" style={{ fontSize: 20, lineHeight: 28 }}>
            Primeiro acesso
          </Text>
          <Text className="text-sm text-ink-muted" style={{ marginTop: 2 }}>
            Para continuar, altere sua senha de acesso.
          </Text>
        </View>

        {!!errors.general && (
          <View className="bg-danger-tint border border-danger rounded-ds-md px-4 py-3 mb-4 flex-row items-center">
            <Ionicons name="alert-circle-outline" size={16} color="var(--ds-danger)" />
            <Text className="text-sm text-danger ml-2 flex-1">{errors.general}</Text>
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
          className="bg-brand rounded-ds-md items-center justify-center mt-2"
          style={{ height: 38, opacity: loading ? 0.45 : 1 }}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="var(--ds-on-brand)" size="small" />
          ) : (
            <Text className="text-on-brand font-medium text-sm">Atualizar senha</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          disabled={loading}
          className="rounded-ds-md items-center justify-center mt-2"
          style={{ height: 38 }}
          activeOpacity={0.75}
        >
          <Text className="text-sm font-medium text-ink-muted">Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
