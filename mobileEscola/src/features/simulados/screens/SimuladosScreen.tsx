import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import type { SimuladoListItem } from '../../../services/simulados.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useSimuladosList } from '../hooks';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import { daysLeft, examCardProps, isClosed, isDone, isUpcoming } from '../lib/examCard';
import {
  AppBar, Button, EmptyState, ExamCard, IconButton, Notice, Overline, QuickAction, ScreenBody, SegmentedControl, space, usePalette,
} from '../../../ui';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'SimuladosList'>;

const byDeadline = (a: SimuladoListItem, b: SimuladoListItem) =>
  (a.ends_at ? new Date(a.ends_at).getTime() : Infinity) - (b.ends_at ? new Date(b.ends_at).getTime() : Infinity);

/** Simulados (protótipo "TelaSimulados"): pendentes agrupados por urgência, concluídos e encerrados. */
export function SimuladosScreen() {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const [tab, setTab] = useState(0);
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

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Simulados" subtitle={isLoading ? undefined : subtitle}
        leading={drawer ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined}
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
