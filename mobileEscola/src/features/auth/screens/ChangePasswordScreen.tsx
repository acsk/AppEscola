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
import { api } from '../../../services/api';
import { colors } from '../../../theme';

export function ChangePasswordScreen() {
  const { clearPasswordChangeFlag } = useAuth();
  const [senhaAtual, setSenhaAtual]         = useState('');
  const [novaSenha, setNovaSenha]           = useState('');
  const [confirmacao, setConfirmacao]       = useState('');
  const [atualVisivel, setAtualVisivel]     = useState(false);
  const [senhaVisivel, setSenhaVisivel]     = useState(false);
  const [confirmVisivel, setConfirmVisivel] = useState(false);
  const [carregando, setCarregando]         = useState(false);
  const [campoErros, setCampoErros]         = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral]           = useState<string | null>(null);

  function limparErro(campo: string) {
    setCampoErros((prev) => { const next = { ...prev }; delete next[campo]; return next; });
    setErroGeral(null);
  }

  async function handleAlterarSenha() {
    // Validação local
    const errosLocais: Record<string, string> = {};
    if (!senhaAtual)   errosLocais.current_password = 'Informe a senha atual.';
    if (!novaSenha)    errosLocais.password         = 'Informe a nova senha.';
    else if (novaSenha.length < 8) errosLocais.password = 'A senha deve ter no mínimo 8 caracteres.';
    if (!confirmacao)  errosLocais.password_confirmation = 'Confirme a nova senha.';
    else if (novaSenha && novaSenha !== confirmacao)
      errosLocais.password_confirmation = 'As senhas não conferem.';

    if (Object.keys(errosLocais).length > 0) {
      setCampoErros(errosLocais);
      setErroGeral(null);
      return;
    }

    setCampoErros({});
    setErroGeral(null);

    try {
      setCarregando(true);
      await api.put('/api/me/password', {
        current_password:      senhaAtual,
        password:              novaSenha,
        password_confirmation: confirmacao,
      });
      clearPasswordChangeFlag();
    } catch (error: any) {
      const apiErros: Record<string, string[]> | undefined = error?.response?.data?.errors;
      if (apiErros) {
        const mapeados: Record<string, string> = {};
        Object.entries(apiErros).forEach(([campo, msgs]) => {
          mapeados[campo] = msgs[0];
        });
        setCampoErros(mapeados);
      } else {
        setErroGeral(
          error?.response?.data?.message ?? 'Não foi possível alterar a senha.',
        );
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
        <View style={styles.iconContainer}>
          <Ionicons name="lock-closed" size={40} color={colors.primary} />
        </View>

        <Text style={styles.titulo}>Troca de senha obrigatória</Text>
        <Text style={styles.subtitulo}>
          Seu acesso exige a criação de uma nova senha antes de continuar.
        </Text>

        <View style={[styles.campo, campoErros.current_password ? styles.campoErro : null]}>
          <Ionicons name="key-outline" size={20} color={campoErros.current_password ? '#DC2626' : '#6B7280'} style={styles.icone} />
          <TextInput
            style={styles.input}
            placeholder="Senha atual"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!atualVisivel}
            value={senhaAtual}
            onChangeText={(v) => { setSenhaAtual(v); limparErro('current_password'); }}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setAtualVisivel(!atualVisivel)}>
            <Ionicons name={atualVisivel ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
        {campoErros.current_password ? (
          <Text style={styles.erroCampo}>{campoErros.current_password}</Text>
        ) : null}

        <View style={[styles.campo, campoErros.password ? styles.campoErro : null]}>
          <Ionicons name="lock-closed-outline" size={20} color={campoErros.password ? '#DC2626' : '#6B7280'} style={styles.icone} />
          <TextInput
            style={styles.input}
            placeholder="Nova senha"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!senhaVisivel}
            value={novaSenha}
            onChangeText={(v) => { setNovaSenha(v); limparErro('password'); }}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setSenhaVisivel(!senhaVisivel)}>
            <Ionicons name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
        {campoErros.password ? (
          <Text style={styles.erroCampo}>{campoErros.password}</Text>
        ) : null}

        <View style={[styles.campo, campoErros.password_confirmation ? styles.campoErro : null]}>
          <Ionicons name="lock-closed-outline" size={20} color={campoErros.password_confirmation ? '#DC2626' : '#6B7280'} style={styles.icone} />
          <TextInput
            style={styles.input}
            placeholder="Confirmar nova senha"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!confirmVisivel}
            value={confirmacao}
            onChangeText={(v) => { setConfirmacao(v); limparErro('password_confirmation'); }}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setConfirmVisivel(!confirmVisivel)}>
            <Ionicons name={confirmVisivel ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
        {campoErros.password_confirmation ? (
          <Text style={styles.erroCampo}>{campoErros.password_confirmation}</Text>
        ) : null}

        {erroGeral ? (
          <View style={styles.erroContainer}>
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" style={{ marginRight: 8 }} />
            <Text style={styles.erroTexto}>{erroGeral}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.botao, carregando && styles.botaoDesabilitado]}
          onPress={handleAlterarSenha}
          disabled={carregando}
          activeOpacity={0.8}
        >
          {carregando ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.botaoTexto}>Alterar senha e continuar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.soft,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  titulo: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
  subtitulo: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  campoErro: {
    borderColor: '#DC2626',
    backgroundColor: '#FFF5F5',
  },
  erroCampo: {
    fontSize: 12,
    color: '#DC2626',
    marginBottom: 12,
    marginLeft: 4,
  },
  icone: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  botao: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  botaoDesabilitado: { opacity: 0.6 },
  botaoTexto: { color: colors.surface, fontSize: 16, fontWeight: '600' },
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
