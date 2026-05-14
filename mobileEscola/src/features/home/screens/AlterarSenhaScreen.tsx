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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../../services/api';
import { colors } from '../../../theme';

export function AlterarSenhaScreen() {
  const navigation = useNavigation<any>();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [atualVisivel, setAtualVisivel] = useState(false);
  const [novaVisivel, setNovaVisivel] = useState(false);
  const [confirmVisivel, setConfirmVisivel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [campoErros, setCampoErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function limparErro(campo: string) {
    setCampoErros((prev) => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
    setErroGeral(null);
    setSucesso(false);
  }

  async function handleAlterarSenha() {
    const errosLocais: Record<string, string> = {};
    if (!senhaAtual) errosLocais.current_password = 'Informe a senha atual.';
    if (!novaSenha) errosLocais.password = 'Informe a nova senha.';
    else if (novaSenha.length < 8) errosLocais.password = 'Mínimo de 8 caracteres.';
    if (!confirmacao) errosLocais.password_confirmation = 'Confirme a nova senha.';
    else if (novaSenha && novaSenha !== confirmacao) errosLocais.password_confirmation = 'As senhas não conferem.';

    if (Object.keys(errosLocais).length) {
      setCampoErros(errosLocais);
      setErroGeral(null);
      return;
    }

    setCampoErros({});
    setErroGeral(null);

    try {
      setSalvando(true);
      await api.put('/api/me/password', {
        current_password: senhaAtual,
        password: novaSenha,
        password_confirmation: confirmacao,
      });
      setSucesso(true);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmacao('');
    } catch (error: any) {
      const apiErros: Record<string, string[]> | undefined = error?.response?.data?.errors;
      if (apiErros) {
        const mapeados: Record<string, string> = {};
        Object.entries(apiErros).forEach(([campo, msgs]) => {
          mapeados[campo] = msgs[0];
        });
        setCampoErros(mapeados);
      } else {
        setErroGeral(error?.response?.data?.message ?? 'Não foi possível alterar a senha.');
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerCard}>
          <View style={styles.headerGlowPrimary} />
          <View style={styles.headerGlowSecondary} />
          <View style={styles.titleRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color={colors.ink} />
            </TouchableOpacity>
            <View>
              <Text style={styles.titulo}>Alterar senha</Text>
              <Text style={styles.subtitulo}>Atualize sua senha de acesso.</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          {sucesso ? (
            <View style={styles.sucessoContainer}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#059669" />
              <Text style={styles.sucessoTexto}>Senha alterada com sucesso.</Text>
            </View>
          ) : null}

          <View style={[styles.campo, campoErros.current_password ? styles.campoErro : null]}>
            <Ionicons name="key-outline" size={19} color={campoErros.current_password ? '#DC2626' : colors.muted} style={styles.icone} />
            <TextInput
              style={styles.input}
              placeholder="Senha atual"
              placeholderTextColor={colors.muted}
              secureTextEntry={!atualVisivel}
              value={senhaAtual}
              onChangeText={(v) => {
                setSenhaAtual(v);
                limparErro('current_password');
              }}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setAtualVisivel(!atualVisivel)}>
              <Ionicons name={atualVisivel ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {campoErros.current_password ? <Text style={styles.erroCampo}>{campoErros.current_password}</Text> : null}

          <View style={[styles.campo, campoErros.password ? styles.campoErro : null]}>
            <Ionicons name="lock-closed-outline" size={19} color={campoErros.password ? '#DC2626' : colors.muted} style={styles.icone} />
            <TextInput
              style={styles.input}
              placeholder="Nova senha"
              placeholderTextColor={colors.muted}
              secureTextEntry={!novaVisivel}
              value={novaSenha}
              onChangeText={(v) => {
                setNovaSenha(v);
                limparErro('password');
              }}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setNovaVisivel(!novaVisivel)}>
              <Ionicons name={novaVisivel ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {campoErros.password ? <Text style={styles.erroCampo}>{campoErros.password}</Text> : null}

          <View style={[styles.campo, campoErros.password_confirmation ? styles.campoErro : null]}>
            <Ionicons name="lock-closed-outline" size={19} color={campoErros.password_confirmation ? '#DC2626' : colors.muted} style={styles.icone} />
            <TextInput
              style={styles.input}
              placeholder="Confirmar nova senha"
              placeholderTextColor={colors.muted}
              secureTextEntry={!confirmVisivel}
              value={confirmacao}
              onChangeText={(v) => {
                setConfirmacao(v);
                limparErro('password_confirmation');
              }}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setConfirmVisivel(!confirmVisivel)}>
              <Ionicons name={confirmVisivel ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.muted} />
            </TouchableOpacity>
          </View>
          {campoErros.password_confirmation ? <Text style={styles.erroCampo}>{campoErros.password_confirmation}</Text> : null}

          {erroGeral ? (
            <View style={styles.erroContainer}>
              <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.erroTexto}>{erroGeral}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.botaoSalvar, salvando && styles.botaoDisabled]}
            onPress={handleAlterarSenha}
            disabled={salvando}
            activeOpacity={0.85}
          >
            {salvando ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-outline" size={18} color={colors.surface} />
                <Text style={styles.botaoSalvarTexto}>Salvar nova senha</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 28 },
  headerCard: {
    backgroundColor: '#FBFAFF',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  headerGlowPrimary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    right: -104,
    top: -150,
    backgroundColor: '#F0E9FF',
    opacity: 0.92,
  },
  headerGlowSecondary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    left: -76,
    top: 58,
    backgroundColor: '#F7F2FF',
    opacity: 0.98,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#EEE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { fontSize: 23, fontWeight: '900', color: '#111827' },
  subtitulo: { fontSize: 13, fontWeight: '600', color: '#525A76', marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F0ECFA',
    shadowColor: '#6D4DE6',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBFAFF',
    borderWidth: 1,
    borderColor: '#DED7EF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginBottom: 4,
  },
  campoErro: { borderColor: '#DC2626', backgroundColor: '#FFF5F5' },
  icone: { marginRight: 9 },
  input: { flex: 1, fontSize: 15, color: colors.ink },
  erroCampo: { fontSize: 12, color: '#DC2626', marginBottom: 10, marginLeft: 2 },
  erroContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  erroTexto: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },
  sucessoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  sucessoTexto: { fontSize: 13, color: '#059669', fontWeight: '700' },
  botaoSalvar: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  botaoDisabled: { opacity: 0.6 },
  botaoSalvarTexto: { color: colors.surface, fontSize: 15, fontWeight: '800' },
});
