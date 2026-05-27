import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';
import { compressImageToMaxSize } from '../../../services/image-compression.service';
import { SimuladoListItem, AttemptStatus, subjectIconName } from '../../../services/simulados.service';
import { useSimuladosList } from '../../simulados/hooks';
import { useProvasAnterioresList } from '../../provas-anteriores/hooks';
import { PastMaterialHomeCard } from '../../provas-anteriores/components/PastMaterialHomeCard';
import { uploadStudentPhoto } from '../../../services/student-photo.service';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { platformShadow } from '../../../lib/shadow';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';
import { useUnreadNotificationsCount } from '../../notifications/hooks';
import { WeeklyCalendarWidget } from '../../calendar/components/WeeklyCalendarWidget';
import { StudentEnrollmentContextCard } from '../../../components/student/StudentEnrollmentContextCard';
import type { StudentActiveEnrollment } from '../../../types/student-enrollment';

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
  active_enrollments?: StudentActiveEnrollment[];
}

interface DashboardEnvelope {
  type?: string;
  message?: string;
  body?: AlunoDashboardMetrics;
  data?: AlunoDashboardMetrics;
}

function formatPct(value: number, fractionDigits = 1): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

const SIM_STATUS_COLOR: Record<AttemptStatus, string> = {
  not_started: '#22C55E',
  in_progress: '#F97316',
  completed: '#22C55E',
  pending_review: '#F97316',
  awaiting_release: '#F97316',
  abandoned: '#94A3B8',
};
const SIM_STATUS_LABEL: Record<AttemptStatus, string> = {
  not_started: 'Disponível',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  pending_review: 'Aguardando correção',
  awaiting_release: 'Aguardando liberação',
  abandoned: 'Tempo esgotado',
};

