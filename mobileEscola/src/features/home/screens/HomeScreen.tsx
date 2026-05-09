import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';
import { compressImageToMaxSize } from '../../../services/image-compression.service';
import { listarSimulados, SimuladoListItem, AttemptStatus, subjectIconName } from '../../../services/simulados.service';
import { uploadStudentPhoto } from '../../../services/student-photo.service';
import { colors } from '../../../theme';

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('');
}

const ROLE_LABELS: Record<string, string> = {
  aluno:       'Estudante',
  professor:   'Professor',
  admin:       'Administrador',
  super_admin: 'Super Admin',
};

type DashboardPeriod = 'month' | 'all';

interface AlunoDashboardSummary {
  accuracy: number;
  correct: number;
  wrong: number;
  accuracy_change: number | null;
}

interface AlunoDashboardMetrics {
  total_exams: number;
  avg_accuracy: number;
  current_streak_days: number;
  period: DashboardPeriod;
  summary: AlunoDashboardSummary;
}

interface DashboardEnvelope {
  type?: string;
  message?: string;
  body?: AlunoDashboardMetrics;
  data?: AlunoDashboardMetrics;
}

const META_TARGET = 300;

function formatPct(value: number, fractionDigits = 1): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

const SIM_STATUS_COLOR: Record<AttemptStatus, string> = {
  not_started: '#22C55E',
  in_progress: '#F97316',
  completed:   '#22C55E',
  pending_review: '#F97316',
  awaiting_release: '#F97316',
};
const SIM_STATUS_LABEL: Record<AttemptStatus, string> = {
  not_started: 'Disponível',
  in_progress: 'Em andamento',
  completed:   'Concluído',
  pending_review: 'Aguardando correção',
  awaiting_release: 'Aguardando liberação',
};

function diffCalendarDays(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.ceil((end - start) / 86400000);
}

function getSimuladoDayCounter(simulado: SimuladoListItem): string | null {
  const hoje = new Date();
  const inicio = simulado.starts_at ? new Date(simulado.starts_at) : null;
  const fim = simulado.ends_at ? new Date(simulado.ends_at) : null;

  if (inicio && hoje < inicio) {
    const dias = Math.max(0, diffCalendarDays(hoje, inicio));
    if (dias === 0) return 'Começa hoje';
    return `Começa em ${dias} dia${dias !== 1 ? 's' : ''}`;
  }

  if (fim) {
    if (hoje > fim) return 'Encerrado';
    const dias = Math.max(0, diffCalendarDays(hoje, fim));
    if (dias === 0) return 'Encerra hoje';
    return `${dias} dia${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}`;
  }

  return null;
}

