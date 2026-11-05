import React from "react";
import { Text, View } from "react-native";
import AiCredentialsEditor from "../integrations/AiCredentialsEditor";
import AiSpendPanel from "../integrations/AiSpendPanel";
import EmailSettingsEditor from "../integrations/EmailSettingsEditor";
import type { ApiToastState } from "../../utils/apiErrors";

/** Aba "IA e e-mail" do detalhe da instituição (super admin): chaves de IA, gastos e e-mail de envio. */
export default function TenantKeysTab({ tenantId, setToast }: { tenantId: number; setToast: React.Dispatch<React.SetStateAction<ApiToastState>> }) {
  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <Text className="text-base font-semibold text-ink">Chaves de IA</Text>
        <AiCredentialsEditor tenantId={tenantId} setToast={setToast} />
      </View>
      <AiSpendPanel tenantId={tenantId} />
      <View style={{ gap: 8 }}>
        <Text className="text-base font-semibold text-ink">E-mail de envio</Text>
        <EmailSettingsEditor tenantId={tenantId} setToast={setToast} />
      </View>
    </View>
  );
}
