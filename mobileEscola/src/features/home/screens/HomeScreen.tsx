import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '../../../context/AuthContext';
import { api } from '../../../services/api';
import { compressImageToMaxSize } from '../../../services/image-compression.service';
import { useSimuladosList } from '../../simulados/hooks';
import { uploadStudentPhoto } from '../../../services/student-photo.service';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import { useUnreadNotificationsCount } from '../../notifications/hooks';
import { enrollmentHeadline, primaryActiveEnrollment, type StudentActiveEnrollment } from '../../../types/student-enrollment';
import { examCardProps, isClosed, isDone, isUpcoming, daysLeft } from '../../simulados/lib/examCard';
import type { SimuladoListItem } from '../../../services/simulados.service';
import { font,
  AppBar, Button, Card, EmptyState, ExamCard, Icon, IconButton, LinkButton, Overline, ScreenBody, Section, SegmentedControl,
  StatTile, Tag, Txt, radius, space, type, usePalette, useLayoutMode,
} from '../../../ui';

type DashboardPeriod = 'month' | 'all';

interface AlunoDashboardMetrics {
  total_exams: number;
  avg_accuracy: number;
  current_streak_days: number;
  period: DashboardPeriod;
  summary: { accuracy: number; correct: number; wrong: number; accuracy_change: number | null };
  active_enrollments?: StudentActiveEnrollment[];
}

const PERIODS: DashboardPeriod[] = ['month', 'all'];

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('');
}

const fmt = (v: number, digits = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits });

/** Turmas de todas as matrículas ativas, sem repetir (pacote traz várias; plano, a turma da matrícula). */
function enrollmentClasses(enrollments: StudentActiveEnrollment[] | undefined): { id: number; name: string; course: string | null }[] {
  const seen = new Map<number, { id: number; name: string; course: string | null }>();
  for (const e of enrollments ?? []) {
    const list = e.school_classes.length > 0
      ? e.school_classes.map((c) => ({ id: c.id, name: c.name, course: c.course?.name ?? null }))
      : e.school_class ? [{ id: e.school_class.id, name: e.school_class.name, course: e.course?.name ?? null }] : [];
    list.forEach((c) => { if (!seen.has(c.id)) seen.set(c.id, c); });
  }
  return [...seen.values()];
}

/** Próximo simulado a fazer: em andamento primeiro, depois o de prazo mais curto. */
function nextExam(list: SimuladoListItem[]): SimuladoListItem | null {
  const open = list.filter((s) => !isDone(s) && !isClosed(s) && !isUpcoming(s) && s.can_start !== false);
  return open.sort((a, b) => {
    if (a.attempt_status === 'in_progress' && b.attempt_status !== 'in_progress') return -1;
    if (b.attempt_status === 'in_progress' && a.attempt_status !== 'in_progress') return 1;
    return (a.ends_at ? new Date(a.ends_at).getTime() : Infinity) - (b.ends_at ? new Date(b.ends_at).getTime() : Infinity);
  })[0] ?? null;
}

