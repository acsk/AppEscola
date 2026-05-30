import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { colors } from '../../../theme';
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
  const isWide = width >= 768;
  const isCompactHeight = !isWide && height < 820;
  const isVeryCompactHeight = !isWide && height < 720;

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          isCompactHeight && styles.scrollContentCompact,
        ]}
      >
        <View style={[styles.inner, isWide && styles.innerWide]}>
          <View
            style={[
              styles.hero,
              isCompactHeight && styles.heroCompact,
              isVeryCompactHeight && styles.heroVeryCompact,
              isWide && styles.heroWide,
            ]}
          >
            <View style={styles.heroAccent} />
            <View style={styles.heroHeader}>
              <View style={[styles.logoBadge, isCompactHeight && styles.logoBadgeCompact]}>
                <Ionicons
                  name="school"
                  size={isCompactHeight ? 26 : 30}
                  color={colors.surface}
                />
              </View>
              <Text style={[styles.heroTitle, isCompactHeight && styles.heroTitleCompact]}>
                App Curso
              </Text>
            </View>
            <Text style={[styles.heroText, isCompactHeight && styles.heroTextCompact]}>
              Acesse sua rotina escolar com uma experiência mais simples, clara e segura.
            </Text>
          </View>

          <View
            style={[
              styles.formPanel,
              isCompactHeight && styles.formPanelCompact,
              isWide && styles.formPanelWide,
            ]}
          >
            <View style={[styles.formHeader, isCompactHeight && styles.formHeaderCompact]}>
              <View style={[styles.formIcon, isCompactHeight && styles.formIconCompact]}>
                <Ionicons
                  name="log-in-outline"
                  size={isCompactHeight ? 22 : 24}
                  color={colors.primary}
                />
              </View>
              <View style={styles.formTitleGroup}>
                <Text style={[styles.titulo, isCompactHeight && styles.tituloCompact]}>
                  Entrar na conta
                </Text>
                <Text style={styles.subtitulo}>Informe seus dados para continuar</Text>
              </View>
            </View>

            {/* Banners de status da API/App */}
            {metaError ? (
              <View style={[styles.banner, styles.bannerWarn]}>
                <Ionicons name="warning-outline" size={16} color="#92400E" />
                <Text style={[styles.bannerText, { color: '#92400E' }]}>{metaError}</Text>
              </View>
            ) : null}

            {mustUpdate ? (
              <View style={[styles.banner, styles.bannerError]}>
                <Ionicons name="alert-circle-outline" size={16} color="#991B1B" />
                <Text style={[styles.bannerText, { color: '#991B1B' }]}>
                  Atualização obrigatória: a versão atual do app ({APP_VERSION}) não é mais suportada.
                  {minSupportedVersion ? ` Mínima: ${minSupportedVersion}.` : ''}
                </Text>
              </View>
            ) : shouldRecommendUpdate ? (
              <View style={[styles.banner, styles.bannerInfo]}>
                <Ionicons name="information-circle-outline" size={16} color="#1E40AF" />
                <Text style={[styles.bannerText, { color: '#1E40AF' }]}>
                  Atualização recomendada
                  {recommendedVersion ? ` para a versão ${recommendedVersion}.` : '.'}
                </Text>
              </View>
            ) : null}

            <View style={[styles.campo, isCompactHeight && styles.campoCompact]}>
              <Ionicons
                name={isEmail ? 'mail-outline' : 'card-outline'}
                size={20}
                color={colors.muted}
                style={styles.icone}
              />
              <TextInput
                style={styles.input}
                placeholder="E-mail ou número de matrícula"
                placeholderTextColor="#94A3B8"
                keyboardType={isEmail ? 'email-address' : 'default'}
                autoCapitalize="none"
                autoCorrect={false}
                value={login}
                onChangeText={(v) => {
                  setLogin(v);
                  setErro(null);
                }}
              />
            </View>

            <View style={[styles.campo, isCompactHeight && styles.campoCompact]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.muted}
                style={styles.icone}
              />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!senhaVisivel}
                value={senha}
                onChangeText={(v) => {
                  setSenha(v);
                  setErro(null);
                }}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setSenhaVisivel(!senhaVisivel)}
                style={styles.iconButton}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Ionicons
                  name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.muted}
                />
              </TouchableOpacity>
            </View>

            <View style={[styles.dicaContainer, isCompactHeight && styles.dicaContainerCompact]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.dica}>
                {isEmail
                  ? 'Acesso para administradores e professores'
                  : login.length > 0
                  ? 'Acesso para alunos (matrícula)'
                  : 'Use e-mail para admin/professor ou matrícula para aluno'}
              </Text>
            </View>

            {erro ? (
              <View style={styles.erroContainer}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color="#DC2626"
                  style={styles.erroIcone}
                />
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.botao,
                isCompactHeight && styles.botaoCompact,
                (carregando || mustUpdate) && styles.botaoDesabilitado,
              ]}
              onPress={handleLogin}
              disabled={carregando || mustUpdate}
              activeOpacity={0.85}
            >
              {carregando ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <View style={styles.botaoConteudo}>
                  <Text style={styles.botaoTexto}>Entrar</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.surface} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.botaoCadastro, isCompactHeight && styles.botaoCadastroCompact]}
              onPress={() => navigation.navigate('PublicRegister')}
              activeOpacity={0.85}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.primary} />
              <Text style={styles.botaoCadastroTexto}>Cadastre-se</Text>
            </TouchableOpacity>

            {/* Rodapé do card: versões */}
            <View style={[styles.metaFooter, isCompactHeight && styles.metaFooterCompact]}>
              {metaLoading ? (
                <Text style={styles.metaFooterText}>Carregando informações da API…</Text>
              ) : (
                <>
                  <Text style={styles.metaFooterText}>
                    API {apiVersion} · Contrato {contractVersion}
                  </Text>
                  <Text style={styles.metaFooterText}>
                    App {APP_VERSION} · Build {APP_BUILD_VERSION}
                    {APP_BUILD_DATE ? ` (${formatBuildDateTime(APP_BUILD_DATE)})` : ''}
                  </Text>
                  {remoteBuildVersion ? (
                    <Text style={styles.metaFooterText}>
                      Última build no servidor: {remoteBuildVersion}
                      {remoteBuildDate ? ` · ${formatDateToPtBr(remoteBuildDate)}` : ''}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>

          <View style={[styles.versionFooter, isCompactHeight && styles.versionFooterCompact]}>
            <Text style={styles.versionFooterText}>App {APP_BUILD_VERSION}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal: checklist mínimo (um passo por vez, sem detalhes de debug) */}
      <Modal
        visible={loginChecklistVisible}
        transparent
        animationType="fade"
        onRequestClose={hideChecklist}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.checklistModalCard]}>
            <View style={styles.checklistRow}>
              <View style={styles.checklistIcon}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
              <Text style={styles.checklistLabel}>{activeChecklistLabel}</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Confirmação de reload */}
      <Modal
        visible={reloadConfirmationVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReloadConfirmation}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="refresh-outline" size={22} color={colors.primary} />
              <Text style={styles.modalTitle}>Atualização disponível</Text>
            </View>
            <Text style={styles.modalBody}>{reloadConfirmationMessage}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={closeReloadConfirmation}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonSecondaryText}>Depois</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' ? (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={confirmReloadAndRefresh}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalButtonPrimaryText}>Recarregar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  scrollContentCompact: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  versionFooter: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 6,
  },
  versionFooterCompact: {
    paddingTop: 10,
    paddingBottom: 0,
  },
  versionFooterText: {
    fontSize: 11,
    color: colors.muted,
    opacity: 0.7,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
  },
  innerWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 28,
  },
  hero: {
    minHeight: 170,
    borderRadius: 24,
    backgroundColor: colors.ink,
    padding: 20,
    marginBottom: 14,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  heroCompact: {
    minHeight: 142,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
  },
  heroVeryCompact: {
    minHeight: 122,
    padding: 16,
    marginBottom: 10,
  },
  heroWide: {
    flex: 1,
    marginBottom: 0,
    minHeight: 560,
    padding: 36,
  },
  heroAccent: {
    position: 'absolute',
    width: 360,
    height: 92,
    backgroundColor: colors.primary,
    opacity: 0.26,
    top: 34,
    right: -110,
    transform: [{ rotate: '-18deg' }],
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  logoBadgeCompact: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginRight: 12,
  },
  heroTitle: {
    flex: 1,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.surface,
  },
  heroTitleCompact: {
    fontSize: 27,
    lineHeight: 32,
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#C7D2FE',
    maxWidth: 430,
  },
  heroTextCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  formPanel: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 5,
  },
  formPanelCompact: {
    borderRadius: 22,
    padding: 18,
  },
  formPanelWide: {
    width: 430,
    alignSelf: 'center',
    padding: 28,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  formHeaderCompact: {
    marginBottom: 18,
  },
  formIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.soft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  formIconCompact: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginRight: 12,
  },
  formTitleGroup: { flex: 1 },
  titulo: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: 4 },
  tituloCompact: { fontSize: 22, lineHeight: 27 },
  subtitulo: { fontSize: 14, color: colors.muted, lineHeight: 19 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    minHeight: 56,
    marginBottom: 14,
  },
  campoCompact: {
    minHeight: 52,
    marginBottom: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  icone: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: colors.ink, minHeight: 52 },
  iconButton: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dicaContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.soft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  dicaContainerCompact: {
    paddingVertical: 8,
    marginBottom: 14,
  },
  dica: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text,
    marginLeft: 8,
  },
  botao: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 3,
  },
  botaoCompact: {
    borderRadius: 14,
    paddingVertical: 14,
  },
  botaoDesabilitado: { opacity: 0.6 },
  botaoCadastro: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  botaoCadastroCompact: {
    minHeight: 46,
    borderRadius: 14,
  },
  botaoCadastroTexto: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },
  botaoConteudo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoTexto: { color: colors.surface, fontSize: 16, fontWeight: '700', marginRight: 8 },
  erroContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  erroIcone: { marginRight: 8, marginTop: 1 },
  erroTexto: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },

  // Banners
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    marginLeft: 6,
  },
  bannerInfo: { backgroundColor: '#DBEAFE', borderWidth: 1, borderColor: '#BFDBFE' },
  bannerWarn: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  bannerError: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },

  // Footer com versões dentro do card
  metaFooter: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  metaFooterCompact: {
    marginTop: 12,
    paddingTop: 10,
  },
  metaFooterText: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
    textAlign: 'center',
  },

  // Modais
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    marginLeft: 8,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 96,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  modalButtonPrimaryText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  modalButtonSecondary: {
    backgroundColor: colors.soft,
  },
  modalButtonSecondaryText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  checklistModalCard: {
    paddingVertical: 20,
    paddingHorizontal: 22,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checklistLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
});
