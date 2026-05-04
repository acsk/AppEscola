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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../context/AuthContext';
import { ApiError } from '../../../services/auth.service';
import { AxiosError } from 'axios';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [login, setLogin]               = useState('');
  const [senha, setSenha]               = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [carregando, setCarregando]     = useState(false);
  const [erro, setErro]                 = useState<string | null>(null);

  // Detecta o tipo de credencial para ajustar o teclado
  const isEmail = login.includes('@');

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
          `Não foi possível alcançar o servidor (${process.env.EXPO_PUBLIC_API_URL ?? 'URL não configurada'}). ` +
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
      <View style={styles.inner}>
        <Ionicons name="school-outline" size={72} color="#4F46E5" style={styles.logo} />

        <Text style={styles.titulo}>App Escola</Text>
        <Text style={styles.subtitulo}>Faça login para continuar</Text>

        {/* Campo único: e-mail (admin/professor) ou matrícula (aluno) */}
        <View style={styles.campo}>
          <Ionicons
            name={isEmail ? 'mail-outline' : 'card-outline'}
            size={20}
            color="#6B7280"
            style={styles.icone}
          />
          <TextInput
            style={styles.input}
            placeholder="E-mail ou número de matrícula"
            placeholderTextColor="#9CA3AF"
            keyboardType={isEmail ? 'email-address' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            value={login}
            onChangeText={(v) => { setLogin(v); setErro(null); }}
          />
        </View>

        <View style={styles.campo}>
          <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.icone} />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!senhaVisivel}
            value={senha}
            onChangeText={(v) => { setSenha(v); setErro(null); }}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setSenhaVisivel(!senhaVisivel)}>
            <Ionicons
              name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.dica}>
          {isEmail
            ? 'Acesso para administradores e professores'
            : login.length > 0
            ? 'Acesso para alunos (matrícula)'
            : 'Use e-mail para admin/professor ou matrícula para aluno'}
        </Text>

        {erro ? (
          <View style={styles.erroContainer}>
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.botao, carregando && styles.botaoDesabilitado]}
          onPress={handleLogin}
          disabled={carregando}
          activeOpacity={0.8}
        >
          {carregando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botaoTexto}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logo: { alignSelf: 'center', marginBottom: 16 },
  titulo: { fontSize: 28, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 4 },
  subtitulo: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 40 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  icone: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  dica: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: -8,
  },
  botao: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  botaoDesabilitado: { opacity: 0.6 },
  botaoTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
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
  erroTexto: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },
});

