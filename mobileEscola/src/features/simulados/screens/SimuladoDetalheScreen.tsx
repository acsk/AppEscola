import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  detalharSimulado,
  iniciarSimulado,
  SimuladoDetail,
  subjectIconName,
} from '../../../services/simulados.service';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'SimuladoDetalhe'>;

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

export function SimuladoDetalheScreen({ route, navigation }: Props) {
  const { examId } = route.params;

  const [detalhe, setDetalhe]     = useState<SimuladoDetail | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroMsg, setErroMsg]     = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [erroAcao, setErroAcao]   = useState<string | null>(null);

  useEffect(() => { carregar(); }, [examId]);

  async function carregar() {
    setCarregando(true);
    setErroMsg(null);
    try {
      const d = await detalharSimulado(examId);
      setDetalhe(d);
      navigation.setOptions({ title: d.title });
    } catch (e: any) {
      setErroMsg(e?.response?.data?.message ?? 'Não foi possível carregar o simulado.');
    } finally {
      setCarregando(false);
    }
  }

  async function handleIniciar() {
    if (!detalhe) return;
    setIniciando(true);
    setErroAcao(null);
    try {
      const attempt = await iniciarSimulado(detalhe.id);
      navigation.replace('SimuladoExam', {
        examId: detalhe.id,
        attemptId: attempt.id,
        examTitle: detalhe.title,
      });
    } catch (e: any) {
      const apiErrors = e?.response?.data?.body?.errors ?? e?.response?.data?.errors;
      const msg = apiErrors
        ? Object.values(apiErrors as Record<string, string[]>).flat().join(' ')
        : (e?.response?.data?.message ?? 'Não foi possível iniciar o simulado.');
      setErroAcao(msg);
    } finally {
      setIniciando(false);
    }
  }

  function handleContinuar() {
    if (!detalhe?.attempt_id) return;
    navigation.replace('SimuladoExam', {
      examId: detalhe.id,
      attemptId: detalhe.attempt_id,
      examTitle: detalhe.title,
    });
  }

  // ── Carregando ──────────────────────────────────────────────────────────────
  if (carregando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={styles.carregandoTexto}>Carregando simulado…</Text>
      </View>
    );
  }

  // ── Erro ────────────────────────────────────────────────────────────────────
  if (erroMsg || !detalhe) {
    return (
      <View style={styles.centrado}>
        <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
        <Text style={styles.erroTexto}>{erroMsg ?? 'Simulado não encontrado.'}</Text>
        <TouchableOpacity style={styles.botaoTentar} onPress={carregar} activeOpacity={0.8}>
          <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const subjectColor  = detalhe.subject?.color ?? '#4F46E5';
  const emAndamento   = detalhe.attempt_status === 'in_progress';
  const podeComecar   = detalhe.can_start && detalhe.attempt_status === 'not_started';
  const novaTentativa = detalhe.can_start && detalhe.attempt_status === 'completed';
  const concluido     = detalhe.attempt_status === 'completed' && !detalhe.can_start;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.card, { borderTopWidth: 4, borderTopColor: subjectColor }]}>

        {/* Chips: disciplina + tipo + status */}
        <View style={styles.chipsRow}>
          {detalhe.subject && (
            <View style={[styles.chip, { backgroundColor: subjectColor + '18' }]}>
              <Ionicons name={subjectIconName(detalhe.subject.icon) as any} size={13} color={subjectColor} />
              <Text style={[styles.chipTexto, { color: subjectColor }]}>{detalhe.subject.name}</Text>
            </View>
          )}
          {detalhe.exam_type_label ? (
            <View style={styles.chipGray}>
              <Text style={styles.chipGrayTexto}>{detalhe.exam_type_label}</Text>
            </View>
          ) : null}
          {detalhe.status_label ? (
            <View style={[styles.chip, { backgroundColor: '#ECFDF5' }]}>
              <Text style={[styles.chipTexto, { color: '#059669' }]}>{detalhe.status_label}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.titulo}>{detalhe.title}</Text>

        {detalhe.course && (
          <View style={styles.cursoRow}>
            <Ionicons name="school-outline" size={14} color="#9CA3AF" />
            <Text style={styles.cursoTexto}>{detalhe.course.name}</Text>
          </View>
        )}

        {detalhe.description ? (
          <Text style={styles.descricao}>{detalhe.description}</Text>
        ) : null}

        {/* Grade de métricas */}
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Ionicons name="help-circle-outline" size={22} color="#4F46E5" />
            <Text style={styles.gridValor}>{detalhe.total_questions}</Text>
            <Text style={styles.gridLabel}>Questões</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="time-outline" size={22} color="#10B981" />
            <Text style={styles.gridValor}>{formatMinutes(detalhe.duration_minutes)}</Text>
            <Text style={styles.gridLabel}>Duração</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="ribbon-outline" size={22} color="#F59E0B" />
            <Text style={styles.gridValor}>{detalhe.passing_score}%</Text>
            <Text style={styles.gridLabel}>Para passar</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="star-outline" size={22} color="#7C3AED" />
            <Text style={styles.gridValor}>{detalhe.total_points}</Text>
            <Text style={styles.gridLabel}>Pontos</Text>
          </View>
        </View>

        {/* Datas */}
        {detalhe.starts_at && (
          <View style={styles.dataRow}>
            <Ionicons name="play-circle-outline" size={15} color="#6B7280" />
            <Text style={styles.dataTexto}>Início: {formatDate(detalhe.starts_at)}</Text>
          </View>
        )}
        {detalhe.ends_at && (
          <View style={styles.dataRow}>
            <Ionicons name="alarm-outline" size={15} color="#EF4444" />
            <Text style={[styles.dataTexto, { color: '#EF4444' }]}>Prazo: {formatDate(detalhe.ends_at)}</Text>
          </View>
        )}

        {/* Erro de ação (ex: iniciar falhou) */}
        {erroAcao ? (
          <View style={styles.erroInline}>
            <Ionicons name="alert-circle-outline" size={15} color="#DC2626" style={{ marginRight: 6 }} />
            <Text style={styles.erroInlineTexto}>{erroAcao}</Text>
          </View>
        ) : null}

        {/* Ação principal */}
        {emAndamento ? (
          <TouchableOpacity
            style={[styles.botaoAcao, { backgroundColor: subjectColor }]}
            onPress={handleContinuar}
            activeOpacity={0.8}
          >
            <Ionicons name="play-forward" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.botaoAcaoTexto}>Continuar simulado</Text>
          </TouchableOpacity>
        ) : concluido ? (
          <View style={[styles.banner, { backgroundColor: '#EDE9FE' }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#7C3AED" style={{ marginRight: 8 }} />
            <Text style={[styles.bannerTexto, { color: '#7C3AED' }]}>Simulado concluído</Text>
          </View>
        ) : (podeComecar || novaTentativa) ? (
          <TouchableOpacity
            style={[styles.botaoAcao, { backgroundColor: subjectColor }, iniciando && styles.botaoDisabled]}
            onPress={handleIniciar}
            disabled={iniciando}
            activeOpacity={0.8}
          >
            {iniciando
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons
                    name={novaTentativa ? 'refresh' : 'play'}
                    size={18} color="#fff"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.botaoAcaoTexto}>
                    {novaTentativa ? 'Nova tentativa' : 'Iniciar simulado'}
                  </Text>
                </>}
          </TouchableOpacity>
        ) : (
          <View style={[styles.banner, { backgroundColor: '#FEF9C3' }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#B45309" style={{ marginRight: 8 }} />
            <Text style={[styles.bannerTexto, { color: '#B45309' }]}>Fora do período permitido</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  content:   { padding: 16 },

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

  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2,
  },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  chipTexto:     { fontSize: 12, fontWeight: '600' },
  chipGray:      { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipGrayTexto: { fontSize: 12, fontWeight: '500', color: '#6B7280' },

  titulo:    { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  cursoRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cursoTexto:{ fontSize: 13, color: '#6B7280' },
  descricao: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 16 },

  grid: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#F9FAFB', borderRadius: 14, padding: 14, marginBottom: 14,
  },
  gridItem:  { alignItems: 'center', flex: 1, gap: 4 },
  gridValor: { fontSize: 16, fontWeight: '700', color: '#111827' },
  gridLabel: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },

  dataRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  dataTexto: { fontSize: 13, color: '#6B7280' },

  botaoAcao: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginTop: 16,
  },
  botaoAcaoTexto: { color: '#fff', fontWeight: '600', fontSize: 16 },
  botaoDisabled:  { opacity: 0.6 },

  banner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 14, marginTop: 16,
  },
  bannerTexto: { fontSize: 14, fontWeight: '600' },

  erroInline: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 10, padding: 12, marginTop: 12,
  },
  erroInlineTexto: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },
});
