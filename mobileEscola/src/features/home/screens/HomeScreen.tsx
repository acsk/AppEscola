import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';
import { listarSimulados, SimuladoListItem, AttemptStatus, subjectIconName } from '../../../services/simulados.service';
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

const STATS = [
  { icon: 'book-outline',        value: '230', label: 'Simulados\nrealizados' },
  { icon: 'trending-up-outline', value: '87%', label: 'Precisão\nmédia' },
  { icon: 'flame-outline',       value: '12',  label: 'Dias de\nstreak' },
  { icon: 'ribbon-outline',      value: '15',  label: 'Conquistas' },
];

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

const CONQUISTAS = [
  { id: 1, icon: 'rocket-outline',       bg: colors.primary,   label: 'Primeiro\nSimulado',  date: '10/01/2024', locked: false },
  { id: 2, icon: 'calculator-outline',   bg: '#4338CA', label: 'Nota\nPerfeita',      date: '25/01/2024', locked: false },
  { id: 3, icon: 'trophy-outline',       bg: '#6366F1', label: 'Foco no\nObjetivo',   date: '05/02/2024', locked: false },
  { id: 4, icon: 'star-outline',         bg: colors.text, label: 'Dedicação\nTotal',    date: '20/02/2024', locked: false },
  { id: 5, icon: 'lock-closed-outline',  bg: '#94A3B8', label: 'Em breve',            date: '',           locked: true  },
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
  const { user, signOut } = useAuth();
  const navigation = useNavigation<any>();

  const [simuladosRecentes, setSimuladosRecentes] = useState<SimuladoListItem[]>([]);

  useEffect(() => {
    if (user?.role === 'aluno') {
      listarSimulados().then((lista) => setSimuladosRecentes(lista.slice(0, 3))).catch(() => {});
    }
  }, [user?.role]);

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

  const initials  = getInitials(user?.name ?? 'U');
  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? '-';
  const avatarUrl = (user as any)?.avatar_url ?? (user as any)?.avatar ?? (user as any)?.photo_url;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerProfileRow}>
          <View style={styles.studentBlock}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarCircle}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
              </View>
              <View style={styles.avatarEditBtn}>
                <Ionicons name="pencil" size={12} color={colors.ink} />
              </View>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={2}>{user?.name ?? 'Usuário'}</Text>
              <Text style={styles.userRole}>{roleLabel}</Text>
              <View style={styles.levelBadge}>
                <Ionicons name="star" size={11} color={colors.primary} />
                <Text style={styles.levelText} numberOfLines={1}>Nível 7 – Destaque da Turma</Text>
              </View>
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
          {STATS.map((s, i) => (
            <View key={i} style={[styles.statItem, i < STATS.length - 1 && styles.statBorder]}>
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
          <View style={styles.periodoPicker}>
            <Text style={styles.periodoTexto}>Este mês</Text>
            <Ionicons name="chevron-down" size={13} color={colors.text} />
          </View>
        </View>

        <Text style={styles.mediaGrande}>87<Text style={styles.mediaDecimal}>,3%</Text></Text>
        <View style={styles.trendRow}>
          <Ionicons name="arrow-up" size={12} color={colors.muted} />
          <Text style={styles.trendTexto}>5,2% vs mês anterior</Text>
        </View>

        <View style={styles.acertosErros}>
          <View style={styles.aeItem}>
            <Text style={styles.aeLabel}>Acertos</Text>
            <Text style={styles.aeValor}>213</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '87%' }]} />
            </View>
          </View>
          <View style={styles.aeItem}>
            <Text style={styles.aeLabel}>Erros</Text>
            <Text style={styles.aeValor}>17</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '13%' }]} />
            </View>
          </View>
        </View>

        <View style={styles.insightBox}>
          <Ionicons name="bulb-outline" size={17} color={colors.muted} style={{ marginRight: 8, flexShrink: 0 }} />
          <Text style={styles.insightTexto}>
            Você está indo muito bem! Seu desempenho está{' '}
            <Text style={{ color: colors.ink, fontWeight: '700' }}>15% acima</Text>
            {' '}da média da turma.
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

      {/* ── Meta em andamento ─────────────────────────────────────────── */}
      <TouchableOpacity style={styles.metaCard} activeOpacity={0.85}>
        <View style={styles.metaIconWrap}>
          <Ionicons name="trophy-outline" size={24} color={colors.ink} />
        </View>
        <View style={styles.metaInfo}>
          <Text style={styles.metaSubtitulo}>Meta em andamento</Text>
          <Text style={styles.metaTitulo}>Concluir 300 simulados</Text>
          <View style={styles.metaBar}>
            <View style={[styles.metaBarFill, { width: '77%' }]} />
          </View>
          <Text style={styles.metaNumeros}>230 / 300</Text>
        </View>
        <Text style={styles.metaPct}>77%</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </TouchableOpacity>

      {/* ── Minhas conquistas ─────────────────────────────────────────── */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Minhas conquistas</Text>
        <TouchableOpacity><Text style={styles.sectionLink}>Ver todas</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
        {CONQUISTAS.map((c) => (
          <View key={c.id} style={styles.conquItem}>
            <View style={[styles.conquBadge, { backgroundColor: c.bg }, c.locked && styles.conquLocked]}>
              <Ionicons name={c.icon as any} size={26} color={colors.surface} />
            </View>
            <Text style={styles.conquLabel}>{c.label}</Text>
            {c.date
              ? <Text style={styles.conquDate}>{c.date}</Text>
              : <Text style={styles.conquEmBreve}>Em breve</Text>}
          </View>
        ))}
      </ScrollView>

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

  // Conquistas
  conquItem:  { alignItems: 'center', width: 80 },
  conquBadge: {
    width: 64, height: 64, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  conquLocked: { opacity: 0.5 },
  conquLabel:  { fontSize: 11, color: colors.text, textAlign: 'center', lineHeight: 14 },
  conquDate:   { fontSize: 10, color: colors.muted, textAlign: 'center', marginTop: 2 },
  conquEmBreve:{ fontSize: 10, color: colors.muted, fontWeight: '600', textAlign: 'center', marginTop: 2 },

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
