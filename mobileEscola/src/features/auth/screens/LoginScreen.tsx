import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../../context/AuthContext';
import { ApiError } from '../../../services/auth.service';
import { storage } from '../../../services/storage';
import {
  compareBuildVersions,
  compareVersions,
  fetchMetaInfo,
  fetchMobileVersion,
  formatBuildDateTime,
  formatDateToPtBr,
  testApiConnection,
  type MetaInfo,
} from '../../../services/version.service';
import { AxiosError } from 'axios';
import { Button, Icon, Notice, TextField, Txt, font, radius, shadow, space, usePalette } from '../../../ui';
import { AuthStackParamList } from '../../../navigation/AuthNavigator';
import buildInfo from '../../../../buildInfo.json';
import appJson from '../../../../app.json';

const APP_BUILD_VERSION = String((buildInfo as any)?.version ?? '-');
const APP_BUILD_DATE = String((buildInfo as any)?.buildDate ?? '');
const APP_VERSION = String((appJson as any)?.expo?.version ?? '1.0.0');

const STORAGE_API_VERSION_KEY = 'api_version_seen';
const STORAGE_MOBILE_RELOAD_ATTEMPT_KEY = 'mobile_reload_attempt_version';

type ChecklistStepKey = 'internet' | 'apiUpdated' | 'appUpdated' | 'loginAuthorized';

const CHECKLIST_STEPS: { key: ChecklistStepKey; label: string }[] = [
  { key: 'internet', label: 'Conexão com a internet' },
  { key: 'apiUpdated', label: 'API atualizada' },
  { key: 'appUpdated', label: 'App atualizado' },
  { key: 'loginAuthorized', label: 'Login autorizado' },
];

