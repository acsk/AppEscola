import React, { useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../context/AuthContext';
import { ApiError } from '../../../services/auth.service';
import { BASE_URL } from '../../../services/api';
import { AxiosError } from 'axios';
import { colors } from '../../../theme';

export function LoginScreen() {
  const { signIn } = useAuth();
  const { width } = useWindowDimensions();
  const [login, setLogin]               = useState('');
  const [senha, setSenha]               = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando]     = useState(false);
  const [erro, setErro]                 = useState<string | null>(null);

  // Detecta o tipo de credencial para ajustar o teclado
  const isEmail = login.includes('@');
  const isWide = width >= 768;

  async function handleLogin() {
    setErro(null);
    if (!login.trim() || !senha.trim()) {
      setErro('Preencha o login e a senha.');
      return;
    }

    try {
      setCarregando(true);
      await signIn(login.trim(), senha);
    } catch (err) {
      const axiosErr = err as AxiosError<ApiError>;
      const status   = axiosErr.response?.status;

      if (status === 422) {
        const msgs = axiosErr.response?.data?.errors?.login;
        setErro(msgs?.[0] ?? 'Login ou senha inválidos. Verifique seus dados.');
      } else if (status === 403) {
        setErro(axiosErr.response?.data?.message ?? 'Usuário inativo. Contate o administrador.');
      } else if (axiosErr.code === 'ECONNREFUSED' || axiosErr.code === 'ERR_NETWORK' || !axiosErr.response) {
        setErro(
          `Não foi possível alcançar o servidor (${BASE_URL || 'URL não configurada'}). ` +
          `Verifique se o backend está rodando.`,
        );
      } else {
        setErro(`Erro inesperado (código ${status ?? 'desconhecido'}). Tente novamente.`);
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.inner, isWide && styles.innerWide]}>
          <View style={[styles.hero, isWide && styles.heroWide]}>
            <View style={styles.heroAccent} />
            <View style={styles.logoBadge}>
              <Ionicons name="school" size={38} color={colors.surface} />
            </View>
            <Text style={styles.heroTitle}>App Curso</Text>
            <Text style={styles.heroText}>
              Acesse sua rotina escolar com uma experiência mais simples, clara e segura.
            </Text>

            <View style={styles.heroStats}>
              <View style={styles.statItem}>
                <Ionicons name="people-outline" size={18} color={colors.surface} />
                <Text style={styles.statText}>Alunos</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Ionicons name="albums-outline" size={18} color={colors.surface} />
                <Text style={styles.statText}>Professores</Text>
              </View>
            </View>
          </View>

          <View style={[styles.formPanel, isWide && styles.formPanelWide]}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}>
                <Ionicons name="log-in-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.formTitleGroup}>
                <Text style={styles.titulo}>Entrar na conta</Text>
                <Text style={styles.subtitulo}>Informe seus dados para continuar</Text>
              </View>
            </View>

            {/* Campo único: e-mail (admin/professor) ou matrícula (aluno) */}
            <View style={styles.campo}>
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
                onChangeText={(v) => { setLogin(v); setErro(null); }}
              />
            </View>

            <View style={styles.campo}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.muted} style={styles.icone} />
              <TextInput
                style={styles.input}
                placeholder="Senha"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!senhaVisivel}
                value={senha}
                onChangeText={(v) => { setSenha(v); setErro(null); }}
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

            <View style={styles.dicaContainer}>
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
                <Ionicons name="alert-circle-outline" size={16} color="#DC2626" style={styles.erroIcone} />
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.botao, carregando && styles.botaoDesabilitado]}
              onPress={handleLogin}
              disabled={carregando}
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
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
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
    minHeight: 250,
    borderRadius: 28,
    backgroundColor: colors.ink,
    padding: 24,
    marginBottom: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
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
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: colors.surface,
    marginBottom: 10,
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#C7D2FE',
    maxWidth: 430,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  statItem: { flexDirection: 'row', alignItems: 'center' },
  statText: { color: colors.surface, fontSize: 13, fontWeight: '700', marginLeft: 7 },
  statDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginHorizontal: 14,
  },
  formPanel: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 5,
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
  formIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.soft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  formTitleGroup: { flex: 1 },
  titulo: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: 4 },
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
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 3,
  },
  botaoDesabilitado: { opacity: 0.6 },
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
});