export function HomeScreen() {
  const { user, signOut, refreshUserProfile } = useAuth();
  const navigation = useNavigation<any>();

  const [simuladosRecentes, setSimuladosRecentes] = useState<SimuladoListItem[]>([]);
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('month');
  const [dashboard, setDashboard] = useState<AlunoDashboardMetrics | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    if (user?.role === 'aluno') {
      listarSimulados().then((lista) => setSimuladosRecentes(lista.slice(0, 3))).catch(() => {});
    }
  }, [user?.role]);

  useEffect(() => {
    let active = true;

    async function carregarDashboard() {
      if (user?.role !== 'aluno') return;
      try {
        setDashboardLoading(true);
        const { data } = await api.get<AlunoDashboardMetrics | DashboardEnvelope>('/api/aluno/dashboard', {
          params: { period: dashboardPeriod },
        });
        const envelope = data as DashboardEnvelope;
        const payload = envelope.body ?? envelope.data ?? (data as AlunoDashboardMetrics);
        if (active) {
          setDashboard(payload);
        }
      } catch {
        if (active) {
          setDashboard(null);
        }
      } finally {
        if (active) {
          setDashboardLoading(false);
        }
      }
    }

    carregarDashboard();

    return () => {
      active = false;
    };
  }, [dashboardPeriod, user?.role]);

  const [painelAberto, setPainelAberto]         = useState(false);
  const [formAberto, setFormAberto]             = useState(false);
  const [senhaAtual, setSenhaAtual]             = useState('');
  const [novaSenha, setNovaSenha]               = useState('');
  const [confirmacao, setConfirmacao]           = useState('');
  const [atualVisivel, setAtualVisivel]         = useState(false);
  const [novaVisivel, setNovaVisivel]           = useState(false);
  const [confirmVisivel, setConfirmVisivel]     = useState(false);
  const [salvando, setSalvando]                 = useState(false);
  const [campoErros, setCampoErros]             = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral]               = useState<string | null>(null);
  const [sucesso, setSucesso]                   = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [saindo, setSaindo]                     = useState(false);
  const [avatarUploading, setAvatarUploading]   = useState(false);
  const [avatarFeedback, setAvatarFeedback]     = useState<string | null>(null);
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState<string | null>(null);
  const photoInputRef = useRef<any>(null);

  useEffect(() => {
    setAvatarFeedback(null);
  }, [user?.id]);

  function limparErro(campo: string) {
    setCampoErros((prev) => { const next = { ...prev }; delete next[campo]; return next; });
    setErroGeral(null);
  }

  async function handleAlterarSenha() {
    const loc: Record<string, string> = {};
    if (!senhaAtual) loc.current_password = 'Informe a senha atual.';
    if (!novaSenha)  loc.password         = 'Informe a nova senha.';
    else if (novaSenha.length < 8) loc.password = 'Mínimo de 8 caracteres.';
    if (!confirmacao) loc.password_confirmation = 'Confirme a nova senha.';
    else if (novaSenha && novaSenha !== confirmacao) loc.password_confirmation = 'As senhas não conferem.';
    if (Object.keys(loc).length) { setCampoErros(loc); setErroGeral(null); return; }

    setCampoErros({}); setErroGeral(null);
    try {
      setSalvando(true);
      await api.put('/api/me/password', {
        current_password: senhaAtual, password: novaSenha, password_confirmation: confirmacao,
      });
      setSucesso(true);
      setSenhaAtual(''); setNovaSenha(''); setConfirmacao('');
    } catch (error: any) {
      const apiErros: Record<string, string[]> | undefined = error?.response?.data?.errors;
      if (apiErros) {
        const m: Record<string, string> = {};
        Object.entries(apiErros).forEach(([k, v]) => { m[k] = v[0]; });
        setCampoErros(m);
      } else {
        setErroGeral(error?.response?.data?.message ?? 'Não foi possível alterar a senha.');
      }
    } finally { setSalvando(false); }
  }

  async function handleSair() { setSaindo(true); await signOut(); }

  async function processarUploadFoto(uri: string, fileName: string, mimeType: string) {
    console.log('[Foto] processarUploadFoto', { uri, fileName, mimeType, student_id: user?.student_id });
    if (!user?.student_id) {
      console.warn('[Foto] sem student_id, abortando');
      return;
    }

    setAvatarUploading(true);
    setAvatarFeedback('Comprimindo imagem...');

    try {
      console.log('[Foto] iniciando compressão');
      const compressed = await compressImageToMaxSize(uri, { maxSizeKb: 50 });
      console.log('[Foto] compressão ok', compressed);

      setAvatarFeedback('Enviando foto...');

      console.log('[Foto] iniciando upload');
      const response = await uploadStudentPhoto({
        studentId: user.student_id,
        uri: compressed.uri,
        fileName: compressed.fileName || fileName,
        mimeType: compressed.mimeType || mimeType,
      });

      const uploadedUrl = response.body?.photo_url;
      if (uploadedUrl) {
        setAvatarOverrideUrl(`${uploadedUrl}${uploadedUrl.includes('?') ? '&' : '?'}v=${Date.now()}`);
      }

      await refreshUserProfile();

      const finalKb = compressed.sizeBytes ? Math.round(compressed.sizeBytes / 1024) : null;
      setAvatarFeedback(finalKb ? `Foto atualizada (${finalKb}kb).` : 'Foto atualizada com sucesso.');
    } catch (error: any) {
      console.error('[Upload foto]', error?.message, error?.response?.status, error?.response?.data);
      const apiMessage =
        error?.response?.data?.errors
          ? Object.values(error.response.data.errors as Record<string, string[]>).flat().join(' ')
          : error?.response?.data?.message ?? error?.message;
      const errorDetail = error?.response?.status ? ` (HTTP ${error.response.status})` : '';
      const displayMessage = apiMessage
        ? `${apiMessage}${errorDetail}`
        : `Não foi possível enviar sua foto agora.${errorDetail}`;
      setAvatarFeedback(displayMessage);
      Alert.alert('Falha no upload', displayMessage);
    } finally {
      setAvatarUploading(false);
    }
  }

  function handleSelecionarFoto() {
    console.log('[Foto] handleSelecionarFoto disparado', {
      role: user?.role,
      student_id: user?.student_id,
      platform: Platform.OS,
      hasRef: !!photoInputRef.current,
      refTag: (photoInputRef.current as any)?.tagName,
    });
    console.log('[Foto] user completo:', JSON.stringify(user, null, 2));

    if (user?.role !== 'aluno' || !user?.student_id) {
      Alert.alert('Ação indisponível', 'Somente alunos podem alterar a foto do perfil.');
      return;
    }

    if (Platform.OS === 'web') {
      const inputEl = photoInputRef.current as HTMLInputElement | null;
      console.log('[Foto] tentando abrir input file no web', inputEl);
      if (!inputEl) {
        console.warn('[Foto] photoInputRef está nulo!');
        return;
      }
      try {
        inputEl.click();
        console.log('[Foto] inputEl.click() executado');
      } catch (e) {
        console.error('[Foto] erro ao chamar click()', e);
      }
      return;
    }

    (async () => {
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permissão necessária', 'Permita acesso à galeria para enviar sua foto.');
          return;
        }

        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 1,
        });

        if (picked.canceled || !picked.assets?.length) return;

        const asset = picked.assets[0];
        await processarUploadFoto(
          asset.uri,
          asset.fileName ?? `student-${user.student_id}.jpg`,
          asset.mimeType ?? 'image/jpeg'
        );
      } catch (err) {
        console.error('[Picker]', err);
      }
    })();
  }

  function handleWebFileChange(event: any) {
    console.log('[Foto] handleWebFileChange disparado', event?.target?.files);
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) {
      console.warn('[Foto] nenhum arquivo selecionado');
      return;
    }
    console.log('[Foto] arquivo escolhido', { name: file.name, type: file.type, size: file.size });

    const objectUrl = URL.createObjectURL(file);
    console.log('[Foto] objectUrl criado', objectUrl);
    processarUploadFoto(objectUrl, file.name, file.type || 'image/jpeg').finally(() => {
      if (photoInputRef.current) photoInputRef.current.value = '';
    });
  }

  const initials  = getInitials(user?.name ?? 'U');
  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? '-';
  const avatarUrl = avatarOverrideUrl ?? (user as any)?.photo_url ?? (user as any)?.avatar_url ?? (user as any)?.avatar;

  const totalExams = dashboard?.total_exams ?? 0;
  const avgAccuracy = dashboard?.avg_accuracy ?? 0;
  const currentStreakDays = dashboard?.current_streak_days ?? 0;
  const summaryAccuracy = dashboard?.summary?.accuracy ?? avgAccuracy;
  const summaryCorrect = dashboard?.summary?.correct ?? 0;
  const summaryWrong = dashboard?.summary?.wrong ?? 0;
  const summaryAccuracyChange = dashboard?.summary?.accuracy_change ?? 0;

  const stats = [
    { icon: 'book-outline', value: String(totalExams), label: 'Simulados\nrealizados' },
    { icon: 'trending-up-outline', value: formatPct(avgAccuracy, 1), label: 'Precisão\nmédia' },
    { icon: 'flame-outline', value: String(currentStreakDays), label: 'Dias de\nstreak' },
  ];

  const totalRespostas = Math.max(1, summaryCorrect + summaryWrong);
  const acertosPct = Math.max(0, Math.min(100, (summaryCorrect / totalRespostas) * 100));
  const errosPct = Math.max(0, Math.min(100, (summaryWrong / totalRespostas) * 100));
  const metaPct = Math.max(0, Math.min(100, (totalExams / META_TARGET) * 100));
  const trendPositivo = summaryAccuracyChange >= 0;
  const periodoLabel = dashboardPeriod === 'month' ? 'Este mês' : 'Período geral';
  const comparativoLabel = dashboardPeriod === 'month' ? 'mês anterior' : 'período anterior';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerProfileRow}>
          <View style={styles.studentBlock}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handleSelecionarFoto}
              activeOpacity={0.85}
              disabled={avatarUploading}
            >
              <View style={styles.avatarCircle}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
              </View>
              <View style={styles.avatarEditBtn}>
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Ionicons name="pencil" size={12} color={colors.ink} />
                )}
              </View>
              {Platform.OS === 'web' ? (
                // @ts-ignore - input HTML válido apenas no react-native-web
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleWebFileChange}
                />
              ) : null}
            </TouchableOpacity>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={2}>{user?.name ?? 'Usuário'}</Text>
              <Text style={styles.userRole}>{roleLabel}</Text>
              {avatarFeedback ? <Text style={styles.avatarFeedback}>{avatarFeedback}</Text> : null}
                {/* <View style={styles.levelBadge}>
                  <Ionicons name="star" size={11} color={colors.primary} />
                  <Text style={styles.levelText} numberOfLines={1}>Nível 7 – Destaque da Turma</Text>
                </View> */}
            </View>
          </View>

          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconBtn}>
              <Ionicons name="notifications-outline" size={22} color={colors.surface} />
              <View style={styles.notifDot} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setPainelAberto(!painelAberto)}>
              <Ionicons name="settings-outline" size={22} color={colors.surface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => { setPainelAberto(true); setConfirmandoSaida(true); }}
              disabled={saindo}
            >
              <Ionicons name="log-out-outline" size={22} color={colors.surface} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <View key={i} style={[styles.statItem, i < stats.length - 1 && styles.statBorder]}>
              <Ionicons name={s.icon as any} size={19} color={colors.muted} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Painel de configurações ────────────────────────────────────── */}
      {painelAberto && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Configurações</Text>

          <TouchableOpacity style={styles.acaoLinha}
            onPress={() => { setFormAberto(!formAberto); setSucesso(false); }} activeOpacity={0.7}>
            <Ionicons name="key-outline" size={20} color={colors.muted} />
            <Text style={styles.acaoTexto}>Alterar senha</Text>
            <Ionicons name={formAberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </TouchableOpacity>

          {formAberto && (
            <View style={styles.formSenha}>
              {sucesso && (
                <View style={styles.sucessoContainer}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#059669" style={{ marginRight: 8 }} />
                  <Text style={styles.sucessoTexto}>Senha alterada com sucesso!</Text>
                </View>
              )}
              {/* Senha atual */}
              <View style={[styles.campo, campoErros.current_password ? styles.campoErro : null]}>
                <Ionicons name="lock-closed-outline" size={17} color={campoErros.current_password ? '#DC2626' : colors.muted} style={styles.icone} />
                <TextInput style={styles.input} placeholder="Senha atual" placeholderTextColor={colors.muted}
                  secureTextEntry={!atualVisivel} value={senhaAtual}
                  onChangeText={(v) => { setSenhaAtual(v); limparErro('current_password'); setSucesso(false); }}
                  autoCapitalize="none" />
                <TouchableOpacity onPress={() => setAtualVisivel(!atualVisivel)}>
                  <Ionicons name={atualVisivel ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.muted} />
                </TouchableOpacity>
              </View>
              {campoErros.current_password ? <Text style={styles.erroCampo}>{campoErros.current_password}</Text> : null}

              {/* Nova senha */}
              <View style={[styles.campo, campoErros.password ? styles.campoErro : null]}>
                <Ionicons name="lock-closed-outline" size={17} color={campoErros.password ? '#DC2626' : colors.muted} style={styles.icone} />
                <TextInput style={styles.input} placeholder="Nova senha" placeholderTextColor={colors.muted}
                  secureTextEntry={!novaVisivel} value={novaSenha}
                  onChangeText={(v) => { setNovaSenha(v); limparErro('password'); setSucesso(false); }}
                  autoCapitalize="none" />
                <TouchableOpacity onPress={() => setNovaVisivel(!novaVisivel)}>
                  <Ionicons name={novaVisivel ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.muted} />
                </TouchableOpacity>
              </View>
              {campoErros.password ? <Text style={styles.erroCampo}>{campoErros.password}</Text> : null}

              {/* Confirmação */}
              <View style={[styles.campo, campoErros.password_confirmation ? styles.campoErro : null]}>
                <Ionicons name="lock-closed-outline" size={17} color={campoErros.password_confirmation ? '#DC2626' : colors.muted} style={styles.icone} />
                <TextInput style={styles.input} placeholder="Confirmar nova senha" placeholderTextColor={colors.muted}
                  secureTextEntry={!confirmVisivel} value={confirmacao}
                  onChangeText={(v) => { setConfirmacao(v); limparErro('password_confirmation'); setSucesso(false); }}
                  autoCapitalize="none" />
                <TouchableOpacity onPress={() => setConfirmVisivel(!confirmVisivel)}>
                  <Ionicons name={confirmVisivel ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.muted} />
                </TouchableOpacity>
              </View>
              {campoErros.password_confirmation ? <Text style={styles.erroCampo}>{campoErros.password_confirmation}</Text> : null}

              {erroGeral ? (
                <View style={styles.erroContainer}>
                  <Ionicons name="alert-circle-outline" size={15} color="#DC2626" style={{ marginRight: 8 }} />
                  <Text style={styles.erroTexto}>{erroGeral}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={[styles.botaoSalvar, salvando && styles.botaoDisabled]}
                onPress={handleAlterarSenha} disabled={salvando} activeOpacity={0.8}>
                {salvando ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.botaoSalvarTexto}>Salvar nova senha</Text>}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.divisor} />

          {!confirmandoSaida ? (
            <TouchableOpacity style={styles.acaoLinha} onPress={() => setConfirmandoSaida(true)} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={20} color={colors.debit} />
              <Text style={[styles.acaoTexto, { color: colors.debit }]}>Sair</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={styles.confirmTexto}>Tem certeza que deseja sair?</Text>
              <View style={styles.confirmBotoes}>
                <TouchableOpacity style={styles.botaoCancelar} onPress={() => setConfirmandoSaida(false)} activeOpacity={0.8}>
                  <Text style={styles.botaoCancelarTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.botaoConfirmarSair, saindo && styles.botaoDisabled]}
                  onPress={handleSair} disabled={saindo} activeOpacity={0.8}>
                  {saindo ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.botaoConfirmarSairTexto}>Confirmar saída</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── Resumo de desempenho ───────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardTitle}>Resumo de desempenho</Text>
            <Ionicons name="eye-outline" size={18} color={colors.muted} style={{ marginLeft: 8 }} />
          </View>
          <TouchableOpacity
            style={styles.periodoPicker}
            activeOpacity={0.8}
            onPress={() => setDashboardPeriod((prev) => (prev === 'month' ? 'all' : 'month'))}
          >
            <Text style={styles.periodoTexto}>{periodoLabel}</Text>
            {dashboardLoading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : null}
            <Ionicons name="chevron-down" size={13} color={colors.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.mediaGrande}>
          {summaryAccuracy.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
          <Text style={styles.mediaDecimal}>%</Text>
        </Text>
        <View style={styles.trendRow}>
          <Ionicons name={trendPositivo ? 'arrow-up' : 'arrow-down'} size={12} color={colors.muted} />
          <Text style={styles.trendTexto}>
            {formatPct(Math.abs(summaryAccuracyChange), 1)} vs {comparativoLabel}
          </Text>
        </View>

        <View style={styles.acertosErros}>
          <View style={styles.aeItem}>
            <Text style={styles.aeLabel}>Acertos</Text>
            <Text style={styles.aeValor}>{summaryCorrect}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${acertosPct}%` }]} />
            </View>
          </View>
          <View style={styles.aeItem}>
            <Text style={styles.aeLabel}>Erros</Text>
            <Text style={styles.aeValor}>{summaryWrong}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${errosPct}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.insightBox}>
          <Ionicons name="bulb-outline" size={17} color={colors.muted} style={{ marginRight: 8, flexShrink: 0 }} />
          <Text style={styles.insightTexto}>
            Seu desempenho no período está em{' '}
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{formatPct(summaryAccuracy, 1)}</Text>
            {' '}com variação de{' '}
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{formatPct(summaryAccuracyChange, 1)}</Text>
            {' '}em relação ao {comparativoLabel}.
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.muted} style={{ flexShrink: 0 }} />
        </View>
      </View>

      {/* ── Meus simulados ────────────────────────────────────────────── */}
      {user?.role === 'aluno' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meus simulados</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Simulados')}>
              <Text style={styles.sectionLink}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {simuladosRecentes.length === 0 ? (
              <View style={styles.simCardVazio}>
                <Text style={styles.simCardVazioTexto}>Nenhum simulado disponível</Text>
              </View>
            ) : simuladosRecentes.map((s) => {
              const cor = SIM_STATUS_COLOR[s.attempt_status];
              const contadorDias = getSimuladoDayCounter(s);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.simCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('Simulados', {
                    screen: 'SimuladoDetalhe',
                    params: { examId: s.id },
                  })}
                >
                  {/* Ícone + matéria */}
                  <View style={styles.simIconWrap}>
                    <Ionicons
                      name={subjectIconName(s.subject?.icon ?? '') as any}
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  {s.subject && (
                    <Text style={styles.simMateria}>
                      {s.subject.name}
                    </Text>
                  )}

                  {/* Título */}
                  <Text style={styles.simTitulo} numberOfLines={2}>{s.title}</Text>

                  {contadorDias ? (
                    <View style={styles.simDaysPill}>
                      <Ionicons name="calendar-outline" size={12} color="#CBD5E1" />
                      <Text style={styles.simDaysText} numberOfLines={1}>{contadorDias}</Text>
                    </View>
                  ) : null}

                  {/* Rodapé: status + link */}
                  <View style={styles.simRodape}>
                    <View style={[styles.simBadge, { backgroundColor: cor }]}>
                      <Text style={styles.simBadgeTexto}>
                        {SIM_STATUS_LABEL[s.attempt_status]}
                      </Text>
                    </View>
                    <View style={styles.simOpenButton}>
                      <Text style={styles.simLink}>Abrir</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.surface} />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}

 

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { paddingBottom: 16 },

  // Header
  header: {
    backgroundColor: colors.ink,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, elevation: 4,
  },
  headerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
    gap: 12,
  },
  studentBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  headerIcons: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(238,242,255,0.12)', position: 'relative',
  },
  notifDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary,
    borderWidth: 1, borderColor: colors.ink,
  },
  avatarWrap:    { position: 'relative', marginRight: 18 },
  avatarCircle:  {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: 'rgba(238,242,255,0.18)', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: colors.primary },
  avatarEditBtn:  {
    position: 'absolute', bottom: 4, right: 4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: colors.ink,
  },
  userInfo:   { flex: 1, minWidth: 0 },
  userName:   { fontSize: 23, fontWeight: '800', color: colors.surface, marginBottom: 3 },
  userRole:   { fontSize: 14, color: '#CBD5E1', marginBottom: 10 },
  avatarFeedback: { fontSize: 12, color: '#E2E8F0', marginBottom: 8 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.soft, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  levelText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  statsRow:  {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  statItem:  { flex: 1, alignItems: 'center', gap: 4 },
  statBorder:{ borderRightWidth: 1, borderRightColor: colors.border },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.muted, textAlign: 'center', lineHeight: 14 },

  // Card genérico
  card: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: 18, padding: 18,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  cardTitle:      { fontSize: 16, fontWeight: '700', color: colors.ink },
  periodoPicker:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  periodoTexto: { fontSize: 13, color: colors.text, fontWeight: '500' },

  // Desempenho
  mediaGrande:  { fontSize: 40, fontWeight: '800', color: colors.ink },
  mediaDecimal: { fontSize: 24, fontWeight: '600', color: colors.ink },
  trendRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  trendTexto:   { fontSize: 13, color: colors.muted, fontWeight: '500' },
  acertosErros: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  aeItem:       { flex: 1 },
  aeLabel:      { fontSize: 12, color: colors.muted, marginBottom: 2 },
  aeValor:      { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  progressBar:  { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E0E7FF' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  insightBox:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.soft, borderRadius: 12,
    padding: 12, gap: 4,
  },
  insightTexto: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: colors.ink },
  sectionLink:   { fontSize: 13, color: colors.primary, fontWeight: '700' },
  hScroll:       { paddingHorizontal: 16, gap: 12 },

  // Simulados
  simCard: {
    width: 184, minHeight: 214, backgroundColor: colors.ink, borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, elevation: 3,
    flexDirection: 'column',
  },
  simCardVazio: {
    width: 220, backgroundColor: colors.surface, borderRadius: 18, padding: 20,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  simCardVazioTexto: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  simIconWrap: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: colors.surface,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  simMateria: { fontSize: 11, fontWeight: '700', color: '#CBD5E1', marginBottom: 8 },
  simTitulo:  { fontSize: 14, fontWeight: '800', color: colors.surface, marginBottom: 10, lineHeight: 20, flex: 1 },
  simDaysPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    maxWidth: '100%',
    backgroundColor: 'rgba(238,242,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 10,
  },
  simDaysText: { fontSize: 10, fontWeight: '800', color: '#CBD5E1' },
  simRodape:  { gap: 8, marginTop: 'auto' as any },
  simBadge:   { alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  simBadgeTexto: { fontSize: 10, fontWeight: '800', color: colors.surface },
  simOpenButton: {
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  simLink:    { fontSize: 12, fontWeight: '800', color: colors.surface },

  // Meta
  metaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: 18, padding: 16, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  metaIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center',
  },
  metaInfo:     { flex: 1 },
  metaSubtitulo:{ fontSize: 11, color: colors.primary, fontWeight: '600', marginBottom: 2 },
  metaTitulo:   { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  metaBar:      { height: 6, backgroundColor: '#E0E7FF', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  metaBarFill:  { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  metaNumeros:  { fontSize: 11, color: colors.muted },
  metaPct:      { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Configurações / alterar senha
  acaoLinha:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  acaoTexto:  { flex: 1, fontSize: 15, fontWeight: '500', color: colors.ink },
  divisor:    { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  formSenha:  { marginTop: 14 },
  campo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soft,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, marginBottom: 4,
  },
  campoErro:  { borderColor: '#DC2626', backgroundColor: '#FFF5F5' },
  icone:      { marginRight: 8 },
  input:      { flex: 1, fontSize: 14, color: colors.ink },
  erroCampo:  { fontSize: 12, color: '#DC2626', marginBottom: 10, marginLeft: 2 },
  erroContainer: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 8, padding: 10, marginBottom: 10,
  },
  erroTexto:  { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },
  sucessoContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7',
    borderRadius: 8, padding: 10, marginBottom: 12,
  },
  sucessoTexto:    { fontSize: 13, color: '#059669', fontWeight: '500' },
  botaoSalvar:     { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  botaoDisabled:   { opacity: 0.6 },
  botaoSalvarTexto:{ color: colors.surface, fontSize: 15, fontWeight: '600' },
  confirmTexto:    { fontSize: 14, color: colors.text, marginBottom: 12 },
  confirmBotoes:   { flexDirection: 'row', gap: 10 },
  botaoCancelar:   { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  botaoCancelarTexto:     { fontSize: 14, color: colors.text, fontWeight: '500' },
  botaoConfirmarSair:     { flex: 1, backgroundColor: colors.debit, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  botaoConfirmarSairTexto:{ fontSize: 14, color: colors.surface, fontWeight: '600' },
});
