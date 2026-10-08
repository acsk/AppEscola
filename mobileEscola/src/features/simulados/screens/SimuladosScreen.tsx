import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import type { SimuladoListItem } from '../../../services/simulados.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useSimuladosList } from '../hooks';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import { daysLeft, deadlineLabel, examCardProps, isClosed, isDone, isUpcoming } from '../lib/examCard';
import { SimuladoDetailPanel } from '../components/SimuladoDetailPanel';
import {
  AppBar, Button, EmptyState, ExamCard, IconButton, Notice, Overline, QuickAction, ScreenBody, SegmentedControl, space, usePalette, useLayoutMode, PageBody, PageHeader, Card, StatTile, ExamRow, ExamTableHead, SelectButton, layout,
} from '../../../ui';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'SimuladosList'>;

const byDeadline = (a: SimuladoListItem, b: SimuladoListItem) =>
  (a.ends_at ? new Date(a.ends_at).getTime() : Infinity) - (b.ends_at ? new Date(b.ends_at).getTime() : Infinity);

/** Simulados (protótipo "TelaSimulados"): pendentes agrupados por urgência, concluídos e encerrados. */
export function SimuladosScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile } = useLayoutMode();
  const [tab, setTab] = useState(0);
  // Desktop: abas com "Todos", filtro de disciplina e simulado selecionado (detalhe ao lado).
  const { isDesktop } = useLayoutMode();
  const [deskTab, setDeskTab] = useState(1);
  const [subjectFilter, setSubjectFilter] = useState<number | 0>(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: all = [], isLoading, isRefetching, isError, error, refetch } = useSimuladosList();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const groups = useMemo(() => {
    const done = all.filter(isDone);
    const closed = all.filter(isClosed);
    const pending = all.filter((s) => !isDone(s) && !isClosed(s));
    const upcoming = pending.filter(isUpcoming).sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
    const open = pending.filter((s) => !isUpcoming(s)).sort(byDeadline);
    const urgent = open.filter((s) => {
      const left = daysLeft(s);
      return left !== null && left >= 0 && left <= 3;
    });
    const available = open.filter((s) => !urgent.includes(s));
    const scores = done.map((s) => s.aproveitamento).filter((v): v is number => v != null);
    const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { done, closed, pending, upcoming, urgent, available, average };
  }, [all]);

  const open = (s: SimuladoListItem) => navigation.navigate('SimuladoDetalhe', { examId: s.id });
  const subtitle = [
    `${groups.pending.length} ${groups.pending.length === 1 ? 'pendente' : 'pendentes'}`,
    groups.average != null ? `média ${groups.average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : null,
  ].filter(Boolean).join(' · ');

  const renderGroup = (title: string, items: SimuladoListItem[]) => items.length ? (
    <View key={title} style={{ gap: space[3] }}>
      <Overline>{title}</Overline>
      {items.map((s) => <ExamCard key={s.id} {...examCardProps(s, p)} onPress={() => open(s)} />)}
    </View>
  ) : null;

  if (isDesktop) {
    const subjects = Array.from(new Map(all.filter((s) => s.subject).map((s) => [s.subject!.id, s.subject!.name])).entries());
    const bySubject = (list: SimuladoListItem[]) => (subjectFilter ? list.filter((s) => s.subject?.id === subjectFilter) : list);
    const tabSections: [string, SimuladoListItem[]][] = (
      deskTab === 1 ? [['Vence em até 3 dias', groups.urgent], ['Disponíveis', groups.available], ['Próximos', groups.upcoming]]
        : deskTab === 2 ? [['Concluídos', groups.done]]
        : deskTab === 3 ? [['Encerrados', groups.closed]]
        : [['Vence em até 3 dias', groups.urgent], ['Disponíveis', groups.available], ['Próximos', groups.upcoming], ['Concluídos', groups.done], ['Encerrados', groups.closed]]
    ) as [string, SimuladoListItem[]][];
    const sections = tabSections.map(([t, l]) => [t, bySubject(l)] as [string, SimuladoListItem[]]).filter(([, l]) => l.length);
    const visible = sections.flatMap(([, l]) => l);
    const selected = visible.find((s) => s.id === selectedId) ?? visible[0] ?? null;
    const nextDeadline = [...groups.urgent, ...groups.available].find((s) => s.ends_at);
    const nextLabel = nextDeadline?.ends_at
      ? new Date(nextDeadline.ends_at).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '').replace(/^./, (c) => c.toUpperCase())
      : '—';
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} />}>
        <PageBody maxWidth="none">
          <PageHeader title="Simulados" subtitle="Faça até o prazo. O gabarito comentado abre assim que você finaliza."
            actions={<Button variant="secondary" icon="archive" label="Provas anteriores" onPress={() => navigation.navigate('ProvasAnteriores')} />} />
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            {[
              { label: 'Pendentes', value: String(groups.pending.length), hint: groups.urgent.length ? `${groups.urgent.length} vencem em até 3 dias` : undefined },
              { label: 'Concluídos', value: `${groups.done.length} de ${all.length}` },
              { label: 'Média', value: groups.average != null ? `${groups.average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—', hint: 'Nos simulados concluídos', tone: 'success' as const },
              { label: 'Próximo prazo', value: nextLabel },
            ].map((t) => (
              <StatTile key={t.label} label={t.label} value={t.value} hint={t.hint} tone={t.tone}
                style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, paddingVertical: 14, paddingHorizontal: space[4] }} />
            ))}
          </View>
          {isLoading ? <ActivityIndicator color={p.brand} /> : isError ? (
            <Notice tone="danger" title="Não foi possível carregar os simulados" text={getApiErrorMessage(error, 'Tente de novo.')} />
          ) : (
            <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
              <Card padding="none" style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderBottomWidth: 1, borderBottomColor: p.line }}>
                  <View style={{ width: 520, maxWidth: '70%' }}>
                    <SegmentedControl label="Situação" value={deskTab} onChange={setDeskTab}
                      options={['Todos', `Pendentes · ${groups.pending.length}`, `Concluídos · ${groups.done.length}`, `Encerrados · ${groups.closed.length}`]} />
                  </View>
                  <View style={{ flex: 1 }} />
                  <SelectButton icon="filter" value={subjectFilter} onChange={setSubjectFilter}
                    options={[{ value: 0, label: 'Todas as disciplinas' }, ...subjects.map(([id, name]) => ({ value: id, label: name }))]} />
                </View>
                <View style={{ paddingTop: space[4], paddingHorizontal: space[2], paddingBottom: space[2] }}>
                  <ExamTableHead />
                  {sections.length ? sections.map(([title, list]) => (
                    <View key={title}>
                      <Overline style={{ paddingTop: space[4], paddingHorizontal: space[4], paddingBottom: 6 }}>{title}</Overline>
                      {list.map((s, i) => {
                        const c = examCardProps(s, p);
                        return (
                          <ExamRow key={s.id} first={i === 0} selected={selected?.id === s.id} subject={c.subject} subjectColor={c.subjectColor} title={c.title}
                            meta={c.meta.slice(0, 2)} status={c.status} statusText={c.statusText} deadline={deadlineLabel(s)} urgent={c.urgent}
                            score={c.score} actionLabel={c.actionLabel} onPress={() => setSelectedId(s.id)} onAction={() => open(s)} />
                        );
                      })}
                    </View>
                  )) : (
                    <View style={{ padding: space[4] }}><EmptyState icon="clipboard" title="Nenhum simulado aqui" text="Mude a situação ou a disciplina para ver outros simulados." /></View>
                  )}
                </View>
              </Card>
              <View style={{ width: 360 }}>
                {selected ? (
                  <SimuladoDetailPanel key={selected.id} examId={selected.id}
                    score={selected.aproveitamento != null ? { value: selected.aproveitamento, label: examCardProps(selected, p).score ?? '' } : null} />
                ) : null}
              </View>
            </View>
          )}
          <View style={{ maxWidth: layout.asideW * 2 }}>
            <QuickAction icon="library" title="Treinar no banco de questões" subtitle="Pratique os assuntos dos próximos simulados"
              onPress={() => navigation.getParent()?.navigate('Questoes', { screen: 'BancoQuestoes' })} />
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Simulados" subtitle={isLoading ? undefined : subtitle}
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined}
        trailing={<IconButton icon="archive" label="Provas anteriores" onPress={() => navigation.navigate('ProvasAnteriores')} />} />
      <ScrollView refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />}>
        <ScreenBody gap={20} style={{ paddingTop: space[2] }}>
          <SegmentedControl label="Situação" value={tab} onChange={setTab}
            options={[`Pendentes · ${groups.pending.length}`, `Concluídos · ${groups.done.length}`, `Encerrados${groups.closed.length ? ` · ${groups.closed.length}` : ''}`]} />

          {isLoading ? <ActivityIndicator color={p.brand} style={{ marginTop: space[6] }} /> : null}
          {isError ? (
            <View style={{ gap: space[3] }}>
              <Notice tone="danger" title="Não foi possível carregar os simulados" text={getApiErrorMessage(error, 'Verifique sua conexão e tente de novo.')} />
              <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
            </View>
          ) : null}

          {!isLoading && !isError && tab === 0 ? (
            groups.pending.length ? (
              <>
                {renderGroup('Vence em até 3 dias', groups.urgent)}
                {renderGroup('Disponíveis', groups.available)}
                {renderGroup('Próximos', groups.upcoming)}
              </>
            ) : <EmptyState icon="check" title="Nenhum simulado pendente" text="Quando a escola publicar um novo simulado para a sua turma, ele aparece aqui." />
          ) : null}
          {!isLoading && !isError && tab === 1 ? (
            groups.done.length ? renderGroup('Concluídos', groups.done)
              : <EmptyState icon="clipboard" title="Nenhum simulado concluído" text="Os simulados que você finalizar aparecem aqui, com a nota e a correção." />
          ) : null}
          {!isLoading && !isError && tab === 2 ? (
            groups.closed.length ? renderGroup('Encerrados', groups.closed)
              : <EmptyState icon="calendar" title="Nenhum simulado encerrado" text="Simulados cujo prazo acabou antes de você fazer aparecem aqui." />
          ) : null}

          <QuickAction icon="library" title="Treinar no banco de questões" subtitle="Pratique os assuntos dos próximos simulados"
            onPress={() => navigation.getParent()?.navigate('Questoes', { screen: 'BancoQuestoes' })} />
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
