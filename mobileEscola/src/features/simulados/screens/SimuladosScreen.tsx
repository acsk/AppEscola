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
  SimuladoListItem,
  AttemptStatus,
  subjectIconName,
} from '../../../services/simulados.service';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'SimuladosList'>;

const STATUS_LABEL: Record<AttemptStatus, string> = {
  not_started: 'Disponível',
  in_progress: 'Em andamento',
  completed:   'Concluído',
};

const STATUS_COLOR: Record<AttemptStatus, string> = {
  not_started: '#10B981',
  in_progress: '#F59E0B',
  completed:   '#4F46E5',
};

const STATUS_ICON: Record<AttemptStatus, React.ComponentProps<typeof Ionicons>['name']> = {
  not_started: 'play-circle-outline',
  in_progress: 'time-outline',
  completed:   'checkmark-circle-outline',
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
  const [simulados, setSimulados] = useState<SimuladoListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (refreshing = false) => {
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

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  function renderItem({ item }: { item: SimuladoListItem }) {
    const cor   = STATUS_COLOR[item.attempt_status];
    const label = STATUS_LABEL[item.attempt_status];
    const icon  = STATUS_ICON[item.attempt_status];
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('SimuladoDetalhe', { examId: item.id, examTitle: item.title })}
      >
        {/* Barra lateral colorida pela disciplina */}
        {item.subject && (
          <View style={[styles.cardAccent, { backgroundColor: item.subject.color }]} />
        )}

        {/* Linha superior: disciplina + tipo | status */}
        <View style={styles.cardTopo}>
          <View style={styles.cardTopoEsq}>
            {item.subject && (
              <View style={[styles.subjectChip, { backgroundColor: item.subject.color + '22' }]}>
                <Ionicons
                  name={subjectIconName(item.subject.icon) as any}
                  size={12}
                  color={item.subject.color}
                />
                <Text style={[styles.subjectNome, { color: item.subject.color }]}>
                  {item.subject.name}
                </Text>
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
            <Ionicons name="lock-closed-outline" size={12} color="#9CA3AF" />
            <Text style={styles.foraPeriodoTexto}>Fora do período</Text>
          </View>
        )}

        <Text style={styles.cardTitulo} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardRodape}>
          <View style={styles.infoItem}>
            <Ionicons name="help-circle-outline" size={14} color="#6B7280" />
            <Text style={styles.infoTexto}>{item.total_questions} questões</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={14} color="#6B7280" />
            <Text style={styles.infoTexto}>{formatMinutes(item.duration_minutes)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="ribbon-outline" size={14} color="#6B7280" />
            <Text style={styles.infoTexto}>Mínimo {item.passing_score}%</Text>
          </View>
        </View>
        {item.ends_at && item.attempt_status !== 'completed' && (
          <View style={styles.prazoRow}>
            <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
            <Text style={styles.prazoTexto}>Prazo: {formatDate(item.ends_at)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (carregando) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitulo}>Simulados</Text>
        </View>
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.carregandoTexto}>Carregando simulados…</Text>
        </View>
      </View>
    );
  }

  if (erro) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitulo}>Simulados</Text>
        </View>
        <View style={styles.centrado}>
          <Ionicons name="cloud-offline-outline" size={48} color="#D1D5DB" />
          <Text style={styles.erroTexto}>{erro}</Text>
          <TouchableOpacity style={styles.botaoTentar} onPress={() => carregar()} activeOpacity={0.8}>
            <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Simulados</Text>
      </View>
    <FlatList
      data={simulados}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderItem}
      style={{ flex: 1 }}
      contentContainerStyle={simulados.length === 0 ? styles.listaVazia : styles.lista}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={() => carregar(true)}
          colors={['#4F46E5']}
          tintColor="#4F46E5"
        />
      }
      ListHeaderComponent={
        simulados.length > 0 ? (
          <Text style={styles.cabecalho}>
            {simulados.length} simulado{simulados.length !== 1 ? 's' : ''}
          </Text>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.vazio}>
          <Ionicons name="clipboard-outline" size={56} color="#D1D5DB" />
          <Text style={styles.vazioTitulo}>Nenhum simulado disponível</Text>
          <Text style={styles.vazioSub}>
            Verifique sua matrícula ou tente mais tarde.
          </Text>
        </View>
      }
    />
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitulo: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  lista:      { padding: 16, paddingTop: 12 },
  listaVazia: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cabecalho:  { fontSize: 13, color: '#6B7280', marginBottom: 12 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, paddingLeft: 20,
    marginBottom: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
  },
  cardTopo: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  cardTopoEsq: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1,
  },
  subjectChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  subjectNome: { fontSize: 11, fontWeight: '600' },
  tipoChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20,
  },
  tipoTexto: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  badgeTexto: { fontSize: 12, fontWeight: '600' },
  foraPeriodo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  foraPeriodoTexto: { fontSize: 11, color: '#9CA3AF' },
  cardTitulo: {
    fontSize: 16, fontWeight: '600', color: '#111827',
    marginBottom: 12, lineHeight: 22,
  },
  cardRodape: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  infoItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoTexto:  { fontSize: 12, color: '#6B7280' },
  prazoRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  prazoTexto: { fontSize: 11, color: '#9CA3AF' },

  centrado: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, backgroundColor: '#F3F4F6',
  },
  carregandoTexto: { marginTop: 12, fontSize: 14, color: '#6B7280' },
  erroTexto: {
    fontSize: 14, color: '#374151', textAlign: 'center',
    marginTop: 12, lineHeight: 20,
  },
  botaoTentar: {
    marginTop: 20, backgroundColor: '#4F46E5',
    borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12,
  },
  botaoTentarTexto: { color: '#fff', fontWeight: '600', fontSize: 15 },

  vazio: { alignItems: 'center', padding: 32 },
  vazioTitulo: {
    fontSize: 16, fontWeight: '600', color: '#374151',
    marginTop: 16, textAlign: 'center',
  },
  vazioSub: {
    fontSize: 13, color: '#9CA3AF',
    textAlign: 'center', marginTop: 8, lineHeight: 18,
  },
});
