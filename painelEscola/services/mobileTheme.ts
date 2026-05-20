import api from "./api";
import { unwrapApi } from "../types/api";
import type { MobileThemeColors, MobileThemeResponse } from "../types/mobileTheme";

const tenantParams = (tenantId?: number | null) =>
  tenantId != null ? { tenant_id: tenantId } : undefined;

export async function getMobileTheme(
  tenantId?: number | null
): Promise<MobileThemeResponse> {
  const { data } = await api.get("/tenant-mobile-theme", {
    params: tenantParams(tenantId),
  });
  return unwrapApi<MobileThemeResponse>(data);
}

export async function updateMobileTheme(
  payload: {
    template_id?: string;
    colors?: Partial<MobileThemeColors>;
    clear_overrides?: boolean;
  },
  tenantId?: number | null
): Promise<MobileThemeResponse> {
  const { data } = await api.put("/tenant-mobile-theme", payload, {
    params: tenantParams(tenantId),
  });
  return unwrapApi<MobileThemeResponse>(data);
}

export async function resetMobileTheme(
  tenantId?: number | null
): Promise<MobileThemeResponse> {
  const { data } = await api.post("/tenant-mobile-theme/reset", null, {
    params: tenantParams(tenantId),
  });
  return unwrapApi<MobileThemeResponse>(data);
}
