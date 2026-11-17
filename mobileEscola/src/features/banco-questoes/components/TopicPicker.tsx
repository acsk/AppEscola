import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import type { CatalogFacets } from '../../../services/practice.service';
import { Button, Checkbox, Chip, Chips, Dot, EmptyState, Icon, IconButton, NewPill, Txt, font, radius, subjectColor, useLayoutMode, usePalette } from '../../../ui';
import { usePracticeFacets } from '../hooks';

type Props = {
  subjects: CatalogFacets['subjects'];
  topics: CatalogFacets['topics'];
  subjectIds: number[];
  selected: number[];
  onClose: () => void;
  onApply: (ids: number[]) => void;
};

/** Seleção provisória: fechar o diálogo preserva os assuntos já aplicados. */
export function TopicPicker({ subjects, topics, subjectIds, selected, onClose, onApply }: Props) {
  const p = usePalette();
  const { isDesktop } = useLayoutMode();
  const [draft, setDraft] = useState(selected);
  const [subject, setSubject] = useState<number | null>(null);
  const [onlyNew, setOnlyNew] = useState(false);
  const eligibleSubjects = subjects.filter((s) => !subjectIds.length || subjectIds.includes(s.id));
  const visibleTopics = topics.filter((t) => (!subject || t.subject_id === subject) && (!onlyNew || t.new > 0));
  const selection = usePracticeFacets({ subject_ids: subjectIds, topic_ids: draft, situation: 'all' });
  const toggle = (id: number) => setDraft((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, padding: isDesktop ? 32 : 16, justifyContent: 'center', alignItems: 'center', backgroundColor: p.scrim }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar seletor de assuntos" onPress={onClose} style={{ position: 'absolute', inset: 0 }} />
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 760, maxHeight: '90%', backgroundColor: p.surface, borderRadius: radius.lg, overflow: 'hidden' }}>
          <View style={{ padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: p.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt variant="title" accessibilityRole="header" style={{ flex: 1 }}>Escolha os assuntos</Txt>
              <IconButton icon="x" label="Fechar" onPress={onClose} />
            </View>
            <Txt variant="bodySm" tone="muted">Marque um ou mais. Sem marcar nada, valem todos.</Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Chips>
                <Chip label="Todas" count={topics.length} selected={subject === null} onPress={() => setSubject(null)} />
                {eligibleSubjects.map((s) => <Chip key={s.id} label={s.name} count={topics.filter((t) => t.subject_id === s.id).length} selected={subject === s.id} onPress={() => setSubject(s.id)} />)}
              </Chips>
            </ScrollView>
            <Checkbox label="Só com novas" count={topics.filter((t) => t.new > 0).length} checked={onlyNew} onPress={() => setOnlyNew(!onlyNew)} />
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            {!visibleTopics.length ? <EmptyState icon="book" title="Nenhum assunto aqui" text={onlyNew ? 'Desmarque “Só com novas” para ver os outros assuntos.' : 'Os assuntos disponíveis aparecem aqui.'} /> : null}
            {eligibleSubjects.filter((s) => visibleTopics.some((t) => t.subject_id === s.id)).map((s) => {
              const group = visibleTopics.filter((t) => t.subject_id === s.id);
              const allSelected = group.every((t) => draft.includes(t.id));
              return <View key={s.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Dot color={subjectColor(p, s.id, s.color)} /><Txt variant="label" tone="subtle" style={{ flexShrink: 1 }}>{s.name} · {group.length}</Txt>
                  </View>
                  <Button variant="ghost" size="sm" label={allSelected ? 'Desmarcar todos' : 'Marcar todos'} onPress={() => setDraft((prev) => allSelected ? prev.filter((id) => !group.some((t) => t.id === id)) : [...new Set([...prev, ...group.map((t) => t.id)])])} />
                </View>
                <View style={{ flexDirection: 'row', paddingBottom: 8, gap: 12 }}>
                  <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>Assunto</Txt><Txt variant="caption" tone="subtle">Novas</Txt><Txt variant="caption" tone="subtle" style={{ width: 40, textAlign: 'right' }}>Total</Txt>
                </View>
                {group.map((t) => <Pressable key={t.id} accessibilityRole="checkbox" accessibilityLabel={t.name} accessibilityState={{ checked: draft.includes(t.id) }} onPress={() => toggle(t.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 10, borderTopWidth: 1, borderTopColor: p.line }}>
                  <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: draft.includes(t.id) ? 0 : 1.5, borderColor: p.lineStrong, backgroundColor: draft.includes(t.id) ? p.surfaceInverse : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {draft.includes(t.id) ? <Icon name="check" size={14} color={p.onInverse} /> : null}
                  </View>
                  <Txt variant="bodySm" style={{ flex: 1 }}>{t.name}</Txt>
                  {t.new > 0 ? <NewPill label={`${t.new} novas`} /> : null}
                  <Txt variant="bodySm" tone="subtle" style={{ width: 40, textAlign: 'right' }}>{t.total}</Txt>
                </Pressable>)}
              </View>;
            })}
          </ScrollView>
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: p.line, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Button variant="ghost" size="sm" label="Limpar" onPress={() => setDraft([])} />
              <Txt variant="bodySm" tone="muted" style={{ flex: 1, ...font.semibold }}>{draft.length ? `${draft.length} assuntos` : 'Todos os assuntos'} · {selection.isFetching || selection.isPlaceholderData ? '…' : selection.data?.total ?? '—'} questões</Txt>
            </View>
            <Button block label={draft.length ? `Usar ${draft.length} ${draft.length === 1 ? 'assunto' : 'assuntos'}` : 'Usar todos os assuntos'} onPress={() => onApply(draft)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
