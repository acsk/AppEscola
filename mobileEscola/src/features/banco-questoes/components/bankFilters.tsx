import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogFacets, CatalogFilters, PracticeSituation, SessionOptions } from '../../../services/practice.service';
import {
  Button, Checkbox, Chip, Chips, FilterGroup, FilterPill, LinkButton, Overline, SegmentedControl, Sheet, Txt, space, subjectColor,
  usePalette, type Palette,
} from '../../../ui';

const STORAGE_KEY = 'banco_questoes_filtros_v1';

export const SITUATION_LABEL: Record<PracticeSituation, string> = {
  unanswered: 'Não respondidas', wrong: 'Que errei', saved: 'Salvas', all: 'Todas',
};
const SITUATION_ORDER: PracticeSituation[] = ['unanswered', 'wrong', 'saved', 'all'];

/** Filtros do banco persistem entre visitas (protótipo: "Filtros ativos … persistem entre visitas"). */
export function useBankFilters() {
  const [filters, setFilters] = useState<CatalogFilters>({ situation: 'all' });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) setFilters({ ...JSON.parse(raw), search: '' }); })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const { search, ...persist } = filters;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persist)).catch(() => undefined);
  }, [filters, loaded]);
  const update = (patch: Partial<CatalogFilters>) => setFilters((prev) => ({ ...prev, ...patch }));
  const clear = () => setFilters({ situation: 'all', search: filters.search });
  return { filters, update, clear, loaded };
}

const toggle = (list: number[] | undefined, id: number) => (list?.includes(id) ? list.filter((x) => x !== id) : [...(list ?? []), id]);

/** Quantos filtros estão ativos (para "Filtros · 3"). */
export function activeFilterCount(f: CatalogFilters) {
  return (f.subject_ids?.length ?? 0) + (f.topic_ids?.length ?? 0) + (f.situation && f.situation !== 'all' ? 1 : 0)
    + (f.difficulty_id ? 1 : 0) + (f.years?.length ?? 0) + (f.year_before ? 1 : 0);
}

/** Pílulas removíveis dos filtros ativos. */
export function ActiveFilterPills({ filters, facets, onChange, onClear }: {
  filters: CatalogFilters; facets?: CatalogFacets; onChange: (patch: Partial<CatalogFilters>) => void; onClear?: () => void;
}) {
  const p = usePalette();
  const subjectName = (id: number) => facets?.subjects.find((s) => s.id === id)?.name ?? 'Disciplina';
  const topicName = (id: number) => facets?.topics.find((t) => t.id === id)?.name ?? 'Assunto';
  const difficulty = facets?.difficulties.find((d) => d.id === filters.difficulty_id)?.name;
  return (
    <>
      {(filters.subject_ids ?? []).map((id) => (
        <FilterPill key={`s${id}`} label={subjectName(id)} dot={subjectColor(p, id, facets?.subjects.find((s) => s.id === id)?.color)}
          onRemove={() => onChange({ subject_ids: toggle(filters.subject_ids, id), topic_ids: (filters.topic_ids ?? []).filter((t) => facets?.topics.find((x) => x.id === t)?.subject_id !== id) })} />
      ))}
      {(filters.topic_ids ?? []).map((id) => <FilterPill key={`t${id}`} label={topicName(id)} onRemove={() => onChange({ topic_ids: toggle(filters.topic_ids, id) })} />)}
      {filters.situation && filters.situation !== 'all' ? <FilterPill label={SITUATION_LABEL[filters.situation]} onRemove={() => onChange({ situation: 'all' })} /> : null}
      {difficulty ? <FilterPill label={difficulty} onRemove={() => onChange({ difficulty_id: null })} /> : null}
      {(filters.years ?? []).map((y) => <FilterPill key={`y${y}`} label={String(y)} onRemove={() => onChange({ years: toggle(filters.years, y) })} />)}
      {filters.year_before ? <FilterPill label="Anteriores" onRemove={() => onChange({ year_before: null })} /> : null}
      {onClear && activeFilterCount(filters) > 1 ? <LinkButton label="Limpar tudo" onPress={onClear} /> : null}
    </>
  );
}

