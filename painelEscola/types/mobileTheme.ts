export type MobileThemeColorKey = string;

export type MobileThemeColors = Record<string, string>;

export type MobileThemeSchemaField = {
  label: string;
  description: string;
  group: string;
};

export type MobileThemeTemplate = {
  id: string;
  name: string;
  description: string;
  preview: string[];
  colors: MobileThemeColors;
};

export type MobileThemeResponse = {
  tenant_id: number;
  logo_url: string | null;
  template_id: string;
  templates: MobileThemeTemplate[];
  schema: Record<string, MobileThemeSchemaField>;
  defaults: MobileThemeColors;
  template_colors: MobileThemeColors;
  colors: MobileThemeColors;
  color_overrides: Partial<MobileThemeColors>;
  persisted_colors?: Partial<MobileThemeColors>;
};
