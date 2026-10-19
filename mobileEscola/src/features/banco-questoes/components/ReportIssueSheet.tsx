import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, Sheet, Txt, font, space, usePalette } from '../../../ui';

export const ISSUE_NOTE_MIN = 10;
export const ISSUE_NOTE_MAX = 280;

type Props = {
  visible: boolean;
  sending?: boolean;
  /** Erro devolvido pela API ao enviar. */
  error?: string | null;
  onCancel: () => void;
  onSubmit: (note: string) => void;
};

/** Aviso de erro na questão: o aluno precisa descrever o que viu de errado antes de enviar ao professor. */
export function ReportIssueSheet({ visible, sending, error, onCancel, onSubmit }: Props) {
  const p = usePalette();
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (visible) { setNote(''); setTouched(false); }
  }, [visible]);

  const length = note.trim().length;
  const localError = !touched ? null
    : length === 0 ? 'Descreva o que está errado na questão.'
      : length < ISSUE_NOTE_MIN ? `Descreva o erro com pelo menos ${ISSUE_NOTE_MIN} caracteres.`
        : null;
  const shownError = localError ?? error ?? null;

  const submit = () => {
    setTouched(true);
    if (length < ISSUE_NOTE_MIN) return;
    onSubmit(note.trim());
  };

  return (
    <Sheet visible={visible} title="Informar erro na questão" onClose={onCancel}
      footer={
        <>
          <View style={{ flex: 1 }}><Button block variant="secondary" label="Cancelar" onPress={onCancel} disabled={sending} /></View>
          <View style={{ flex: 1 }}><Button block label="Enviar ao professor" loading={sending} onPress={submit} /></View>
        </>
      }>
      <View style={{ gap: space[3] }}>
        <Txt tone="muted">
          Conte o que você viu de errado. A questão sai da prática até o professor analisar.
        </Txt>
        <TextInput multiline autoFocus value={note} maxLength={ISSUE_NOTE_MAX}
          onChangeText={setNote} onBlur={() => setTouched(true)}
          placeholder="Ex.: a alternativa C também está correta; o enunciado fala em 5 maçãs, mas a imagem mostra 4…"
          placeholderTextColor={p.inkSubtle} accessibilityLabel="O que está errado na questão" textAlignVertical="top"
          style={{
            minHeight: 120, borderWidth: 1, borderColor: shownError ? p.dangerInk : p.lineStrong, borderRadius: 10,
            paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, lineHeight: 21, color: p.ink, backgroundColor: p.surface, ...font.regular,
          }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
          <Txt variant="caption" style={{ flex: 1, color: shownError ? p.dangerInk : p.inkSubtle }}>
            {shownError ?? 'Obrigatório.'}
          </Txt>
          <Txt variant="caption" tone="subtle" style={{ fontVariant: ['tabular-nums'] }}>{note.length}/{ISSUE_NOTE_MAX}</Txt>
        </View>
      </View>
    </Sheet>
  );
}
