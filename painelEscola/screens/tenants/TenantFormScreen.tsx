import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Check } from "lucide-react-native";
import api from "../../services/api";
import PageHeader from "../../components/ui/PageHeader";
import Button from "../../components/ui/Button";
import FormInput from "../../components/ui/FormInput";
import FormSelect from "../../components/ui/FormSelect";
import Badge from "../../components/ui/Badge";
import Icon from "../../components/ui/Icon";
import ToastBanner from "../../components/ui/ToastBanner";
import { parseApiErrors } from "../../utils/apiErrors";
import {
  maskPhone,
  maskWhatsapp,
  maskCEP,
  maskCNPJ,
  isValidCEP,
  isValidCNPJ,
} from "../../utils/masks";
import { fetchAddressByCEP } from "../../utils/cep";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { prepareImageForUpload } from "../../utils/imageCompression";
import { color } from "../../constants/theme";
import { clearTenantFeature, clearTenantQuota, fetchPlans, fetchTenantFeatures, fetchTenantQuotas, fetchTenantSubscription, fmtBrl, setTenantFeature, setTenantQuota, subscriptionAction, type QuotaResource, type SaasFeature, type SaasPlan } from "../../services/saas";

type Props = {
  navigate: (screen: string, params?: Record<string, any>) => void;
  tenantId: number | null;
};

type Form = {
  corporate_name: string;
  trade_name: string;
  name: string;
  slug: string;
  cnpj: string;
  email: string;
  phone: string;
  whatsapp: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  status: string;
  timezone: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  admin_password_confirmation: string;
};

const EMPTY: Form = {
  corporate_name: "",
  trade_name: "",
  name: "",
  slug: "",
  cnpj: "",
  email: "",
  phone: "",
  whatsapp: "",
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  status: "active",
  timezone: "America/Sao_Paulo",
  admin_name: "",
  admin_email: "",
  admin_password: "",
  admin_password_confirmation: "",
};

const STEPS = [
  { title: "Instituição", hint: "dados e endereço" },
  { title: "Administrador", hint: "acesso inicial" },
  { title: "Plano", hint: "escolha e limites" },
  { title: "Configurações", hint: "subdomínio e fuso" },
  { title: "Confirmação", hint: "resumo" },
];

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (America/Sao_Paulo)" },
  { value: "America/Manaus", label: "Manaus (America/Manaus)" },
  { value: "America/Cuiaba", label: "Cuiabá (America/Cuiaba)" },
  { value: "America/Rio_Branco", label: "Rio Branco (America/Rio_Branco)" },
  { value: "America/Noronha", label: "Fernando de Noronha (America/Noronha)" },
];

const TRIAL_OPTIONS = [
  { value: "0", label: "Sem teste" },
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
];

