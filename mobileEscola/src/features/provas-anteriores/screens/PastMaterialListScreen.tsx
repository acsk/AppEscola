import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { anoDaProva, type PastExamListItem, type PastExamMaterialKind } from '../../../services/past-exams.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useProvasAnterioresList } from '../hooks';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, Button, Chip, EmptyState, FileRow, IconButton, LinkButton, Notice, PageBody, PageHeader, ScreenBody, SearchField, SelectButton,
  Txt, font, space, subjectColor, useLayoutMode, usePalette,
} from '../../../ui';

type ListScreenName = 'ProvasAnteriores' | 'Exercicios' | 'Materiais';
type Nav = NativeStackNavigationProp<SimuladosStackParamList>;

export type PastMaterialListScreenProps = { materialKind: PastExamMaterialKind; listScreen: ListScreenName };

const COPY: Record<PastExamMaterialKind, { title: string; sub: (n: number) => string; search: string; emptyTitle: string; emptyText: string; noun: [string, string] }> = {
  prova: {
    title: 'Provas anteriores', sub: () => 'Provas oficiais de anos anteriores, com gabarito', search: 'Buscar prova por nome ou ano',
    emptyTitle: 'Nenhuma prova anterior ainda', emptyText: 'Quando a escola publicar provas de anos anteriores, elas aparecem aqui, separadas por ano.', noun: ['prova', 'provas'],
  },
  exercicio: {
    title: 'Exercícios', sub: (n) => `Listas para praticar em casa. ${n} ${n === 1 ? 'disponível' : 'disponíveis'}`, search: 'Buscar exercício',
    emptyTitle: 'Nenhum exercício ainda', emptyText: 'Quando a escola publicar listas de exercícios, elas aparecem aqui.', noun: ['lista', 'listas'],
  },
  material: {
    title: 'Materiais', sub: () => 'Apostilas e simulados para estudar e imprimir', search: 'Buscar material',
    emptyTitle: 'Nenhum material ainda', emptyText: 'Quando a escola publicar apostilas e materiais, eles aparecem aqui.', noun: ['material', 'materiais'],
  },
};