/** Anos: os 3 mais recentes + "Anteriores". */
function yearOptions(facets?: CatalogFacets) {
  const years = facets?.years ?? [];
  const top = years.slice(0, 3);
  const olderTotal = years.slice(3).reduce((a, y) => a + y.total, 0);
  return { top, before: years[3] ? top[top.length - 1]?.year : null, olderTotal };
}

function topicsFor(facets: CatalogFacets | undefined, filters: CatalogFilters) {
  const subjects = filters.subject_ids ?? [];
  return (facets?.topics ?? []).filter((t) => subjects.includes(t.subject_id));
}

/** Filtros do celular (protótipo "TelaFiltrarQuestoes"): chips com contagem; opção com 0 desabilitada. */
export function BankFiltersSheet({ visible, onClose, filters, facets, onChange, onClear }: {
  visible: boolean; onClose: () => void; filters: CatalogFilters; facets?: CatalogFacets;
  onChange: (patch: Partial<CatalogFilters>) => void; onClear: () => void;
}) {
  const p = usePalette();
  const [showAllTopics, setShowAllTopics] = useState(false);
  const topics = topicsFor(facets, filters);
  const shownTopics = showAllTopics ? topics : topics.slice(0, 4);
  const subjectsSel = (facets?.subjects ?? []).filter((s) => filters.subject_ids?.includes(s.id));
  const years = yearOptions(facets);
  const difficulties = facets?.difficulties ?? [];
  const diffIndex = filters.difficulty_id ? difficulties.findIndex((d) => d.id === filters.difficulty_id) + 1 : 0;
  const total = facets?.total ?? 0;
  return (
    <Sheet visible={visible} title="Filtros" onClose={onClose} maxHeight="92%"
      footer={<>
        <Button variant="secondary" label="Limpar" onPress={onClear} />
        <Button block label={`Ver ${total.toLocaleString('pt-BR')} ${total === 1 ? 'questão' : 'questões'}`} onPress={onClose} />
      </>}>
      <View style={{ gap: 20 }}>
        <View style={{ gap: 10 }}>
          <Overline>Disciplina</Overline>
          <Chips>
            {(facets?.subjects ?? []).map((s) => (
              <Chip key={s.id} label={s.name} count={s.total} dot={subjectColor(p, s.id, s.color)} selected={filters.subject_ids?.includes(s.id)}
                disabled={!s.total && !filters.subject_ids?.includes(s.id)} onPress={() => onChange({ subject_ids: toggle(filters.subject_ids, s.id) })} />
            ))}
          </Chips>
        </View>
        {subjectsSel.length ? (
          <View style={{ gap: 10 }}>
            <Overline>Assunto de {subjectsSel.map((s) => s.name).join(', ')}</Overline>
            {topics.length ? (
              <Chips>
                {shownTopics.map((t) => (
                  <Chip key={t.id} label={t.name} count={t.total} selected={filters.topic_ids?.includes(t.id)} disabled={!t.total && !filters.topic_ids?.includes(t.id)}
                    onPress={() => onChange({ topic_ids: toggle(filters.topic_ids, t.id) })} />
                ))}
                {!showAllTopics && topics.length > 4 ? (
                  <Pressable onPress={() => setShowAllTopics(true)} style={{ justifyContent: 'center', paddingHorizontal: 6, minHeight: 36 }}>
                    <Txt variant="label" tone="brand">+ {topics.length - 4}</Txt>
                  </Pressable>
                ) : null}
              </Chips>
            ) : <Txt variant="bodySm" tone="subtle">Sem assuntos cadastrados nesta disciplina.</Txt>}
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          <Overline>Situação</Overline>
          <Chips>
            {SITUATION_ORDER.filter((s) => s !== 'all').map((s) => (
              <Chip key={s} label={SITUATION_LABEL[s]} count={facets?.situations[s]} selected={filters.situation === s}
                disabled={!facets?.situations[s] && filters.situation !== s} onPress={() => onChange({ situation: filters.situation === s ? 'all' : s })} />
            ))}
          </Chips>
        </View>
        {difficulties.length ? (
          <View style={{ gap: 10 }}>
            <Overline>Dificuldade</Overline>
            {/* Segmentado só cabe até 4 opções; com mais níveis vira chips. */}
            {difficulties.length <= 3 ? (
              <SegmentedControl label="Dificuldade" options={['Todas', ...difficulties.map((d) => d.name)]} value={diffIndex}
                onChange={(i) => onChange({ difficulty_id: i === 0 ? null : difficulties[i - 1].id })} />
            ) : (
              <Chips>
                {difficulties.map((d) => (
                  <Chip key={d.id} label={d.name} count={d.total} selected={filters.difficulty_id === d.id}
                    disabled={!d.total && filters.difficulty_id !== d.id} onPress={() => onChange({ difficulty_id: filters.difficulty_id === d.id ? null : d.id })} />
                ))}
              </Chips>
            )}
          </View>
        ) : null}
        {years.top.length ? (
          <View style={{ gap: 10 }}>
            <Overline>Ano da prova</Overline>
            <Chips>
              {years.top.map((y) => (
                <Chip key={y.year} label={String(y.year)} count={y.total} selected={filters.years?.includes(y.year)} onPress={() => onChange({ years: toggle(filters.years, y.year) })} />
              ))}
              {years.before ? (
                <Chip label="Anteriores" count={years.olderTotal} selected={!!filters.year_before}
                  onPress={() => onChange({ year_before: filters.year_before ? null : years.before })} />
              ) : null}
            </Chips>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/** Filtros do desktop (protótipo "DesktopBancoQuestoes"): grupos com caixas de seleção e contagem. */
export function BankFiltersPanel({ filters, facets, onChange, onClear }: {
  filters: CatalogFilters; facets?: CatalogFacets; onChange: (patch: Partial<CatalogFilters>) => void; onClear: () => void;
}) {
  const p = usePalette();
  const [allTopics, setAllTopics] = useState(false);
  const topics = topicsFor(facets, filters);
  const years = yearOptions(facets);
  const difficulties = facets?.difficulties ?? [];
  return (
    <View accessibilityLabel="Filtros">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: p.line }}>
        <Txt variant="titleSm">Filtros</Txt>
        <LinkButton label="Limpar" onPress={onClear} />
      </View>
      <FilterGroup title="Disciplina" selected={filters.subject_ids?.length}>
        {(facets?.subjects ?? []).map((s) => (
          <Checkbox key={s.id} label={s.name} count={s.total} dot={subjectColor(p, s.id, s.color)} checked={filters.subject_ids?.includes(s.id)}
            disabled={!s.total && !filters.subject_ids?.includes(s.id)} onPress={() => onChange({ subject_ids: toggle(filters.subject_ids, s.id) })} />
        ))}
      </FilterGroup>
      <FilterGroup title="Assunto" selected={filters.topic_ids?.length}>
        {!filters.subject_ids?.length ? <Txt variant="bodySm" tone="subtle">Escolha uma disciplina.</Txt> : null}
        {(allTopics ? topics : topics.slice(0, 4)).map((t) => (
          <Checkbox key={t.id} label={t.name} count={t.total} checked={filters.topic_ids?.includes(t.id)} disabled={!t.total && !filters.topic_ids?.includes(t.id)}
            onPress={() => onChange({ topic_ids: toggle(filters.topic_ids, t.id) })} />
        ))}
        {!allTopics && topics.length > 4 ? <View style={{ paddingVertical: 6 }}><LinkButton label={`+ ${topics.length - 4} assuntos`} onPress={() => setAllTopics(true)} /></View> : null}
      </FilterGroup>
      <FilterGroup title="Situação" selected={filters.situation && filters.situation !== 'all' ? 1 : undefined}>
        {SITUATION_ORDER.map((s) => (
          <Checkbox key={s} radio label={SITUATION_LABEL[s]} count={facets?.situations[s]} checked={(filters.situation ?? 'all') === s}
            disabled={!facets?.situations[s] && filters.situation !== s} onPress={() => onChange({ situation: s })} />
        ))}
      </FilterGroup>
      <FilterGroup title="Dificuldade" selected={filters.difficulty_id ? 1 : undefined}>
        {[{ id: 0, name: 'Todas', total: facets?.total }, ...difficulties].map((d) => (
          <Checkbox key={d.id} radio label={d.name} count={d.total} checked={(filters.difficulty_id ?? 0) === d.id}
            disabled={d.id !== 0 && !d.total && filters.difficulty_id !== d.id} onPress={() => onChange({ difficulty_id: d.id || null })} />
        ))}
      </FilterGroup>
      <FilterGroup title="Ano da prova" defaultOpen={false} selected={(filters.years?.length ?? 0) + (filters.year_before ? 1 : 0) || undefined}>
        {years.top.map((y) => (
          <Checkbox key={y.year} label={String(y.year)} count={y.total} checked={filters.years?.includes(y.year)} onPress={() => onChange({ years: toggle(filters.years, y.year) })} />
        ))}
        {years.before ? <Checkbox label="Anteriores" count={years.olderTotal} checked={!!filters.year_before} onPress={() => onChange({ year_before: filters.year_before ? null : years.before })} /> : null}
        {!years.top.length ? <Txt variant="bodySm" tone="subtle">Sem ano informado nas questões.</Txt> : null}
      </FilterGroup>
    </View>
  );
}

export const DEFAULT_SESSION: SessionOptions = { quantity: 20, correction_mode: 'each', timed: false };
const QUANTITIES: SessionOptions['quantity'][] = [10, 20, 30, null];

/** Montar sessão: quantidade, correção e cronômetro (sheet no celular, card no desktop). */
export function SessionOptionsFields({ value, onChange }: { value: SessionOptions; onChange: (v: SessionOptions) => void }) {
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="label" tone="muted" style={{ fontSize: 13 }}>Quantidade</Txt>
        <SegmentedControl label="Quantidade" options={['10', '20', '30', 'Todas']} value={QUANTITIES.indexOf(value.quantity)}
          onChange={(i) => onChange({ ...value, quantity: QUANTITIES[i] })} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="label" tone="muted" style={{ fontSize: 13 }}>Correção</Txt>
        <Checkbox radio label="A cada questão" checked={value.correction_mode === 'each'} onPress={() => onChange({ ...value, correction_mode: 'each' })} />
        <Checkbox radio label="No final, como simulado" checked={value.correction_mode === 'end'} onPress={() => onChange({ ...value, correction_mode: 'end' })} />
      </View>
      <Checkbox label="Cronometrar (1 min 30 s por questão)" checked={value.timed} onPress={() => onChange({ ...value, timed: !value.timed })} />
    </View>
  );
}

export function sessionCount(value: SessionOptions, available: number) {
  return value.quantity == null ? Math.min(available, 100) : Math.min(value.quantity, available);
}

export function sessionHint(value: SessionOptions, available: number) {
  return `${sessionCount(value, available)} questões sorteadas destes filtros · correção ${value.correction_mode === 'each' ? 'a cada questão' : 'no final'}${value.timed ? ' · com cronômetro' : ''}`;
}

/** Título da sessão a partir dos filtros ("Frações · Matemática CPM"). */
export function useSessionTitle(filters: CatalogFilters, facets?: CatalogFacets) {
  return useMemo(() => {
    const topics = (filters.topic_ids ?? []).map((id) => facets?.topics.find((t) => t.id === id)?.name).filter(Boolean);
    const subjects = (filters.subject_ids ?? []).map((id) => facets?.subjects.find((s) => s.id === id)?.name).filter(Boolean);
    const parts = [topics.join(', '), subjects.join(', ')].filter(Boolean);
    return parts.join(' · ') || (filters.situation === 'wrong' ? 'Revisar o que errei' : 'Todas as disciplinas');
  }, [filters, facets]);
}

export type { Palette };