const slugify = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function TenantFormScreen({ navigate, tenantId }: Props) {
  const { contentPadding, isMobile } = useResponsiveLayout();
  const isEdit = tenantId !== null;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [isLookingUpCEP, setIsLookingUpCEP] = useState(false);
  const [cepLookupMessage, setCepLookupMessage] = useState("");
  const [tenantPhotoUrl, setTenantPhotoUrl] = useState<string | null>(null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingLogoPreview, setPendingLogoPreview] = useState<string | null>(null);
  const [plans, setPlans] = useState<SaasPlan[]>([]);
  const [features, setFeatures] = useState<SaasFeature[]>([]);
  const [resources, setResources] = useState<QuotaResource[]>([]);
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [trialDays, setTrialDays] = useState("14");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [hadSubscription, setHadSubscription] = useState(false);
  const [originalPlanKey, setOriginalPlanKey] = useState("");
  const loadedLimits = useRef<Record<string, string>>({});
  const loadedFeatures = useRef<string[]>([]);
  const [toast, setToast] = useState<{ visible: boolean; type: "success" | "error"; message: string }>({
    visible: false,
    type: "success",
    message: "",
  });
  const logoInputRef = useRef<any>(null);
  const set = (patch: Partial<Form>) => setForm((prev) => ({ ...prev, ...patch }));

  const applyPlan = (plan: SaasPlan, catalog = resources) => {
    setPlanId(String(plan.id));
    setTrialDays(String(plan.trial_days ?? 0));
    setSelectedFeatures(plan.features ?? []);
    setLimits(Object.fromEntries(catalog.map((resource) => [resource.key, plan.limits?.[resource.key] == null ? "" : String(plan.limits[resource.key])])));
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (isEdit) setLoading(true);
      setForbidden(false);
      try {
        const catalog = await fetchPlans();
        if (cancelled) return;
        const active = catalog.plans.filter((plan) => plan.status === "active");
        setPlans(active);
        setFeatures(catalog.features);
        setResources(catalog.resources);
        if (!isEdit || !tenantId) {
          if (active[0]) applyPlan(active[0], catalog.resources);
          return;
        }
        const [tenantResponse, subscriptionBody, featureBody, quotaBody, usersResponse] = await Promise.all([
          api.get(`/tenants/${tenantId}`),
          fetchTenantSubscription(tenantId).catch(() => ({ subscription: null, events: [] })),
          fetchTenantFeatures(tenantId).catch(() => null),
          fetchTenantQuotas(tenantId).catch(() => null),
          api.get("/users", { params: { tenant_id: tenantId, role: "admin", per_page: 1 } }).catch(() => null),
        ]);
        if (cancelled) return;
        const tenant = tenantResponse.data.data ?? tenantResponse.data.body ?? tenantResponse.data;
        const address = tenant.address ?? {};
        const admin = (Array.isArray(usersResponse?.data?.data) ? usersResponse.data.data : [])[0];
        setForm((prev) => ({
          ...prev,
          corporate_name: tenant.corporate_name ?? "",
          trade_name: tenant.trade_name ?? "",
          name: tenant.name ?? "",
          slug: tenant.slug ?? "",
          cnpj: tenant.cnpj ?? "",
          email: tenant.email ?? "",
          phone: tenant.phone ?? "",
          whatsapp: tenant.whatsapp ?? "",
          zip_code: address.zip_code ?? "",
          street: address.street ?? "",
          number: address.number ?? "",
          complement: address.complement ?? "",
          neighborhood: address.neighborhood ?? "",
          city: address.city ?? "",
          state: address.state ?? "",
          status: tenant.status ?? "active",
          timezone: tenant.settings?.timezone ?? "America/Sao_Paulo",
          admin_name: admin?.name ?? "",
          admin_email: admin?.email ?? "",
        }));
        setTenantPhotoUrl(tenant.photo_url ?? null);
        const subscription = subscriptionBody.subscription;
        const currentPlan = catalog.plans.find((plan) => plan.id === subscription?.plan?.id) ?? null;
        if (currentPlan && currentPlan.status !== "active") setPlans([currentPlan, ...active]);
        if (subscription && currentPlan) {
          setHadSubscription(true);
          setPlanId(String(currentPlan.id));
          setCycle(subscription.billing_cycle);
          setOriginalPlanKey(`${currentPlan.id}:${subscription.billing_cycle}`);
          setTrialDays(subscription.trial_ends_at ? String(currentPlan.trial_days || 14) : "0");
        }
        const quotaLimits = Object.fromEntries((quotaBody?.items ?? []).map((item) => [item.resource, item.limit == null ? "" : String(item.limit)]));
        const nextLimits = Object.fromEntries(catalog.resources.map((resource) => [resource.key, quotaLimits[resource.key] ?? (currentPlan?.limits?.[resource.key] == null ? "" : String(currentPlan?.limits?.[resource.key]))]));
        const nextFeatures = featureBody?.features?.length
          ? featureBody.features.filter((feature) => feature.enabled).map((feature) => feature.key)
          : (currentPlan?.features ?? []);
        loadedLimits.current = nextLimits;
        loadedFeatures.current = nextFeatures;
        setLimits(nextLimits);
        setSelectedFeatures(nextFeatures);
      } catch (error: any) {
        if (error.response?.status === 403) setForbidden(true);
        else setToast({ visible: true, type: "error", message: "Não foi possível carregar a instituição." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isEdit, tenantId]);

  const selectedPlan = plans.find((plan) => String(plan.id) === planId) ?? null;

  const uploadTenantLogo = useCallback(async (targetTenantId: number, file: File) => {
    setUploadingLogo(true);
    try {
      const compressed = await prepareImageForUpload(file, 100);
      const formData = new FormData();
      formData.append("photo", compressed);
      const { data } = await api.post(`/tenants/${targetTenantId}/upload-photo`, formData);
      const body = data?.body ?? data?.data ?? data;
      setTenantPhotoUrl(body?.photo_url ?? null);
      setPendingLogoFile(null);
      setPendingLogoPreview(null);
      return true;
    } catch (error: any) {
      const apiErrs = parseApiErrors(error?.response?.data?.errors ?? error?.response?.data?.body?.errors ?? {});
      setErrors((prev) => ({ ...prev, photo: apiErrs.photo || prev.photo }));
      setToast({ visible: true, type: "error", message: error?.response?.data?.message || "Não foi possível enviar a logo." });
      return false;
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }, []);

  const handleLogoSelect = useCallback(async (event: any) => {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => setPendingLogoPreview(loadEvent.target?.result as string);
    reader.readAsDataURL(file);
    if (isEdit && tenantId) await uploadTenantLogo(tenantId, file);
    else setPendingLogoFile(file);
  }, [isEdit, tenantId, uploadTenantLogo]);

  const buildTenantPayload = () => {
    const payload: Record<string, any> = {
      corporate_name: form.corporate_name.trim(),
      name: form.name.trim(),
      slug: form.slug.trim(),
      status: form.status || "active",
    };
    (["trade_name", "cnpj", "email", "phone", "whatsapp", "zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).forEach((key) => {
      if (form[key]?.trim()) payload[key] = form[key].trim();
    });
    if (form.timezone.trim()) payload.settings = { timezone: form.timezone.trim() };
    return payload;
  };

  const handleCEPBlur = async () => {
    if (!form.zip_code) return;
    if (!isValidCEP(form.zip_code)) {
      setCepLookupMessage("CEP inválido. Digite um CEP com 8 números.");
      return;
    }
    setIsLookingUpCEP(true);
    setCepLookupMessage("");
    try {
      const address = await fetchAddressByCEP(form.zip_code);
      setForm((prev) => ({
        ...prev,
        zip_code: maskCEP(address.cep || prev.zip_code),
        street: address.street || prev.street,
        neighborhood: address.neighborhood || prev.neighborhood,
        city: address.city || prev.city,
        state: (address.state || prev.state).toUpperCase().slice(0, 2),
      }));
      setCepLookupMessage("Endereço localizado por CEP.");
    } catch {
      setCepLookupMessage("Não foi possível localizar o endereço para este CEP.");
    } finally {
      setIsLookingUpCEP(false);
    }
  };

  const collectStepErrors = (index: number) => {
    const next: Record<string, string> = {};
    if (index === 0) {
      if (!form.corporate_name.trim()) next.corporate_name = "Informe a razão social.";
      if (!form.name.trim()) next.name = "Informe o nome de exibição.";
      if (form.cnpj.trim() && !isValidCNPJ(form.cnpj)) next.cnpj = "CNPJ inválido.";
    }
    if (index === 1 && !isEdit) {
      if (!form.admin_name.trim()) next.admin_name = "Informe o nome do administrador.";
      if (!form.admin_email.trim()) next.admin_email = "Informe o e-mail do administrador.";
      if (form.admin_password.length < 6) next.admin_password = "A senha precisa ter ao menos 6 caracteres.";
      if (form.admin_password !== form.admin_password_confirmation) next.admin_password_confirmation = "A confirmação não confere.";
    }
    if (index === 1 && isEdit && (form.admin_password || form.admin_password_confirmation)) {
      if (form.admin_password.length < 6) next.admin_password = "A senha precisa ter ao menos 6 caracteres.";
      if (form.admin_password !== form.admin_password_confirmation) next.admin_password_confirmation = "A confirmação não confere.";
    }
    if (index === 3 && !/^[a-z0-9-]+$/.test(form.slug.trim())) next.slug = "Use letras minúsculas, números e hífen.";
    return next;
  };

  const validateStep = (index: number) => {
    const next = collectStepErrors(index);
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const continueStep = () => {
    if (!validateStep(step)) return;
    if (step === 0 && !form.slug.trim()) set({ slug: slugify(form.name) });
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const saveEdit = async () => {
    if (!tenantId) return;
    const pending = { ...collectStepErrors(0), ...collectStepErrors(1), ...collectStepErrors(3) };
    setErrors(pending);
    if (Object.keys(pending).length) {
      if (pending.admin_password || pending.admin_password_confirmation) setStep(1);
      else if (pending.slug) setStep(3);
      else setStep(0);
      return;
    }
    setSaving(true);
    try {
      const payload = buildTenantPayload();
      if (form.admin_password) {
        payload.admin_password = form.admin_password;
        payload.admin_password_confirmation = form.admin_password_confirmation;
        payload.admin_password_change_required = true;
      }
      await api.put(`/tenants/${tenantId}`, payload);
      if (pendingLogoFile) await uploadTenantLogo(tenantId, pendingLogoFile);
      if (selectedPlan) {
        const nextKey = `${selectedPlan.id}:${cycle}`;
        if (!hadSubscription) {
          await subscriptionAction(tenantId, "", { saas_plan_id: selectedPlan.id, billing_cycle: cycle, trial_days: Number(trialDays || 0) });
        } else if (nextKey !== originalPlanKey) {
          await subscriptionAction(tenantId, "change-plan", { saas_plan_id: selectedPlan.id, billing_cycle: cycle });
        }
        await applyNegotiatedTerms(tenantId, selectedPlan);
      }
      navigate("tenants-detail", { tenantId, tab: "subscription" });
    } catch (error: any) {
      if (error.response?.status === 422) setErrors(parseApiErrors(error.response.data?.errors ?? error.response.data?.body?.errors ?? {}));
      else if (error.response?.status === 403) setForbidden(true);
      setToast({ visible: true, type: "error", message: error?.response?.data?.message || "Não foi possível salvar a instituição." });
    } finally {
      setSaving(false);
    }
  };

  const createInstitution = async () => {
    const pending = { ...collectStepErrors(0), ...collectStepErrors(1), ...collectStepErrors(3) };
    setErrors(pending);
    if (Object.keys(pending).length) {
      if (pending.admin_name || pending.admin_email || pending.admin_password || pending.admin_password_confirmation) setStep(1);
      else if (pending.slug) setStep(3);
      else setStep(0);
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const { data } = await api.post("/tenants", {
        ...buildTenantPayload(),
        admin_name: form.admin_name.trim(),
        admin_email: form.admin_email.trim(),
        admin_password: form.admin_password,
        admin_password_confirmation: form.admin_password_confirmation,
      });
      const created = data?.data ?? data?.body ?? data;
      const createdId = Number(created?.id);
      if (!createdId) throw new Error("Instituição criada sem identificador.");
      if (pendingLogoFile) await uploadTenantLogo(createdId, pendingLogoFile);
      if (selectedPlan) {
        await subscriptionAction(createdId, "", {
          saas_plan_id: selectedPlan.id,
          billing_cycle: cycle,
          trial_days: Number(trialDays || 0),
        });
        await applyNegotiatedTerms(createdId, selectedPlan);
      }
      navigate("tenants-detail", { tenantId: createdId, tab: "subscription" });
    } catch (error: any) {
      if (error.response?.status === 422) {
        const parsed = parseApiErrors(error.response.data?.errors ?? error.response.data?.body?.errors ?? {});
        setErrors(parsed);
        if (parsed.admin_name || parsed.admin_email || parsed.admin_password) setStep(1);
        else if (parsed.slug) setStep(3);
        else setStep(0);
      } else if (error.response?.status === 403) {
        setForbidden(true);
      }
      setToast({ visible: true, type: "error", message: error?.response?.data?.message || "Não foi possível concluir o cadastro." });
    } finally {
      setSaving(false);
    }
  };

  const applyNegotiatedTerms = async (createdId: number, plan: SaasPlan) => {
    const jobs: Promise<unknown>[] = [];
    resources.forEach((resource) => {
      const typed = limits[resource.key] ?? "";
      const wanted = typed === "" ? null : Number(typed);
      const original = plan.limits?.[resource.key] ?? null;
      const changed = typed !== (loadedLimits.current[resource.key] ?? "");
      if (wanted !== original) jobs.push(setTenantQuota(createdId, resource.key, wanted, "Negociado no cadastro da instituição"));
      else if (isEdit && changed) jobs.push(clearTenantQuota(createdId, resource.key));
    });
    const planFeatures = new Set(plan.features ?? []);
    features.forEach((feature) => {
      const wanted = selectedFeatures.includes(feature.key);
      const was = loadedFeatures.current.includes(feature.key);
      if (wanted === planFeatures.has(feature.key)) {
        if (isEdit && wanted !== was) jobs.push(clearTenantFeature(createdId, feature.key));
      } else if (!isEdit || wanted !== was) {
        jobs.push(setTenantFeature(createdId, feature.key, wanted, "Negociado no cadastro da instituição"));
      }
    });
    await Promise.all(jobs);
  };

  const planPriceLabel = (plan: SaasPlan) => {
    if (plan.billing_basis === "per_student") return `${fmtBrl(plan.price_monthly)} /aluno`;
    if (cycle === "yearly") return `${fmtBrl(plan.price_yearly ?? Number(plan.price_monthly) * 12)} /ano`;
    return `${fmtBrl(plan.price_monthly)} /mês`;
  };

  const summary = useMemo(() => {
    const institution = [form.name || form.corporate_name || "Ainda não informada", form.cnpj].filter(Boolean).join(" · ");
    const admin = !form.admin_name
      ? "Ainda não informado"
      : isEdit
        ? `${form.admin_name}${form.admin_password ? " · nova senha provisória" : ""}`
        : `${form.admin_name} · senha provisória`;
    const plan = selectedPlan ? `${selectedPlan.name} · ${cycle === "yearly" ? "anual" : "mensal"}` : "Sem plano";
    const trial = trialDays === "0" ? "Sem teste" : `${trialDays} dias`;
    return [
      ["Instituição", institution],
      ["Administrador", admin],
      ["Plano", plan],
      ["Teste", trial],
      ["Subdomínio", form.slug || "—"],
    ];
  }, [form, selectedPlan, cycle, trialDays]);

  const logo = (
    <View className="flex-row items-start" style={{ gap: 16 }}>
      <View className="items-center" style={{ gap: 8 }}>
        <View className="rounded-ds-md overflow-hidden border border-border items-center justify-center" style={{ width: 88, height: 88, backgroundColor: color["brand-tint"] }}>
          {pendingLogoPreview || tenantPhotoUrl ? (
            <Image source={{ uri: (pendingLogoPreview ?? tenantPhotoUrl)! }} style={{ width: 88, height: 88 }} resizeMode="cover" />
          ) : (
            <Text className="text-sm font-semibold text-brand">{(form.name || "IN").slice(0, 2).toUpperCase()}</Text>
          )}
          {uploadingLogo ? <ActivityIndicator style={{ position: "absolute" }} color={color.brand} /> : null}
        </View>
        {Platform.OS === "web" ? (
          <label style={{ cursor: "pointer", fontSize: 12, color: color.brand }}>
            {tenantPhotoUrl || pendingLogoPreview ? "Alterar logo" : "Adicionar logo"}
            <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleLogoSelect} />
          </label>
        ) : null}
      </View>
      <Text className="text-xs text-ink-muted" style={{ flex: 1 }}>Logo opcional. JPG, PNG ou WEBP, até 5 MB.</Text>
    </View>
  );

  const institutionFields = (
    <View style={{ gap: 0 }}>
      {logo}
      <FormInput label="Razão social" required value={form.corporate_name} onChangeText={(value) => set({ corporate_name: value })} error={errors.corporate_name} />
      <FormInput label="Nome fantasia" value={form.trade_name} onChangeText={(value) => set({ trade_name: value })} error={errors.trade_name} />
      <FormInput label="Nome de exibição" required value={form.name} onChangeText={(value) => set({ name: value })} error={errors.name} />
      <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
        <View style={{ flex: 1, minWidth: 180 }}><FormInput label="CNPJ" value={form.cnpj} onChangeText={(value) => set({ cnpj: maskCNPJ(value) })} error={errors.cnpj} /></View>
        <View style={{ flex: 1, minWidth: 180 }}><FormInput label="E-mail" value={form.email} onChangeText={(value) => set({ email: value })} error={errors.email} keyboardType="email-address" autoCapitalize="none" /></View>
      </View>
      <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
        <View style={{ flex: 1, minWidth: 160 }}><FormInput label="Telefone" value={form.phone} onChangeText={(value) => set({ phone: maskPhone(value) })} error={errors.phone} /></View>
        <View style={{ flex: 1, minWidth: 160 }}><FormInput label="WhatsApp" value={form.whatsapp} onChangeText={(value) => set({ whatsapp: maskWhatsapp(value) })} error={errors.whatsapp} /></View>
      </View>
      <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <FormInput label="CEP" value={form.zip_code} onChangeText={(value) => { setCepLookupMessage(""); set({ zip_code: maskCEP(value) }); }} onBlur={handleCEPBlur} error={errors.zip_code} />
          {cepLookupMessage ? <Text className={`text-xs ${cepLookupMessage.includes("localizado") ? "text-success" : "text-warning"}`}>{isLookingUpCEP ? "Buscando CEP..." : cepLookupMessage}</Text> : null}
        </View>
        <View style={{ flex: 2, minWidth: 180 }}><FormInput label="Rua" value={form.street} onChangeText={(value) => set({ street: value })} error={errors.street} /></View>
      </View>
      <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
        <View style={{ width: 100 }}><FormInput label="Número" value={form.number} onChangeText={(value) => set({ number: value })} error={errors.number} /></View>
        <View style={{ flex: 1, minWidth: 140 }}><FormInput label="Complemento" value={form.complement} onChangeText={(value) => set({ complement: value })} error={errors.complement} /></View>
        <View style={{ flex: 1, minWidth: 140 }}><FormInput label="Bairro" value={form.neighborhood} onChangeText={(value) => set({ neighborhood: value })} error={errors.neighborhood} /></View>
      </View>
      <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
        <View style={{ flex: 1, minWidth: 160 }}><FormInput label="Cidade" value={form.city} onChangeText={(value) => set({ city: value })} error={errors.city} /></View>
        <View style={{ width: 80 }}><FormInput label="UF" value={form.state} onChangeText={(value) => set({ state: value.toUpperCase().slice(0, 2) })} error={errors.state} autoCapitalize="characters" maxLength={2} /></View>
      </View>
    </View>
  );

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, gap: 16 }}>
      <PageHeader
        breadcrumb={[{ label: "Instituições", onPress: () => navigate("tenants") }, { label: isEdit ? "Editar" : "Nova instituição" }]}
        title={isEdit ? "Editar instituição" : "Nova instituição"}
        description={isEdit ? "As mesmas 5 etapas do cadastro, já preenchidas com o que a instituição tem hoje." : "Cadastro em 5 etapas. A instituição e o administrador são criados juntos; o plano é contratado em seguida."}
      />

      {forbidden ? <Text className="text-sm text-warning">Acesso permitido apenas para super admin.</Text> : null}

      {loading ? (
        <ActivityIndicator color={color.brand} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ gap: 16 }}>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {STEPS.map((item, index) => {
              const done = index < step;
              const current = index === step;
              return (
                <Pressable key={item.title} onPress={() => (isEdit || index < step) && setStep(index)} className={`flex-row items-center border rounded-ds-md ${current ? "border-brand bg-brand-tint" : "border-border bg-surface"}`} style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8, minWidth: isMobile ? "100%" : 150 }}>
                  <View className={`items-center justify-center rounded-full ${done || current ? "bg-brand" : "bg-surface-sunken"}`} style={{ width: 22, height: 22 }}>
                    {done ? <Icon icon={Check} size={16} color={color["on-brand"]} /> : <Text className={`text-xs ${current ? "text-white" : "text-ink-muted"}`} style={{ color: current ? color["on-brand"] : color["ink-muted"] }}>{index + 1}</Text>}
                  </View>
                  <View>
                    <Text className="text-sm font-medium text-ink">{item.title}</Text>
                    <Text className="text-xs text-ink-subtle">{item.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className={isMobile ? "" : "flex-row"} style={{ gap: 16, alignItems: "flex-start" }}>
            <View style={{ flex: 1, minWidth: 0, gap: 12 }}>
              {step === 0 ? <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20 }}>{institutionFields}</View> : null}

              {step === 1 ? (
                <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20, gap: 4 }}>
                  <Text className="text-sm font-semibold text-ink">{isEdit ? "Administrador" : "Administrador inicial"}</Text>
                  <Text className="text-xs text-ink-muted">{isEdit ? "O nome e o e-mail permanecem. Preencha a senha só se quiser definir uma nova, provisória." : "A senha é provisória. No primeiro acesso o administrador precisa trocá-la."}</Text>
                  <FormInput label="Nome" required={!isEdit} editable={!isEdit} value={form.admin_name} onChangeText={(value) => set({ admin_name: value })} error={errors.admin_name} />
                  <FormInput label="E-mail" required={!isEdit} editable={!isEdit} value={form.admin_email} onChangeText={(value) => set({ admin_email: value })} error={errors.admin_email} keyboardType="email-address" autoCapitalize="none" />
                  <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
                    <View style={{ flex: 1, minWidth: 180 }}><FormInput label={isEdit ? "Nova senha provisória" : "Senha provisória"} required={!isEdit} secureTextEntry value={form.admin_password} onChangeText={(value) => set({ admin_password: value })} error={errors.admin_password} placeholder={isEdit ? "Em branco mantém a atual" : undefined} /></View>
                    <View style={{ flex: 1, minWidth: 180 }}><FormInput label="Confirmar senha" required={!isEdit} secureTextEntry value={form.admin_password_confirmation} onChangeText={(value) => set({ admin_password_confirmation: value })} error={errors.admin_password_confirmation} /></View>
                  </View>
                </View>
              ) : null}

              {step === 2 ? (
                <View style={{ gap: 12 }}>
                  <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20, gap: 12 }}>
                    <View className="flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text className="text-sm font-semibold text-ink">Plano contratado</Text>
                        <Text className="text-xs text-ink-muted">Valores e limites vêm do cadastro de planos.</Text>
                      </View>
                      <View className="flex-row border border-border rounded-ds-md overflow-hidden">
                        {(["monthly", "yearly"] as const).map((value) => (
                          <Pressable key={value} onPress={() => setCycle(value)} className={cycle === value ? "bg-brand" : "bg-surface"} style={{ paddingHorizontal: 12, height: 34, justifyContent: "center" }}>
                            <Text className="text-sm" style={{ color: cycle === value ? color["on-brand"] : color.ink }}>{value === "monthly" ? "Mensal" : "Anual"}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                      {plans.map((plan) => {
                        const on = String(plan.id) === planId;
                        return (
                          <Pressable key={plan.id} onPress={() => applyPlan(plan)} className={`border rounded-ds-md ${on ? "border-brand bg-brand-tint" : "border-border bg-surface"}`} style={{ width: isMobile ? "100%" : "31%", padding: 12, gap: 6 }}>
                            <Text className="text-sm font-semibold text-ink">{plan.name}</Text>
                            <Text className="text-lg font-mono text-ink">{planPriceLabel(plan)}</Text>
                            <Text className="text-xs text-ink-muted">{plan.billing_basis === "per_student" ? "Por aluno com acesso ao app" : "Valor fixo"}</Text>
                            <Text className="text-xs text-ink-subtle">{`${(plan.features ?? []).length} funcionalidades`}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {plans.length === 0 ? <Text className="text-sm text-ink-muted">Nenhum plano ativo.</Text> : null}
                  </View>
                  <View className={isMobile ? "" : "flex-row"} style={{ gap: 12 }}>
                    <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1, padding: 16 }}>
                      <FormSelect label="Período de teste" value={trialDays} onChange={setTrialDays} options={TRIAL_OPTIONS} disabled={isEdit && hadSubscription} />
                      <Text className="text-xs text-ink-muted">{isEdit && hadSubscription ? "O teste já vigente se ajusta na aba Assinatura. Trocar o plano aqui não reinicia os dias." : "Durante o teste a cobrança do mês fica zerada. O uso continua sendo contado."}</Text>
                    </View>
                    <View className="bg-surface border border-border rounded-ds-md" style={{ flex: 1.4, padding: 16, gap: 8 }}>
                      <Text className="text-sm font-semibold text-ink">Limites</Text>
                      <Text className="text-xs text-ink-muted">Padrão do plano. Em branco é ilimitado. Mudança aqui fica registrada como exceção.</Text>
                      <View className="flex-row flex-wrap" style={{ columnGap: 12 }}>
                        {resources.slice(0, 6).map((resource) => (
                          <View key={resource.key} style={{ width: isMobile ? "100%" : "47%" }}>
                            <FormInput label={resource.label} valueFormat="integer" maxDigits={8} value={limits[resource.key] ?? ""} onChangeText={(value) => setLimits((prev) => ({ ...prev, [resource.key]: value }))} placeholder="Ilimitado" dense />
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                  <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 16, gap: 8 }}>
                    <Text className="text-sm font-semibold text-ink">Funcionalidades</Text>
                    <Text className="text-xs text-ink-muted">Vêm marcadas pelo plano. Desmarcar ou marcar outra vira exceção da instituição.</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                      {features.map((feature) => {
                        const checked = selectedFeatures.includes(feature.key);
                        const fromPlan = (selectedPlan?.features ?? []).includes(feature.key);
                        return (
                          <Pressable key={feature.key} onPress={() => setSelectedFeatures((current) => checked ? current.filter((key) => key !== feature.key) : [...current, feature.key])} className={`flex-row items-center border rounded-ds-md ${checked ? "border-brand bg-brand-tint" : "border-border"}`} style={{ paddingHorizontal: 10, height: 36, gap: 8, width: isMobile ? "100%" : "48%" }}>
                            <View className={`items-center justify-center border rounded-ds-sm ${checked ? "bg-brand border-brand" : "border-border-strong"}`} style={{ width: 16, height: 16 }}>
                              {checked ? <Icon icon={Check} size={16} color={color["on-brand"]} /> : null}
                            </View>
                            <Text className="text-sm text-ink" style={{ flex: 1 }} numberOfLines={1}>{feature.name}</Text>
                            <Text className="text-xs text-ink-subtle">{checked === fromPlan ? "plano" : "exceção"}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}

              {step === 3 ? (
                <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20 }}>
                  <Text className="text-sm font-semibold text-ink">Configurações</Text>
                  <FormInput label="Subdomínio" required value={form.slug} onChangeText={(value) => set({ slug: slugify(value) })} error={errors.slug} autoCapitalize="none" placeholder="ex.: conectivo" />
                  <FormSelect label="Fuso horário" value={form.timezone} onChange={(value) => set({ timezone: value })} options={TIMEZONES} />
                  <FormSelect label={isEdit ? "Situação" : "Situação inicial"} value={form.status} onChange={(value) => set({ status: value })} options={[{ value: "active", label: "Ativa" }, { value: "inactive", label: "Inativa" }]} />
                </View>
              ) : null}

              {step === 4 ? (
                <View className="bg-surface border border-border rounded-ds-md" style={{ padding: 20, gap: 8 }}>
                  <Text className="text-sm font-semibold text-ink">{isEdit ? "Confirmar alterações" : "Confirmar criação"}</Text>
                  <Text className="text-sm text-ink-muted">{isEdit ? "Os dados cadastrais, a senha nova (se houver), o plano e as exceções de limite e funcionalidade são salvos agora." : "A instituição e o administrador são gravados na mesma operação. Se o plano falhar depois, a instituição permanece e a assinatura pode ser contratada no detalhe."}</Text>
                  {summary.map(([label, value]) => (
                    <View key={label} className="flex-row justify-between border-b border-border" style={{ paddingVertical: 8, gap: 12 }}>
                      <Text className="text-xs text-ink-muted">{label}</Text>
                      <Text className="text-sm text-ink" style={{ flex: 1, textAlign: "right" }}>{value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View className="flex-row justify-between" style={{ gap: 8 }}>
                <Button label="Voltar" onPress={() => step === 0 ? navigate(isEdit ? "tenants-detail" : "tenants", isEdit ? { tenantId } : undefined) : setStep((current) => current - 1)} disabled={saving} />
                {step < STEPS.length - 1 ? (
                  <Button variant="primary" label={step === 3 ? "Continuar para a confirmação" : "Continuar"} onPress={continueStep} />
                ) : (
                  <Button variant="primary" label={isEdit ? "Salvar instituição" : "Criar instituição"} onPress={isEdit ? saveEdit : createInstitution} loading={saving} />
                )}
              </View>
            </View>

            <View className="bg-surface border border-border rounded-ds-md" style={{ width: isMobile ? "100%" : 300, padding: 16, gap: 10 }}>
              <Text className="text-sm font-semibold text-ink">Resumo</Text>
              {summary.map(([label, value]) => (
                <View key={label} style={{ gap: 2 }}>
                  <Text className="text-xs text-ink-muted">{label}</Text>
                  <Text className="text-sm text-ink">{value}</Text>
                </View>
              ))}
              {selectedPlan ? <Badge label={planPriceLabel(selectedPlan)} tone="brand" /> : null}
            </View>
          </View>
        </View>
      )}

      <ToastBanner visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast((current) => ({ ...current, visible: false }))} />
    </ScrollView>
  );
}
