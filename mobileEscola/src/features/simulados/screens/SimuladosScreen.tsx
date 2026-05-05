import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  listarSimulados,
  listarTentativas,
  SimuladoListItem,
  AttemptHistoryItem,
  AttemptStatus,
  subjectIconName,
} from '../../../services/simulados.service';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'SimuladosList'>;
type Aba = 'disponiveis' | 'historico';

const PRIMARY = '#4F46E5';
const INK = '#1E1B4B';
const TEXT = '#312E81';
const MUTED = '#64748B';
const SOFT = '#EEF2FF';
const BORDER = '#DDE3F5';
const SURFACE = '#FFFFFF';
const BACKGROUND = '#F6F7FB';

const STATUS_LABEL: Record<AttemptStatus, string> = {
  not_started:    'Disponível',
  in_progress:    'Em andamento',
  pending_review: 'Aguardando correção',
  awaiting_release: 'Aguardando liberação',
  completed:      'Concluído',
};

const STATUS_COLOR: Record<AttemptStatus, string> = {
  not_started:    '#10B981',
  in_progress:    '#F59E0B',
  pending_review: '#F59E0B',
  awaiting_release: '#0EA5E9',
  completed:      PRIMARY,
};

const STATUS_ICON: Record<AttemptStatus, React.ComponentProps<typeof Ionicons>['name']> = {
  not_started:    'play-circle-outline',
  in_progress:    'time-outline',
  pending_review: 'hourglass-outline',
  awaiting_release: 'lock-closed-outline',
  completed:      'checkmark-circle-outline',
};