/** Início (protótipo "TelaInicio"): resumo do dia, um CTA vivo (accent) para o próximo simulado. */
export function HomeScreen() {
  const p = usePalette();
  const { user, refreshUserProfile } = useAuth();
  const navigation = useNavigation<any>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile } = useLayoutMode();
  const isAluno = user?.role === 'aluno';

  const { data: simulados = [], refetch: refetchSimulados, isRefetching } = useSimuladosList();
  const { data: unread = 0, refetch: refetchUnread } = useUnreadNotificationsCount(isAluno);

  useFocusEffect(React.useCallback(() => {
    if (isAluno) refetchUnread();
  }, [isAluno, refetchUnread]));

  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [dashboard, setDashboard] = useState<AlunoDashboardMetrics | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (!isAluno) return;
    setDashboardLoading(true);
    api.get('/api/aluno/dashboard', { params: { period } })
      .then(({ data }) => {
        const payload = (data?.body ?? data?.data ?? data) as AlunoDashboardMetrics;
        if (active) setDashboard(payload);
      })
      .catch(() => { if (active) setDashboard(null); })
      .finally(() => { if (active) setDashboardLoading(false); });
    return () => { active = false; };
  }, [period, isAluno, reloadKey]);

  // ── Foto do perfil ──
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarOverrideUrl, setAvatarOverrideUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  async function uploadPhoto(uri: string, fileName: string, mimeType: string) {
    if (!user?.student_id) return;
    setAvatarUploading(true);
    try {
      const compressed = await compressImageToMaxSize(uri, { maxSizeKb: 50 });
      const response = await uploadStudentPhoto({
        studentId: user.student_id, uri: compressed.uri, fileName: compressed.fileName || fileName, mimeType: compressed.mimeType || mimeType,
      });
      const url = response.body?.photo_url;
      if (url) setAvatarOverrideUrl(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`);
      await refreshUserProfile();
    } catch (error: any) {
      const apiMessage = error?.response?.data?.errors
        ? Object.values(error.response.data.errors as Record<string, string[]>).flat().join(' ')
        : error?.response?.data?.message ?? error?.message;
      Alert.alert('Não foi possível enviar sua foto', apiMessage ?? 'Tente novamente em instantes.');
    } finally {
      setAvatarUploading(false);
    }
  }

  function pickPhoto() {
    if (!isAluno || !user?.student_id) return;
    if (Platform.OS === 'web') {
      photoInputRef.current?.click();
      return;
    }
    (async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão necessária', 'Permita acesso à galeria para enviar sua foto.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      await uploadPhoto(asset.uri, asset.fileName ?? `student-${user.student_id}.jpg`, asset.mimeType ?? 'image/jpeg');
    })();
  }

  const avatarUrl = avatarOverrideUrl ?? (user as any)?.photo_url ?? (user as any)?.avatar_url ?? null;
  const enrollment = primaryActiveEnrollment(dashboard?.active_enrollments);
  const matricula = user?.student?.enrollment_number ?? enrollment?.enrollment_number ?? null;
  const classes = enrollmentClasses(dashboard?.active_enrollments);
  const rawFirst = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  // Cadastros em CAIXA ALTA: a saudação usa só a inicial maiúscula.
  const firstName = rawFirst ? rawFirst.charAt(0).toLocaleUpperCase('pt-BR') + rawFirst.slice(1).toLocaleLowerCase('pt-BR') : 'aluno';
  const summary = dashboard?.summary;
  const accuracy = summary?.accuracy ?? dashboard?.avg_accuracy ?? 0;
  const change = summary?.accuracy_change ?? 0;
  const next = isAluno ? nextExam(simulados) : null;
  const nextLeft = next ? daysLeft(next) : null;
  const nextProps = next ? examCardProps(next, p) : null;

  const openExam = (id: number) => navigation.navigate('Simulados', { screen: 'SimuladoDetalhe', params: { examId: id } });

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined}
        trailing={isAluno ? <IconButton icon="bell" label={unread ? `Notificações, ${unread} não lidas` : 'Notificações'} badge={unread > 0} onPress={() => navigation.navigate('Notificacoes')} /> : null}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetchSimulados(); setReloadKey((k) => k + 1); }} tintColor={p.brand} colors={[p.brand]} />}
      >
        <ScreenBody>
          {/* Olá */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[1] }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Alterar foto de perfil" disabled={avatarUploading || !isAluno} onPress={pickPhoto}
              style={{ width: 52, height: 52 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: p.surfaceSunken, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {avatarUploading ? <ActivityIndicator color={p.brand} />
                  : avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 52, height: 52 }} />
                  : <Text style={{ ...font.extrabold, fontSize: 16, color: p.inkMuted }}>{getInitials(user?.name ?? 'U')}</Text>}
              </View>
              {isAluno && !avatarUploading ? (
                <View style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="camera" size={12} color={p.inkMuted} />
                </View>
              ) : null}
              {Platform.OS === 'web' ? (
                // @ts-ignore — input HTML só existe no react-native-web
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                  onChange={(event: any) => {
                    const file: File | undefined = event?.target?.files?.[0];
                    if (!file) return;
                    void uploadPhoto(URL.createObjectURL(file), file.name, file.type || 'image/jpeg').finally(() => {
                      if (photoInputRef.current) photoInputRef.current.value = '';
                    });
                  }} />
              ) : null}
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="titleLg" numberOfLines={1}>Olá, {firstName}</Txt>
              <Txt variant="bodySm" tone="subtle" numberOfLines={1}>
                {[matricula ? `Matrícula ${matricula}` : null, enrollment ? enrollmentHeadline(enrollment) : null].filter(Boolean).join(' · ') || 'Bem-vindo de volta'}
              </Txt>
            </View>
          </View>

          {/* Próximo simulado: o único accent da tela */}
          {next && nextProps ? (
            <Card padding="lg" style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] }}>
                <Overline>{next.attempt_status === 'in_progress' ? 'Simulado em andamento' : 'Próximo simulado'}</Overline>
                {nextLeft !== null && nextLeft >= 0 ? (
                  <Tag tone={nextLeft <= 3 ? 'accent' : 'neutral'} icon="calendar"
                    label={nextLeft === 0 ? 'Vence hoje' : `${nextLeft} ${nextLeft === 1 ? 'dia restante' : 'dias restantes'}`} />
                ) : null}
              </View>
              <Txt variant="title" style={{ fontSize: 20, lineHeight: 26 }}>{next.title}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <Tag tone="outline" dot={nextProps.subjectColor} label={nextProps.subject} />
                <Txt variant="bodySm" tone="subtle">{nextProps.meta.slice(0, 2).join(' · ')}</Txt>
              </View>
              <Button variant="accent" block icon="play" label={next.attempt_status === 'in_progress' ? 'Continuar simulado' : 'Iniciar simulado'} onPress={() => openExam(next.id)} />
            </Card>
          ) : null}

          {/* Turmas das matrículas ativas (pacote mostra todas as incluídas) */}
          {isAluno && classes.length > 0 ? (
            <Section title={classes.length === 1 ? 'Minha turma' : 'Minhas turmas'}>
              <Card style={{ gap: space[3] }}>
                {enrollment?.bundle ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                    <Tag tone="neutral" icon="grid" label="Pacote" />
                    <Txt variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{enrollment.bundle.name}</Txt>
                    {enrollment.bundle.cycle_label ? (
                      <Txt variant="bodySm" tone="subtle">· Cobrança {enrollment.bundle.cycle_label.toLowerCase()}</Txt>
                    ) : null}
                  </View>
                ) : null}
                {classes.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                    <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: p.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="graduation" size={16} color={p.inkMuted} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="label" numberOfLines={2}>{c.name}</Txt>
                      {c.course ? <Txt variant="bodySm" tone="subtle" numberOfLines={1}>{c.course}</Txt> : null}
                    </View>
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}

          {/* Desempenho */}
          {isAluno ? (
            <Section title="Desempenho">
              <Card>
                <SegmentedControl label="Período" options={['Este mês', 'Período geral']} value={PERIODS.indexOf(period)} onChange={(i) => setPeriod(PERIODS[i])} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space[4] }}>
                  <Text style={[type.display, { color: p.ink }]}>
                    {fmt(accuracy)}<Text style={{ fontSize: 22, ...font.bold }}>%</Text>
                  </Text>
                  {dashboardLoading ? <ActivityIndicator color={p.brand} />
                    : <Tag tone={change >= 0 ? 'success' : 'danger'} icon={change >= 0 ? 'arrow-right' : 'arrow-left'} label={`${change >= 0 ? '+' : '−'}${fmt(Math.abs(change))} p.p.`} />}
                </View>
                <Txt variant="bodySm" tone="subtle" style={{ marginTop: 2, marginBottom: 14 }}>
                  Aproveitamento médio nos simulados{period === 'month' ? ' · comparado ao mês anterior' : ''}
                </Txt>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <StatTile label="Acertos" value={String(summary?.correct ?? 0)} />
                  <StatTile label="Erros" value={String(summary?.wrong ?? 0)} />
                </View>
                <Button variant="secondary" block iconRight="chevron-right" label="Evolução por disciplina" style={{ marginTop: space[3] }}
                  onPress={() => navigation.navigate('Desempenho')} />
              </Card>
            </Section>
          ) : null}

          {/* Meus simulados */}
          {isAluno ? (
            <Section title="Meus simulados" action={<LinkButton label="Ver todos" onPress={() => navigation.navigate('Simulados', { screen: 'SimuladosList' })} />}>
              {simulados.length === 0 ? (
                <EmptyState icon="clipboard" title="Nenhum simulado por enquanto" text="Quando a escola publicar simulados para a sua turma, eles aparecem aqui." />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[4] }}
                  contentContainerStyle={{ gap: space[3], paddingHorizontal: space[4], paddingVertical: 2 }}>
                  {simulados.slice(0, 8).map((s) => (
                    <ExamCard key={s.id} {...examCardProps(s, p)} style={{ width: 288 }} onPress={() => openExam(s.id)} />
                  ))}
                </ScrollView>
              )}
            </Section>
          ) : null}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