export function LoginScreen() {
  const { signIn } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { width, height } = useWindowDimensions();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Meta da API / versão do app
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [apiVersion, setApiVersion] = useState<string>('-');
  const [contractVersion, setContractVersion] = useState<string>('-');
  const [minSupportedVersion, setMinSupportedVersion] = useState<string>('');
  const [recommendedVersion, setRecommendedVersion] = useState<string>('');
  const [mustUpdate, setMustUpdate] = useState(false);
  const [shouldRecommendUpdate, setShouldRecommendUpdate] = useState(false);
  const [remoteBuildVersion, setRemoteBuildVersion] = useState<string>('');
  const [remoteBuildDate, setRemoteBuildDate] = useState<string>('');

  // Checklist de login (um passo visível por vez)
  const [loginChecklistVisible, setLoginChecklistVisible] = useState(false);
  const [loginChecklistStep, setLoginChecklistStep] = useState<ChecklistStepKey | null>(null);

  // Modal de confirmação de reload
  const [reloadConfirmationVisible, setReloadConfirmationVisible] = useState(false);
  const [reloadConfirmationMessage, setReloadConfirmationMessage] = useState<string>('');

  const isEmail = login.includes('@');

  function showChecklistStep(step: ChecklistStepKey) {
    setLoginChecklistStep(step);
    setLoginChecklistVisible(true);
  }

  function hideChecklist() {
    setLoginChecklistVisible(false);
    setLoginChecklistStep(null);
  }

  function failLogin(message: string) {
    hideChecklist();
    setErro(message);
  }

  async function loadMeta() {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const meta = await fetchMetaInfo();
      applyMetaInfo(meta);
    } catch (err: any) {
      setMetaError('Não foi possível obter informações da API.');
    } finally {
      setMetaLoading(false);
    }

    // Versão do app no servidor
    try {
      const remote = await fetchMobileVersion();
      if (remote) {
        setRemoteBuildVersion(remote.version);
        setRemoteBuildDate(remote.release_date);
      }
    } catch {
      /* opcional */
    }
  }

  function applyMetaInfo(meta: MetaInfo) {
    setApiVersion(meta.apiVersion || '-');
    setContractVersion(meta.contractVersion || '-');
    setMinSupportedVersion(meta.minSupportedVersion || '');
    setRecommendedVersion(meta.recommendedVersion || '');

    if (meta.minSupportedVersion) {
      setMustUpdate(compareVersions(APP_VERSION, meta.minSupportedVersion) < 0);
    } else {
      setMustUpdate(false);
    }

    if (meta.recommendedVersion) {
      setShouldRecommendUpdate(compareVersions(APP_VERSION, meta.recommendedVersion) < 0);
    } else {
      setShouldRecommendUpdate(false);
    }
  }

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function maybePromptReloadForApi(currentApiVersion: string): Promise<boolean> {
    if (!currentApiVersion || currentApiVersion === '-') return false;
    try {
      const previous = await storage.getItem(STORAGE_API_VERSION_KEY);
      if (previous && previous !== currentApiVersion) {
        if (Platform.OS === 'web') {
          setReloadConfirmationMessage(
            `A API foi atualizada (${previous} → ${currentApiVersion}). Recarregue a página para garantir compatibilidade.`,
          );
          setReloadConfirmationVisible(true);
          await storage.setItem(STORAGE_API_VERSION_KEY, currentApiVersion);
          return true;
        }
      }
      await storage.setItem(STORAGE_API_VERSION_KEY, currentApiVersion);
    } catch {
      /* ignore */
    }
    return false;
  }

  async function maybePromptReloadForApp(): Promise<boolean> {
    try {
      const remote = await fetchMobileVersion();
      if (!remote) return false;
      setRemoteBuildVersion(remote.version);
      setRemoteBuildDate(remote.release_date);

      if (compareBuildVersions(remote.version, APP_BUILD_VERSION) > 0) {
        const lastAttempt = await storage.getItem(STORAGE_MOBILE_RELOAD_ATTEMPT_KEY);
        if (lastAttempt !== remote.version && Platform.OS === 'web') {
          setReloadConfirmationMessage(
            `Existe uma nova versão do app (${remote.version}). Recarregue para atualizar.`,
          );
          setReloadConfirmationVisible(true);
          await storage.setItem(STORAGE_MOBILE_RELOAD_ATTEMPT_KEY, remote.version);
          return true;
        }
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function confirmReloadAndRefresh() {
    setReloadConfirmationVisible(false);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    }
  }

  function closeReloadConfirmation() {
    setReloadConfirmationVisible(false);
  }

  async function handleLogin() {
    setErro(null);

    // Etapa 1: internet/API
    showChecklistStep('internet');
    const apiOnline = await testApiConnection();
    if (!apiOnline) {
      failLogin('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
      return;
    }

    // Etapa 2: API atualizada
    showChecklistStep('apiUpdated');
    let meta: MetaInfo | null = null;
    try {
      meta = await fetchMetaInfo();
      applyMetaInfo(meta);
    } catch {
      failLogin('Não foi possível validar a API. Tente novamente em instantes.');
      return;
    }
    const promptedApi = await maybePromptReloadForApi(meta.apiVersion);
    if (promptedApi) {
      hideChecklist();
      return;
    }

    // Etapa 3: App atualizado
    showChecklistStep('appUpdated');
    const promptedApp = await maybePromptReloadForApp();
    if (promptedApp) {
      hideChecklist();
      return;
    }
    if (mustUpdate || (meta?.minSupportedVersion && compareVersions(APP_VERSION, meta.minSupportedVersion) < 0)) {
      failLogin(
        `Esta versão do app (${APP_VERSION}) não é mais suportada. Atualize para continuar.`,
      );
      return;
    }

    // Etapa 4: validar campos e autenticar
    if (!login.trim() || !senha.trim()) {
      failLogin('Preencha o login e a senha.');
      return;
    }

    showChecklistStep('loginAuthorized');
    try {
      setCarregando(true);
      await signIn(login.trim(), senha);
      hideChecklist();
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const status = axiosErr.response?.status;

      let message: string;
      if (status === 422) {
        const msgs = axiosErr.response?.data?.errors?.login;
        message = msgs?.[0] ?? 'Login ou senha inválidos. Verifique seus dados.';
      } else if (status === 403) {
        message =
          axiosErr.response?.data?.message ?? 'Usuário inativo. Contate o administrador.';
      } else if (
        axiosErr.code === 'ECONNREFUSED' ||
        axiosErr.code === 'ERR_NETWORK' ||
        !axiosErr.response
      ) {
        message = 'Não foi possível conectar ao servidor. Tente novamente.';
      } else {
        message = 'Não foi possível entrar. Tente novamente.';
      }
      failLogin(message);
    } finally {
      setCarregando(false);
    }
  }

  const activeChecklistLabel =
    CHECKLIST_STEPS.find((step) => step.key === loginChecklistStep)?.label ?? 'Validando acesso';

  const desktop = width >= 1024;
  const disabled = carregando || mustUpdate;

  // Painel de marca (protótipos "TelaLogin" / "DesktopLogin"): faixa nav-bg no celular, coluna inteira no desktop.
  const brandPanel = (
    <View style={{
      backgroundColor: p.navBg, overflow: 'hidden', gap: space[4],
      paddingTop: desktop ? 48 : insets.top + space[6], paddingHorizontal: desktop ? 56 : space[5], paddingBottom: desktop ? 48 : 64,
      ...(desktop ? { flex: 46, minHeight: '100%' as const } : {}),
    }}>
      <Text style={{ ...font.extrabold, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: p.navInk }}>
        App<Text style={{ ...font.medium, color: p.navInkMuted }}> Curso</Text>
      </Text>
      {desktop ? <View style={{ flex: 1 }} /> : null}
      {desktop ? <AnswerSheetArt color={p.navAccent} line={p.navLine} /> : null}
      <Text accessibilityRole="header" style={{
        ...font.extrabold, color: p.navInk, letterSpacing: desktop ? -0.88 : -0.6, maxWidth: 520, marginTop: desktop ? 0 : space[6],
        fontSize: desktop ? 44 : 30, lineHeight: desktop ? 48 : 34,
      }}>Estude no seu ritmo.</Text>
      <Text style={{ ...font.regular, color: p.navInkMuted, maxWidth: 440, fontSize: desktop ? 17 : 15, lineHeight: desktop ? 26 : 22 }}>
        Simulados, banco de questões e o seu desempenho, tudo num lugar só.
      </Text>
      {desktop ? (
        <View style={{ gap: 12, marginTop: space[6] }}>
          {['Simulados com correção na hora', 'Questões novas toda semana', 'Veja o que estudar em cada matéria'].map((t) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="check" size={20} strokeWidth={2.5} color={p.navAccent} />
              <Text style={{ ...font.semibold, fontSize: 16, color: p.navInk }}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {desktop ? <View style={{ flex: 1 }} /> : null}
      {desktop ? <Text style={{ ...font.medium, fontSize: 12, color: p.navInkMuted }}>© {new Date().getFullYear()} App Curso</Text> : null}
    </View>
  );

  const form = (
    <View style={{
      width: '100%', maxWidth: desktop ? 400 : 420, alignSelf: 'center', gap: desktop ? 20 : 18,
      ...(desktop ? {} : { backgroundColor: p.surface, borderRadius: radius.xl, paddingVertical: space[6], paddingHorizontal: space[5], ...shadow.card, shadowOpacity: 0.1, shadowRadius: 32, shadowOffset: { width: 0, height: 8 }, elevation: 4 }),
    }}>
      <View style={{ gap: 6 }}>
        <Text style={{ ...font.extrabold, fontSize: desktop ? 32 : 26, lineHeight: desktop ? 38 : 32, letterSpacing: -0.52, color: p.ink }}>Entrar</Text>
        <Txt tone="muted">Use a sua matrícula ou o e-mail cadastrado na escola.</Txt>
      </View>

      {metaError ? <Notice tone="warning" icon="warning" title={metaError} /> : null}
      {mustUpdate ? (
        <Notice tone="danger" title="Atualização obrigatória"
          text={`A versão atual do app (${APP_VERSION}) não é mais suportada.${minSupportedVersion ? ` Mínima: ${minSupportedVersion}.` : ''}`} />
      ) : shouldRecommendUpdate ? (
        <Notice tone="info" title={`Atualização recomendada${recommendedVersion ? ` para a versão ${recommendedVersion}` : ''}.`} />
      ) : null}

      {erro ? (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: p.dangerSoft }}>
          <Icon name="alert" size={20} color={p.dangerInk} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...font.semibold, fontSize: 14, lineHeight: 20, color: p.dangerInk }}>{erro}</Text>
            <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20, ...font.medium }}>Confira os dados e tente de novo.</Txt>
          </View>
        </View>
      ) : null}

      <TextField label="Matrícula ou e-mail" placeholder="Ex.: 202600001" value={login} autoComplete="username"
        keyboardType={isEmail ? 'email-address' : 'default'} returnKeyType="next"
        hint={isEmail ? 'Acesso de professores e administração' : 'Alunos entram com a matrícula'}
        onChangeText={(v) => { setLogin(v); setErro(null); }} />
      <TextField label="Senha" placeholder="Sua senha" password value={senha} autoComplete="current-password" returnKeyType="go"
        onSubmitEditing={() => { if (!disabled) void handleLogin(); }}
        onChangeText={(v) => { setSenha(v); setErro(null); }} />

      <Button block size="lg" iconRight="arrow-right" label="Entrar" loading={carregando} disabled={disabled} onPress={() => void handleLogin()} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
        <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>Primeiro acesso?</Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: p.line }} />
      </View>
      <Button block variant="secondary" icon="key" label="Fazer meu cadastro" onPress={() => navigation.navigate('PublicRegister')} />

      <Txt variant="caption" tone="subtle" style={{ textAlign: 'center', ...font.medium }}>
        {metaLoading ? 'Carregando informações da API…'
          : `API ${apiVersion} · App ${APP_VERSION} · Build ${APP_BUILD_VERSION}${APP_BUILD_DATE ? ` (${formatBuildDateTime(APP_BUILD_DATE)})` : ''}${remoteBuildVersion ? ` · Servidor ${remoteBuildVersion}${remoteBuildDate ? ` (${formatDateToPtBr(remoteBuildDate)})` : ''}` : ''}`}
      </Txt>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: p.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        {desktop ? (
          <View style={{ flex: 1, flexDirection: 'row', minHeight: height }}>
            {brandPanel}
            <View style={{ flex: 54, alignItems: 'center', justifyContent: 'center', padding: 48 }}>{form}</View>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {brandPanel}
            <View style={{ marginTop: -32, paddingHorizontal: space[4], paddingBottom: space[8] + insets.bottom }}>{form}</View>
          </View>
        )}
      </ScrollView>

      {/* Um passo por vez enquanto valida conexão, versão e login */}
      <Modal visible={loginChecklistVisible} transparent animationType="fade" onRequestClose={hideChecklist}>
        <View style={{ flex: 1, backgroundColor: p.scrim, alignItems: 'center', justifyContent: 'center', padding: space[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: p.surface, borderRadius: radius.lg, paddingVertical: space[4], paddingHorizontal: space[5], ...shadow.sheet }}>
            <ActivityIndicator size="small" color={p.brand} />
            <Txt variant="label">{activeChecklistLabel}</Txt>
          </View>
        </View>
      </Modal>

      <Modal visible={reloadConfirmationVisible} transparent animationType="fade" onRequestClose={closeReloadConfirmation}>
        <View style={{ flex: 1, backgroundColor: p.scrim, alignItems: 'center', justifyContent: 'center', padding: space[6] }}>
          <View style={{ width: '100%', maxWidth: 400, gap: space[3], backgroundColor: p.surface, borderRadius: radius.lg, padding: space[5], ...shadow.sheet }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Icon name="refresh" size={22} color={p.brandInk} />
              <Txt variant="title">Atualização disponível</Txt>
            </View>
            <Txt tone="muted">{reloadConfirmationMessage}</Txt>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space[2], marginTop: space[2] }}>
              <Button variant="secondary" label="Depois" onPress={closeReloadConfirmation} />
              {Platform.OS === 'web' ? <Button label="Recarregar" onPress={confirmReloadAndRefresh} /> : null}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** Padrão de cartão-resposta (bolinhas, algumas marcadas) no painel de marca do desktop. */
function AnswerSheetArt({ color, line }: { color: string; line: string }) {
  const marked = new Set(['0-1', '1-3', '2-0', '3-2', '4-4', '5-1']);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: -40, bottom: 56 }}>
      <Svg width={220} height={240} viewBox="0 0 220 240">
        {Array.from({ length: 6 }, (_, r) => Array.from({ length: 5 }, (_, c) => {
          const on = marked.has(`${r}-${c}`);
          return <Circle key={`${r}-${c}`} cx={20 + c * 40} cy={20 + r * 40} r={12} fill={on ? color : 'none'} stroke={on ? color : line} strokeWidth={1.5} />;
        }))}
      </Svg>
    </View>
  );
}