const HIST_COLOR: Record<string, string> = {
  in_progress:    '#F59E0B',
  pending_review: '#F59E0B',
  awaiting_release: '#0EA5E9',
  completed:      PRIMARY,
  abandoned:      '#EF4444',
};
const HIST_LABEL: Record<string, string> = {
  in_progress:    'Em andamento',
  pending_review: 'Aguardando correção',
  awaiting_release: 'Aguardando liberação',
  completed:      'Concluído',
  abandoned:      'Abandonado',
};
const HIST_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  in_progress:    'time-outline',
  pending_review: 'hourglass-outline',
  awaiting_release: 'lock-closed-outline',
  completed:      'checkmark-circle-outline',
  abandoned:      'close-circle-outline',
};

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function SimuladosScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [aba, setAba] = useState<Aba>('disponiveis');

  // ── Disponíveis ────────────────────────────────────────────────────────────
  const [simulados, setSimulados]   = useState<SimuladoListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro]             = useState<string | null>(null);

  // ── Histórico ──────────────────────────────────────────────────────────────
  const [tentativas, setTentativas]         = useState<AttemptHistoryItem[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(true);
  const [atualizandoHist, setAtualizandoHist] = useState(false);
  const [erroHist, setErroHist]             = useState<string | null>(null);

  const carregarDisponiveis = useCallback(async (refreshing = false) => {
    if (refreshing) setAtualizando(true);
    else setCarregando(true);
    setErro(null);
    try {
      setSimulados(await listarSimulados());
    } catch (e: any) {
      setErro(e?.response?.data?.message ?? 'Não foi possível carregar os simulados.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  const carregarHistorico = useCallback(async (refreshing = false) => {
    if (refreshing) setAtualizandoHist(true);
    else setCarregandoHist(true);
    setErroHist(null);
    try {
      setTentativas(await listarTentativas());
    } catch (e: any) {
      setErroHist(e?.response?.data?.message ?? 'Não foi possível carregar o histórico.');
    } finally {
      setCarregandoHist(false);
      setAtualizandoHist(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    carregarDisponiveis();
    carregarHistorico();
  }, [carregarDisponiveis, carregarHistorico]));

  // ── Render: card disponível ────────────────────────────────────────────────
  function renderDisponivel({ item }: { item: SimuladoListItem }) {
    const cor   = STATUS_COLOR[item.attempt_status];
    const label = STATUS_LABEL[item.attempt_status];
    const icon  = STATUS_ICON[item.attempt_status];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SimuladoDetalhe', { examId: item.id })}
      >
        {item.subject && (
          <View style={[styles.cardAccent, { backgroundColor: item.subject.color }]} />
        )}
        <View style={styles.cardTopo}>
          <View style={styles.cardTopoEsq}>
            {item.subject && (
              <View style={[styles.subjectChip, { backgroundColor: item.subject.color + '22' }]}>
                <Ionicons name={subjectIconName(item.subject.icon) as any} size={12} color={item.subject.color} />
                <Text style={[styles.subjectNome, { color: item.subject.color }]}>{item.subject.name}</Text>
              </View>
            )}
            {item.exam_type_label ? (
              <View style={styles.tipoChip}>
                <Text style={styles.tipoTexto}>{item.exam_type_label}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.badge, { backgroundColor: cor + '20' }]}>
            <Ionicons name={icon} size={13} color={cor} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeTexto, { color: cor }]}>{label}</Text>
          </View>
        </View>
        {!item.can_start && item.attempt_status === 'not_started' && (
          <View style={styles.foraPeriodo}>
            <Ionicons name="lock-closed-outline" size={12} color={MUTED} />
            <Text style={styles.foraPeriodoTexto}>Fora do período</Text>
          </View>
        )}
        <Text style={styles.cardTitulo} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardRodape}>
          <View style={styles.infoItem}>
            <Ionicons name="help-circle-outline" size={14} color={MUTED} />
            <Text style={styles.infoTexto}>{item.total_questions} questões</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={14} color={MUTED} />
            <Text style={styles.infoTexto}>{formatMinutes(item.duration_minutes)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="ribbon-outline" size={14} color={MUTED} />
            <Text style={styles.infoTexto}>Mínimo {item.passing_score}%</Text>
          </View>
        </View>
        {item.ends_at && item.attempt_status !== 'completed' && (
          <View style={styles.prazoRow}>
            <Ionicons name="calendar-outline" size={12} color={MUTED} />
            <Text style={styles.prazoTexto}>Prazo: {formatDate(item.ends_at)}</Text>
          </View>
        )}
        {item.attempt_status === 'awaiting_release' && (
          <View style={styles.prazoRow}>
            <Ionicons name="lock-closed-outline" size={12} color="#0891B2" />
            <Text style={[styles.prazoTexto, { color: '#0891B2' }]}>Resultado bloqueado até o fechamento do período</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  // ── Render: card histórico ─────────────────────────────────────────────────
  function renderTentativa({ item }: { item: AttemptHistoryItem }) {
    const cor   = HIST_COLOR[item.status] ?? MUTED;
    const label = HIST_LABEL[item.status] ?? item.status;
    const icon  = HIST_ICON[item.status]  ?? 'ellipse-outline';
    const subj  = item.exam.subject;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SimuladoDetalhe', { examId: item.exam_id })}
      >
        {subj && <View style={[styles.cardAccent, { backgroundColor: subj.color }]} />}
        <View style={styles.cardTopo}>
          <View style={styles.cardTopoEsq}>
            {subj && (
              <View style={[styles.subjectChip, { backgroundColor: subj.color + '22' }]}>
                <Ionicons name={subjectIconName(subj.icon) as any} size={12} color={subj.color} />
                <Text style={[styles.subjectNome, { color: subj.color }]}>{subj.name}</Text>
              </View>
            )}
            {item.exam.exam_type_label ? (
              <View style={styles.tipoChip}>
                <Text style={styles.tipoTexto}>{item.exam.exam_type_label}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.badge, { backgroundColor: cor + '20' }]}>
            <Ionicons name={icon} size={13} color={cor} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeTexto, { color: cor }]}>{label}</Text>
          </View>
        </View>

        <Text style={styles.cardTitulo} numberOfLines={2}>{item.exam.title}</Text>

        {/* Métricas (só se concluído) */}
        {item.status === 'completed' && item.percentage !== null && (
          <View style={styles.histMetricas}>
            <View style={styles.histMetricaItem}>
              <Text style={[styles.histMetricaValor, { color: item.passed ? '#10B981' : '#EF4444' }]}>
                {item.percentage.toFixed(1)}%
              </Text>
              <Text style={styles.histMetricaLabel}>Aproveit.</Text>
            </View>
            <View style={styles.histMetricaSep} />
            <View style={styles.histMetricaItem}>
              <Text style={styles.histMetricaValor}>{item.score ?? 0}</Text>
              <Text style={styles.histMetricaLabel}>Pontos</Text>
            </View>
            <View style={styles.histMetricaSep} />
            <View style={styles.histMetricaItem}>
              <Text style={styles.histMetricaValor}>{item.max_score ?? 0}</Text>
              <Text style={styles.histMetricaLabel}>Máximo</Text>
            </View>
            <View style={styles.histMetricaSep} />
            <View style={styles.histMetricaItem}>
              <Ionicons
                name={item.passed ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={item.passed ? '#10B981' : '#EF4444'}
              />
              <Text style={[styles.histMetricaLabel, { color: item.passed ? '#10B981' : '#EF4444' }]}>
                {item.passed ? 'Aprovado' : 'Reprovado'}
              </Text>
            </View>
          </View>
        )}

        {/* Aguardando correção */}
        {(item.status === 'pending_review' || item.status === 'awaiting_release') && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
            <Ionicons name={item.status === 'awaiting_release' ? 'lock-closed-outline' : 'hourglass-outline'} size={14} color={item.status === 'awaiting_release' ? '#0891B2' : '#B45309'} />
            <Text style={{ fontSize: 12, color: item.status === 'awaiting_release' ? '#0891B2' : '#B45309' }}>
              {item.status === 'awaiting_release'
                ? 'Resultado aguardando liberação automática'
                : 'Aguardando correção manual pelo professor'}
            </Text>
          </View>
        )}

        <View style={styles.prazoRow}>
          <Ionicons name="calendar-outline" size={12} color={MUTED} />
          <Text style={styles.prazoTexto}>Iniciado: {formatDate(item.started_at)}</Text>
          {item.finished_at && (
            <Text style={[styles.prazoTexto, { marginLeft: 8 }]}>
              · Finalizado: {formatDate(item.finished_at)}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ── Header fixo ────────────────────────────────────────────────────────────
  const header = (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <Text style={styles.headerTitulo}>Simulados</Text>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, aba === 'disponiveis' && styles.tabAtiva]}
          onPress={() => setAba('disponiveis')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabTexto, aba === 'disponiveis' && styles.tabTextoAtivo]}>Disponíveis</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, aba === 'historico' && styles.tabAtiva]}
          onPress={() => setAba('historico')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabTexto, aba === 'historico' && styles.tabTextoAtivo]}>Histórico</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Aba Disponíveis ────────────────────────────────────────────────────────
  if (aba === 'disponiveis') {
    if (carregando) {
      return (
        <View style={styles.container}>
          {header}
          <View style={styles.centrado}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.carregandoTexto}>Carregando simulados…</Text>
          </View>
        </View>
      );
    }
    if (erro) {
      return (
        <View style={styles.container}>
          {header}
          <View style={styles.centrado}>
            <Ionicons name="cloud-offline-outline" size={48} color={BORDER} />
            <Text style={styles.erroTexto}>{erro}</Text>
            <TouchableOpacity style={styles.botaoTentar} onPress={() => carregarDisponiveis()} activeOpacity={0.8}>
              <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        {header}
        <FlatList
          data={simulados}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderDisponivel}
          style={{ flex: 1 }}
          contentContainerStyle={simulados.length === 0 ? styles.listaVazia : styles.lista}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={atualizando} onRefresh={() => carregarDisponiveis(true)} colors={[PRIMARY]} tintColor={PRIMARY} />
          }
          ListHeaderComponent={simulados.length > 0 ? (
            <Text style={styles.cabecalho}>{simulados.length} simulado{simulados.length !== 1 ? 's' : ''}</Text>
          ) : null}
          ListEmptyComponent={
            <View style={styles.vazio}>
              <Ionicons name="clipboard-outline" size={56} color={BORDER} />
              <Text style={styles.vazioTitulo}>Nenhum simulado disponível</Text>
              <Text style={styles.vazioSub}>Verifique sua matrícula ou tente mais tarde.</Text>
            </View>
          }
        />
      </View>
    );
  }

  // ── Aba Histórico ──────────────────────────────────────────────────────────
  if (carregandoHist) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centrado}>
        <ActivityIndicator size="large" color={PRIMARY} />
          <Text style={styles.carregandoTexto}>Carregando histórico…</Text>
        </View>
      </View>
    );
  }
  if (erroHist) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centrado}>
          <Ionicons name="cloud-offline-outline" size={48} color={BORDER} />
          <Text style={styles.erroTexto}>{erroHist}</Text>
          <TouchableOpacity style={styles.botaoTentar} onPress={() => carregarHistorico()} activeOpacity={0.8}>
            <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={tentativas}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTentativa}
        style={{ flex: 1 }}
        contentContainerStyle={tentativas.length === 0 ? styles.listaVazia : styles.lista}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={atualizandoHist} onRefresh={() => carregarHistorico(true)} colors={[PRIMARY]} tintColor={PRIMARY} />
        }
        ListHeaderComponent={tentativas.length > 0 ? (
          <Text style={styles.cabecalho}>{tentativas.length} tentativa{tentativas.length !== 1 ? 's' : ''}</Text>
        ) : null}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Ionicons name="time-outline" size={56} color={BORDER} />
            <Text style={styles.vazioTitulo}>Nenhuma tentativa ainda</Text>
            <Text style={styles.vazioSub}>Seus simulados realizados aparecerão aqui.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKGROUND },

  // Header + tabs
  headerWrap: {
    backgroundColor: INK,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, elevation: 4,
  },
  headerTitulo: { fontSize: 22, fontWeight: '800', color: SURFACE, paddingTop: 18, paddingBottom: 14 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(238,242,255,0.12)',
  },
  tabAtiva: { backgroundColor: SURFACE },
  tabTexto: { fontSize: 14, fontWeight: '700', color: '#CBD5E1' },
  tabTextoAtivo: { color: PRIMARY },

  lista:      { padding: 16, paddingTop: 12 },
  listaVazia: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cabecalho:  { fontSize: 13, color: MUTED, marginBottom: 12 },

  card: {
    backgroundColor: SURFACE, borderRadius: 18, padding: 16, paddingLeft: 20,
    marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTopoEsq: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  subjectChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  subjectNome: { fontSize: 11, fontWeight: '600' },
  tipoChip: { backgroundColor: SOFT, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20 },
  tipoTexto: { fontSize: 11, color: MUTED, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
  foraPeriodo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  foraPeriodoTexto: { fontSize: 11, color: MUTED },
  cardTitulo: { fontSize: 16, fontWeight: '700', color: INK, marginBottom: 12, lineHeight: 22 },
  cardRodape: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoTexto: { fontSize: 12, color: MUTED },
  prazoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  prazoTexto: { fontSize: 11, color: MUTED },

  // Histórico
  histMetricas: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: SOFT, borderRadius: 12, padding: 12,
    marginBottom: 10, gap: 0,
  },
  histMetricaItem: { flex: 1, alignItems: 'center' },
  histMetricaValor: { fontSize: 15, fontWeight: '700', color: INK },
  histMetricaLabel: { fontSize: 10, color: MUTED, marginTop: 2 },
  histMetricaSep: { width: 1, height: 32, backgroundColor: BORDER },

  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: BACKGROUND },
  carregandoTexto: { marginTop: 12, fontSize: 14, color: MUTED },
  erroTexto: { fontSize: 14, color: TEXT, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  botaoTentar: { marginTop: 20, backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  botaoTentarTexto: { color: '#fff', fontWeight: '600', fontSize: 15 },
  vazio: { alignItems: 'center', padding: 32 },
  vazioTitulo: { fontSize: 16, fontWeight: '700', color: INK, marginTop: 16, textAlign: 'center' },
  vazioSub: { fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
