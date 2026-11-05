import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import PageHeader from "../../components/ui/PageHeader";
import ToastBanner from "../../components/ui/ToastBanner";
import EmailSettingsEditor from "../../components/integrations/EmailSettingsEditor";
import { useAuth } from "../../contexts/AuthContext";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { getActiveTenantId } from "../../utils/tenantContext";
import type { ApiToastState } from "../../utils/apiErrors";

/** Configurações → E-mail: provedor de envio da escola (Resend), domínio, teste e histórico. */
export default function EmailSettingsScreen() {
  const { user } = useAuth();
  const { contentPadding } = useResponsiveLayout();
  const [toast, setToast] = useState<ApiToastState>({ visible: false, type: "success", message: "" });
  // Super admin em acesso assistido: a escola acessada; admin: a própria (a API decide).
  const tenantId = user?.role === "super_admin" ? getActiveTenantId(user) ?? null : null;

  return (
    <View className="flex-1">
      <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, gap: 24 }}>
        <PageHeader
          title="E-mail"
          description="Conta de envio de e-mails da escola (Resend). Os e-mails saem com o nome e o endereço do remetente configurados aqui."
        />
        <EmailSettingsEditor tenantId={tenantId} setToast={setToast} />
      </ScrollView>
      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((t) => ({ ...t, visible: false }))} />
    </View>
  );
}