const NEW_DAYS = 7;
const isNew = (item: PastExamListItem) => !!item.created_at && Date.now() - new Date(item.created_at).getTime() < NEW_DAYS * 86400000;
const fileTypeLabel = (item: PastExamListItem) => (item.type === 'link' ? 'LINK' : item.file_type === 'image' ? 'IMG' : item.file_type === 'document' ? 'DOC' : 'PDF');
/** Turmas: até duas e "+N". */
function classes(item: PastExamListItem): string | null {
  const names = (item.courses?.length ? item.courses : item.course ? [item.course] : []).map((c) => c.name);
  if (!names.length) return null;
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}
const addedOn = (item: PastExamListItem) => (item.created_at ? `Adicionado ${new Date(item.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : null);

/**
 * Biblioteca (protótipos "TelaExercicios", "DesktopExercicios", "DesktopMateriais", "DesktopProvasAnteriores"):
 * o mesmo FileRow, agrupado por disciplina (Exercícios), coleção (Materiais) ou ano (Provas). "Abrir" mostra no app; o ícone baixa.
 */
export function PastMaterialListScreen({ materialKind, listScreen }: PastMaterialListScreenProps) {
  const p = usePalette();
  const navigation = useNavigation<Nav>();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop } = useLayoutMode();
  const copy = COPY[materialKind];
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState<number | 0>(0);
  const [year, setYear] = useState<number | 0>(0);
  const [course, setCourse] = useState<number | 0>(0);
  const [sort, setSort] = useState<'recent' | 'oldest'>('recent');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: all = [], isLoading, isRefetching, isError, error, refetch } = useProvasAnterioresList({ material_kind: materialKind });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const yearOf = (i: PastExamListItem) => anoDaProva(i.exam_date, i.exam_year);
  const subjects = useMemo(() => {
    const map = new Map<number, { id: number; name: string; color?: string | null; count: number }>();
    all.forEach((i) => { if (i.subject) { const cur = map.get(i.subject.id); map.set(i.subject.id, { id: i.subject.id, name: i.subject.name, color: (i.subject as { color?: string | null }).color, count: (cur?.count ?? 0) + 1 }); } });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);
  const years = useMemo(() => [...new Set(all.map(yearOf).filter((y): y is number => y != null))].sort((a, b) => b - a), [all]);
  const courses = useMemo(() => {
    const map = new Map<number, string>();
    all.forEach((i) => (i.courses ?? (i.course ? [i.course] : [])).forEach((c) => map.set(c.id, c.name)));
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((i) => {
      if (subjectId && i.subject?.id !== subjectId) return false;
      if (year && yearOf(i) !== year) return false;
      if (course && !(i.courses ?? (i.course ? [i.course] : [])).some((c) => c.id === course)) return false;
      if (!term) return true;
      return [i.title, i.description, i.exam_type_label, i.subject?.name, String(yearOf(i) ?? '')].some((v) => (v ?? '').toLowerCase().includes(term));
    }).sort((a, b) => {
      const da = new Date(a.exam_date ?? a.created_at ?? 0).getTime();
      const db = new Date(b.exam_date ?? b.created_at ?? 0).getTime();
      return sort === 'recent' ? db - da : da - db;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yearOf é puro
  }, [all, search, subjectId, year, course, sort]);

  // Agrupamento: disciplina (Exercícios), coleção (Materiais) ou ano (Provas).
  const groups = useMemo(() => {
    const keyOf = (i: PastExamListItem) => materialKind === 'prova' ? String(yearOf(i) ?? 'Sem ano')
      : materialKind === 'exercicio' ? i.subject?.name ?? 'Outros'
      : i.exam_type_label ?? i.material_kind_label ?? 'Materiais';
    const map = new Map<string, PastExamListItem[]>();
    items.forEach((i) => map.set(keyOf(i), [...(map.get(keyOf(i)) ?? []), i]));
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yearOf é puro
  }, [items, materialKind]);

  const open = (item: PastExamListItem) => navigation.navigate('ProvaAnteriorDetalhe', { pastExamId: item.id, listScreen, materialKind });
  const download = (item: PastExamListItem) => { if (item.content) void Linking.openURL(item.content); };

  const row = (item: PastExamListItem) => {
    const meta = [classes(item), materialKind === 'prova' && item.exam_date ? new Date(item.exam_date).toLocaleDateString('pt-BR') : null, isNew(item) ? addedOn(item) : null]
      .filter((m): m is string => !!m);
    const kicker = materialKind === 'prova'
      ? [item.exam_type_label, item.subject?.name ?? 'Prova completa'].filter(Boolean).join(' · ')
      : materialKind === 'exercicio' ? item.description?.split('\n')[0]?.slice(0, 40) || item.subject?.name : item.material_kind_label ?? item.exam_type_label;
    return (
      <FileRow key={item.id} compact={!isDesktop} fileType={fileTypeLabel(item)} subject={kicker ?? null}
        subjectDot={item.subject ? subjectColor(p, item.subject.id, (item.subject as { color?: string | null }).color) : undefined}
        title={item.title} meta={meta} isNew={isNew(item)} onOpen={() => open(item)} onDownload={item.content ? () => download(item) : undefined} />
    );
  };

  const LIMIT = 4;
  const list = isLoading ? <ActivityIndicator color={p.brand} style={{ marginTop: space[6] }} />
    : isError ? (
      <View style={{ gap: space[3] }}>
        <Notice tone="danger" title={`Não foi possível carregar ${copy.title.toLowerCase()}`} text={getApiErrorMessage(error, 'Tente de novo.')} />
        <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
      </View>
    ) : !all.length ? (
      <EmptyState icon="archive" title={copy.emptyTitle} text={copy.emptyText}
        action={materialKind === 'prova' ? <Button variant="secondary" size="sm" icon="library" label="Treinar no banco de questões" onPress={() => navigation.getParent()?.navigate('Questoes', { screen: 'BancoQuestoes' })} /> : undefined} />
    ) : !items.length ? <EmptyState icon="search" title="Nada encontrado" text="Tire um filtro ou mude a busca." />
    : (
      <View style={{ gap: space[5] }}>
        {groups.map(([label, list]) => {
          const showAll = !isDesktop || expanded[label] || list.length <= LIMIT + 1;
          return (
            <View key={label} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2], marginTop: 4 }}>
                <Txt variant="titleSm" style={{ fontSize: 15 }}>{label}</Txt>
                <Txt variant="bodySm" tone="subtle" style={{ ...font.semibold }}>{materialKind === 'prova' ? `${list.length} ${list.length === 1 ? copy.noun[0] : copy.noun[1]}` : list.length}</Txt>
              </View>
              {(showAll ? list : list.slice(0, LIMIT)).map(row)}
              {!showAll ? <View style={{ alignSelf: 'flex-start' }}><LinkButton label={`Ver mais ${list.length - LIMIT} de ${label}`} onPress={() => setExpanded((e) => ({ ...e, [label]: true }))} /></View> : null}
            </View>
          );
        })}
      </View>
    );

  const toSimulados = () => navigation.navigate('SimuladosList');
  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />;

  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title={copy.title} subtitle={copy.sub(all.length)} actions={<Button variant="secondary" icon="clipboard" label="Simulados" onPress={toSimulados} />} />
          <View style={{ maxWidth: 980, gap: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 280 }}><SearchField value={search} onChangeText={setSearch} placeholder={copy.search} /></View>
              {materialKind === 'prova' ? (
                <>
                  <SelectButton label="Ano:" value={year} options={[{ value: 0, label: 'Todos' }, ...years.map((y) => ({ value: y, label: String(y) }))]} onChange={setYear} />
                  <SelectButton label="Disciplina:" value={subjectId} options={[{ value: 0, label: 'Todas' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]} onChange={setSubjectId} />
                </>
              ) : (
                <>
                  {courses.length > 1 ? <SelectButton label="Turma:" value={course} options={[{ value: 0, label: 'Todas' }, ...courses.map((c) => ({ value: c.id, label: c.name }))]} onChange={setCourse} /> : null}
                  <SelectButton label="Ordenar:" value={sort} options={[{ value: 'recent' as const, label: 'Mais recentes' }, { value: 'oldest' as const, label: 'Mais antigas' }]} onChange={setSort} />
                </>
              )}
            </View>
            {materialKind === 'exercicio' && subjects.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                <Chip label="Todas" count={all.length} selected={!subjectId} onPress={() => setSubjectId(0)} />
                {subjects.map((s) => <Chip key={s.id} label={s.name} count={s.count} dot={subjectColor(p, s.id, s.color)} selected={subjectId === s.id} onPress={() => setSubjectId(s.id)} />)}
              </View>
            ) : null}
            {list}
          </View>
        </PageBody>
      </ScrollView>
    );
  }

  const chips = materialKind === 'prova'
    ? (years.length > 1 ? [<Chip key="all" label="Todos" selected={!year} onPress={() => setYear(0)} />, ...years.map((y) => <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(y)} />)] : [])
    : (subjects.length > 1 ? [<Chip key="all" label="Todas" count={all.length} selected={!subjectId} onPress={() => setSubjectId(0)} />,
      ...subjects.map((s) => <Chip key={s.id} label={s.name} count={s.count} dot={subjectColor(p, s.id, s.color)} selected={subjectId === s.id} onPress={() => setSubjectId(s.id)} />)] : []);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title={copy.title}
        subtitle={materialKind === 'exercicio' ? `${all.length} ${all.length === 1 ? 'lista' : 'listas'} para praticar` : copy.sub(all.length)}
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} />
          : <IconButton icon="arrow-left" label="Voltar" onPress={() => (navigation.canGoBack() ? navigation.goBack() : toSimulados())} />}
        trailing={<IconButton icon="clipboard" label="Simulados" onPress={toSimulados} />} />
      <ScrollView refreshControl={refresh} keyboardShouldPersistTaps="handled">
        <ScreenBody gap={20} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <SearchField value={search} onChangeText={setSearch} placeholder={copy.search} />
          {chips.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space[4] }} contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }}>
              {chips}
            </ScrollView>
          ) : null}
          {list}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}