const SIM_CARD_ACCENTS = [
  { main: '#6D4DE6', soft: '#F5F0FF', border: '#D8C7FF', shadow: '#6D4DE6' },
  { main: '#2FAE58', soft: '#F0FFF5', border: '#BEE8CB', shadow: '#22A84D' },
  { main: '#F59E0B', soft: '#FFF9ED', border: '#FFDFA3', shadow: '#F59E0B' },
  { main: '#1D7FEA', soft: '#EFF7FF', border: '#B9DDFF', shadow: '#1D7FEA' },
];

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
  const colors = useThemeColors();
  const styles = useMemo(() => createHomeStyles(colors), [colors]);
  const { user, refreshUserProfile } = useAuth();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const simColumns = width >= 600 ? 3 : 2;
  const simCardWidth = (width - 32 - 12 * (simColumns - 1)) / simColumns;

  const { data: simuladosLista = [] } = useSimuladosList();
  const { data: provasAnterioresLista = [] } = useProvasAnterioresList({ material_kind: 'prova' });
  const simuladosRecentes = user?.role === 'aluno' ? simuladosLista : [];
  const provasAnterioresRecentes = user?.role === 'aluno' ? provasAnterioresLista.slice(0, 5) : [];
  const {
    data: unreadNotifications = 0,
    refetch: refetchUnreadNotifications,
  } = useUnreadNotificationsCount(user?.role === 'aluno');

  useFocusEffect(
    React.useCallback(() => {
      if (user?.role === 'aluno') {
        refetchUnreadNotifications();
      }
    }, [user?.role, refetchUnreadNotifications])
  );
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('month');
  const [dashboard, setDashboard] = useState<AlunoDashboardMetrics | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

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

  const [avatarUploading, setAvatarUploading]   = useState(false);
  const [avatarFeedback, setAvatarFeedback]     = useState<string | null>(null);
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState<string | null>(null);
  const photoInputRef = useRef<any>(null);

  useEffect(() => {
    setAvatarFeedback(null);
  }, [user?.id]);

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
  const summaryAccuracy = dashboard?.summary?.accuracy ?? avgAccuracy;
  const summaryCorrect = dashboard?.summary?.correct ?? 0;
  const summaryWrong = dashboard?.summary?.wrong ?? 0;
  const summaryAccuracyChange = dashboard?.summary?.accuracy_change ?? 0;
  const totalRespostas = Math.max(1, summaryCorrect + summaryWrong);
  const acertosPct = Math.max(0, Math.min(100, (summaryCorrect / totalRespostas) * 100));
  const errosPct = Math.max(0, Math.min(100, (summaryWrong / totalRespostas) * 100));
  const trendPositivo = summaryAccuracyChange >= 0;
  const periodoLabel = dashboardPeriod === 'month' ? 'Este mês' : 'Período geral';
  const comparativoLabel = dashboardPeriod === 'month' ? 'mês anterior' : 'período anterior';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <View style={styles.headerGlowPrimary} />
        <View style={styles.headerGlowSecondary} />
        <View style={[styles.headerProfileRow, isCompact && styles.headerProfileRowCompact]}>
          <MenuButton style={isCompact ? styles.menuBtnCompact : undefined} />
          <View style={[styles.studentBlock, isCompact && styles.studentBlockCompact]}>
            <TouchableOpacity
              style={[styles.avatarWrap, isCompact && styles.avatarWrapCompact]}
              onPress={handleSelecionarFoto}
              activeOpacity={0.85}
              disabled={avatarUploading}
            >
              <View style={[styles.avatarCircle, isCompact && styles.avatarCircleCompact]}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarInitials, isCompact && styles.avatarInitialsCompact]}>{initials}</Text>
                )}
              </View>
              <View style={[styles.avatarEditBtn, isCompact && styles.avatarEditBtnCompact]}>
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Ionicons name="pencil" size={isCompact ? 11 : 12} color={colors.ink} />
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
              <Text style={[styles.userName, isCompact && styles.userNameCompact]} numberOfLines={2}>{user?.name ?? 'Usuário'}</Text>
              <Text style={[styles.userRole, isCompact && styles.userRoleCompact]}>{roleLabel}</Text>
              {avatarFeedback ? <Text style={styles.avatarFeedback}>{avatarFeedback}</Text> : null}
                {/* <View style={styles.levelBadge}>
                  <Ionicons name="star" size={11} color={colors.primary} />
                  <Text style={styles.levelText} numberOfLines={1}>Nível 7 – Destaque da Turma</Text>
                </View> */}
            </View>
          </View>

          <View style={[styles.headerIcons, isCompact && styles.headerIconsCompact]}>
            {user?.role === 'aluno' ? (
              <TouchableOpacity
                style={[styles.iconBtn, isCompact && styles.iconBtnCompact]}
                onPress={() => navigation.navigate('Notificacoes')}
                accessibilityLabel="Notificações"
              >
                <Ionicons name="notifications-outline" size={isCompact ? 24 : 27} color={colors.ink} />
                {unreadNotifications > 0 ? (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

      </View>

      {user?.role === 'aluno' && <WeeklyCalendarWidget />}

      {user?.role === 'aluno' && dashboard?.active_enrollments?.length ? (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <StudentEnrollmentContextCard enrollments={dashboard.active_enrollments} compact />
        </View>
      ) : null}

      {/* ── Resumo de desempenho ───────────────────────────────────────── */}
      {user?.role === 'aluno' && (
        <View style={[styles.card, isCompact && styles.cardCompact]}>
          <View style={[styles.cardHeader, isCompact && styles.cardHeaderCompact]}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardTitle} numberOfLines={1}>Resumo de desempenho</Text>
              <Ionicons name="eye-outline" size={16} color={colors.muted} style={{ marginLeft: 6 }} />
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

          <Text style={[styles.mediaGrande, isCompact && styles.mediaGrandeCompact]}>
            {summaryAccuracy.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
            <Text style={styles.mediaDecimal}>%</Text>
          </Text>
          <View style={styles.trendRow}>
            <Ionicons name={trendPositivo ? 'arrow-up' : 'arrow-down'} size={12} color={trendPositivo ? '#22C55E' : '#EF4444'} />
            <Text style={styles.trendTexto}>
              {formatPct(Math.abs(summaryAccuracyChange), 1)} vs {comparativoLabel}
            </Text>
          </View>

          <View style={[styles.acertosErros, isCompact && styles.acertosErrosCompact]}>
            <View style={styles.aeItem}>
              <Text style={styles.aeLabel}>Acertos</Text>
              <Text style={styles.aeValor}>{summaryCorrect}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${acertosPct}%`, backgroundColor: '#22C55E' }]} />
              </View>
            </View>
            <View style={styles.aeItem}>
              <Text style={styles.aeLabel}>Erros</Text>
              <Text style={styles.aeValor}>{summaryWrong}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${errosPct}%`, backgroundColor: '#EF4444' }]} />
              </View>
            </View>
          </View>

          <View style={[styles.insightBox, isCompact && styles.insightBoxCompact]}>
            <Ionicons name="bulb-outline" size={17} color={colors.primary} style={{ marginRight: 8, flexShrink: 0 }} />
            <Text style={styles.insightTexto}>
              Seu desempenho no período está em{' '}
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{formatPct(summaryAccuracy, 1)}</Text>
              {' '}com variação de{' '}
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{formatPct(summaryAccuracyChange, 1)}</Text>
              {' '}em relação ao {comparativoLabel}.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.performanceLink}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Desempenho')}
          >
            <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
            <Text style={styles.performanceLinkText}>Ver evolução por disciplina</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Provas anteriores ─────────────────────────────────────────── */}
      {user?.role === 'aluno' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Provas anteriores</Text>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Simulados', { screen: 'ProvasAnteriores' })
              }
            >
              <Text style={styles.sectionLink}>Ver todas</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {provasAnterioresRecentes.length === 0 ? (
              <View style={styles.simCardVazio}>
                <Text style={styles.simCardVazioTexto}>Nenhuma prova anterior disponível</Text>
              </View>
            ) : (
              provasAnterioresRecentes.map((p) => (
                <PastMaterialHomeCard
                  key={p.id}
                  item={p}
                  onPress={() =>
                    navigation.navigate('Simulados', {
                      screen: 'ProvaAnteriorDetalhe',
                      params: {
                        pastExamId: p.id,
                        listScreen: 'ProvasAnteriores',
                        materialKind: 'prova',
                      },
                    })
                  }
                />
              ))
            )}
          </ScrollView>
        </>
      )}

      {/* ── Meus simulados ────────────────────────────────────────────── */}
      {user?.role === 'aluno' && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meus simulados</Text>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Simulados', {
                  screen: 'SimuladosList',
                })
              }
            >
              <Text style={styles.sectionLink}>Ver todos</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {simuladosRecentes.length === 0 ? (
              <View style={styles.simCardVazio}>
                <Text style={styles.simCardVazioTexto}>Nenhum simulado disponível</Text>
              </View>
            ) : simuladosRecentes.map((s, index) => {
              const accent = SIM_CARD_ACCENTS[index % SIM_CARD_ACCENTS.length];
              const cor = SIM_STATUS_COLOR[s.attempt_status];
              const contadorDias = getSimuladoDayCounter(s);
              const notaDisplay =
                s.score_display ??
                (s.nota != null
                  ? s.nota.toLocaleString('pt-BR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 1,
                    })
                  : null);
              const aproveitamentoDisplay =
                s.aproveitamento != null
                  ? `${s.aproveitamento.toLocaleString('pt-BR', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 1,
                    })}%`
                  : null;
              const aproveitamentoAprovado =
                s.aproveitamento != null && s.passing_score != null
                  ? s.aproveitamento >= s.passing_score
                  : null;
              const aproveitamentoColor =
                aproveitamentoAprovado === true
                  ? '#22C55E'
                  : aproveitamentoAprovado === false
                  ? '#EF4444'
                  : colors.muted;
              const aproveitamentoIcon =
                aproveitamentoAprovado === true
                  ? 'checkmark-circle'
                  : aproveitamentoAprovado === false
                  ? 'close-circle'
                  : 'stats-chart-outline';
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.simCard,
                    isCompact && styles.simCardCompact,
                    {
                      width: simCardWidth,
                      backgroundColor: accent.soft,
                      borderColor: accent.border,
                      ...platformShadow({ color: accent.shadow, opacity: 0.1, radius: 14, elevation: 3 }),
                    },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('Simulados', {
                    screen: 'SimuladoDetalhe',
                    params: { examId: s.id },
                  })}
                >
                  <View style={styles.simTopo}>
                    <View style={[styles.simIconWrap, { backgroundColor: accent.main }]}>
                      <Ionicons
                        name={subjectIconName(s.subject?.icon ?? '') as any}
                        size={22}
                        color={colors.surface}
                      />
                    </View>
                    <View style={styles.simTopoInfo}>
                      {s.subject && (
                        <Text style={styles.simMateria} numberOfLines={1}>
                          {s.subject.name}
                        </Text>
                      )}
                      {contadorDias ? (
                        <View style={styles.simDaysPill}>
                          <Ionicons name="calendar-outline" size={11} color={accent.main} />
                          <Text style={[styles.simDaysText, { color: accent.main }]} numberOfLines={1}>{contadorDias}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.simTitulo} numberOfLines={2}>{s.title}</Text>

                  <View style={styles.simMetaRow}>
                    <View style={[styles.simBadge, { backgroundColor: cor }]}>
                      <Text style={styles.simBadgeTexto}>
                        {SIM_STATUS_LABEL[s.attempt_status]}
                      </Text>
                    </View>
                    {notaDisplay ? (
                      <View style={styles.simNotaPill}>
                        <Ionicons name="trophy-outline" size={11} color="#A16207" />
                        <Text style={styles.simNotaText} numberOfLines={1}>
                          {notaDisplay}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.simAproveitamentoBox}>
                    <View style={styles.simAproveitamentoHeader}>
                      <Ionicons
                        name={aproveitamentoIcon as any}
                        size={18}
                        color={aproveitamentoColor}
                      />
                      <View style={styles.simAproveitamentoTextos}>
                        <Text style={styles.simAproveitamentoLabel}>Aproveitamento</Text>
                        <Text style={styles.simAproveitamentoMinimo} numberOfLines={1}>
                          Mínimo: {s.passing_score ?? 0}%
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.simAproveitamentoValor,
                          { color: aproveitamentoColor },
                        ]}
                        numberOfLines={1}
                      >
                        {aproveitamentoDisplay ?? '--'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.simRodape}>
                    <View style={styles.simOpenButton}>
                      <Text style={[styles.simLink, { color: accent.main }]}>Abrir</Text>
                      <Ionicons name="arrow-forward" size={14} color={accent.main} />
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

const headerShadow = platformShadow({ color: '#7C3AED', opacity: 0.08, radius: 18, elevation: 3 });
const cardShadow = platformShadow({ color: '#000000', opacity: 0.04, radius: 8, elevation: 2 });
const cardShadowMd = platformShadow({ color: '#000000', opacity: 0.12, radius: 8, elevation: 2 });
const cardShadowLg = platformShadow({ color: '#000000', opacity: 0.12, radius: 18, elevation: 4 });
const simCardShadow = platformShadow({ color: '#6D4DE6', opacity: 0.08, radius: 16, elevation: 2 });
const avatarEditShadow = platformShadow({ color: '#000000', opacity: 0.14, radius: 8, elevation: 2 });
const simIconShadow = platformShadow({ color: '#000000', opacity: 0.12, radius: 8, elevation: 2 });

function createHomeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content:   { paddingBottom: 16 },

  // Header
  header: {
    backgroundColor: '#FBFAFF',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 26,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
    ...(headerShadow as object),
  },
  headerCompact: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerGlowPrimary: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    right: -120,
    top: -150,
    backgroundColor: '#F0E9FF',
    opacity: 0.88,
  },
  headerGlowSecondary: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    left: -76,
    top: 70,
    backgroundColor: '#F7F2FF',
    opacity: 0.95,
  },
  headerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
    gap: 12,
  },
  headerProfileRowCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
    marginBottom: 18,
  },
  menuBtnCompact: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  studentBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  studentBlockCompact: { width: '100%', alignItems: 'center' },
  headerIcons: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  headerIconsCompact: {
    alignSelf: 'flex-end',
    gap: 6,
    marginTop: 10,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#EEE8FF',
    position: 'relative',
  },
  iconBtnCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  notifBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.debit,
    borderWidth: 1.5,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.surface,
    lineHeight: 12,
  },
  avatarWrap:    { position: 'relative', marginRight: 18 },
  avatarWrapCompact: { marginRight: 12 },
  avatarCircle:  {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: '#E9DDFF', justifyContent: 'center', alignItems: 'center',
    borderWidth: 4, borderColor: '#F5F0FF', overflow: 'hidden',
  },
  avatarCircleCompact: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: colors.primary },
  avatarInitialsCompact: { fontSize: 26 },
  avatarEditBtn:  {
    position: 'absolute', bottom: 4, right: 4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#EEE8FF',
    ...(avatarEditShadow as object),
  },
  avatarEditBtnCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
    bottom: 2,
    right: 2,
  },
  userInfo:   { flex: 1, minWidth: 0 },
  userName:   { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 3 },
  userNameCompact: { fontSize: 22, lineHeight: 24 },
  userRole:   { fontSize: 14, color: '#525A76', marginBottom: 10 },
  userRoleCompact: { fontSize: 13, marginBottom: 6 },
  avatarFeedback: { fontSize: 12, color: colors.muted, marginBottom: 8 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.soft, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  levelText: { fontSize: 12, color: colors.primary, fontWeight: '600' },

  statsRow:  {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#F0EBFF',
  },
  statsRowCompact: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 2,
  },
  statItem:  { flex: 1, alignItems: 'center', gap: 5 },
  statBorder:{ borderRightWidth: 1, borderRightColor: '#E8E3F4' },
  statIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: { fontSize: 19, fontWeight: '800', color: '#111827' },
  statValueCompact: { fontSize: 17 },
  statLabel: { fontSize: 11, color: '#5F6680', textAlign: 'center', lineHeight: 14 },
  statLabelCompact: { fontSize: 10, lineHeight: 13 },

  // Card genérico
  card: {
    backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: 18, padding: 18,
    borderWidth: 1,
    borderColor: '#F0ECFA',
    ...(simCardShadow as object),
  },
  cardCompact: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 16,
    padding: 16,
  },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardHeaderCompact: { gap: 10 },
  cardHeaderLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  cardTitle:      { fontSize: 16, fontWeight: '700', color: colors.ink },
  periodoPicker:  {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FBFAFF', borderWidth: 1, borderColor: '#DED7EF',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
    flexShrink: 0,
  },
  periodoTexto: { fontSize: 13, color: colors.text, fontWeight: '500' },

  // Desempenho
  mediaGrande:  { fontSize: 40, fontWeight: '800', color: colors.ink },
  mediaGrandeCompact: { fontSize: 38 },
  mediaDecimal: { fontSize: 24, fontWeight: '600', color: colors.ink },
  trendRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  trendTexto:   { fontSize: 13, color: colors.muted, fontWeight: '500' },
  acertosErros: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  acertosErrosCompact: { gap: 14 },
  aeItem:       { flex: 1 },
  aeLabel:      { fontSize: 12, color: colors.muted, marginBottom: 2 },
  aeValor:      { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  progressBar:  { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#E6DDF9' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  insightBox:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FBFAFF',
    borderWidth: 1,
    borderColor: '#E4DAFF',
    borderRadius: 12,
    padding: 12, gap: 4,
  },
  insightBoxCompact: { padding: 11 },
  insightTexto: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  performanceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F5F0FF',
    borderWidth: 1,
    borderColor: '#E4DAFF',
  },
  performanceLinkText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: colors.ink },
  sectionLink:   { fontSize: 13, color: colors.primary, fontWeight: '700' },
  hScroll:       { paddingHorizontal: 16, gap: 12 },

  // Simulados
  simCard: {
    minHeight: 246, backgroundColor: colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border,
    flexDirection: 'column',
  },
  simCardCompact: {
    minHeight: 250,
    padding: 13,
  },
  simCardVazio: {
    width: 220, backgroundColor: colors.surface, borderRadius: 18, padding: 20,
    justifyContent: 'center', alignItems: 'center',
    ...(cardShadow as object),
  },
  simCardVazioTexto: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  simTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  simIconWrap: {
    width: 48, height: 48, borderRadius: 10, backgroundColor: colors.soft,
    justifyContent: 'center', alignItems: 'center',
    ...(simIconShadow as object),
  },
  simTopoInfo: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  simMateria: { fontSize: 11, fontWeight: '800', color: colors.muted },
  simTitulo:  { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12, lineHeight: 20, minHeight: 40 },
  simDaysPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    maxWidth: '100%',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  simDaysText: { fontSize: 10, fontWeight: '800', color: colors.muted },
  simMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  simRodape:  { marginTop: 'auto' as any },
  simBadge:   { alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  simBadgeTexto: { fontSize: 10, fontWeight: '800', color: colors.surface },
  simNotaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  simNotaText: { fontSize: 10, fontWeight: '800', color: '#A16207' },
  simAproveitamentoBox: {
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 12,
  },
  simAproveitamentoBoxOk: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  simAproveitamentoBoxFail: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  simAproveitamentoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simAproveitamentoTextos: {
    flex: 1,
    minWidth: 0,
  },
  simAproveitamentoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  simAproveitamentoLabel: { fontSize: 10, fontWeight: '800', color: colors.muted },
  simAproveitamentoValor: { fontSize: 16, fontWeight: '900', color: colors.muted, lineHeight: 20 },
  simAproveitamentoValorOk: { color: '#22C55E' },
  simAproveitamentoValorFail: { color: '#EF4444' },
  simAproveitamentoBar: {
    height: 5,
    borderRadius: 5,
    backgroundColor: '#E0F2FE',
    overflow: 'hidden',
    marginTop: 8,
  },
  simAproveitamentoFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#0284C7',
  },
  simAproveitamentoFillOk: {
    backgroundColor: '#22C55E',
  },
  simAproveitamentoFillFail: {
    backgroundColor: '#EF4444',
  },
  simAproveitamentoMinimo: { marginTop: 2, fontSize: 9, fontWeight: '700', color: colors.muted },
  simOpenButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 5,
  },
  simLink:    { fontSize: 13, fontWeight: '800', color: colors.primary },

  // Meta
  metaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, marginHorizontal: 16, marginTop: 16,
    borderRadius: 18, padding: 16, gap: 12,
    ...(cardShadow as object),
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
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0ECFA',
    ...(cardShadowLg as object),
  },
  logoutModalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoutModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  logoutModalText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
  },
  logoutModalActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  logoutCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutCancelText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '800',
  },
  logoutConfirmButton: {
    flex: 1,
    backgroundColor: colors.debit,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutConfirmText: {
    fontSize: 14,
    color: colors.surface,
    fontWeight: '800',
  },
  });
}
