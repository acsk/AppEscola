import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { RankingRow } from '../../../services/practice.service';
import { Icon, ProgressBar, Txt, font, radius, space, usePalette } from '../../../ui';

const AJUDA = {
  wilson: 'Limite inferior do intervalo de Wilson com 95% de confiança. Conta só a primeira tentativa de cada questão, e apenas se essa primeira vez foi neste período. Repetir a questão não muda a pontuação.',
  dedication: 'Questões inéditas valem 1 ponto e cada dia com estudo vale 5. Repetir uma questão não soma ponto. O traço de dias seguidos é só um indicador.',
};

const medalha = (pos: number) => (pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null);
const lugar = (pos: number) => (pos === 1 ? '1º lugar, medalha de ouro' : pos === 2 ? '2º lugar, medalha de prata' : pos === 3 ? '3º lugar, medalha de bronze' : `${pos}º lugar`);
const pontos = (score: number) => score.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number | null) => (value == null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const initials = (name: string) => name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

function Posicao({ pos }: { pos: number }) {
  const p = usePalette();
  const medal = medalha(pos);
  return (
    <Text accessibilityLabel={lugar(pos)} style={{ ...font.extrabold, fontSize: 16, lineHeight: 22, color: p.ink, fontVariant: ['tabular-nums'] }}>
      {medal ? `${medal} ` : ''}{pos}º
    </Text>
  );
}

function Linha({ row, isDesktop, mode, maxScore }: { row: RankingRow; isDesktop: boolean; mode: 'wilson' | 'dedication'; maxScore: number }) {
  const p = usePalette();
  const score = row.score ?? 0;
  const destaque = row.position <= 3 ? p.accentSoft : 'transparent';
  const rotulo = mode === 'dedication'
    ? `${row.questions} inéditas · ${row.active_days ?? 0} ${(row.active_days ?? 0) === 1 ? 'dia' : 'dias'}${(row.streak ?? 0) > 1 ? ` · ${row.streak} seguidos` : ''}`
    : `${row.questions} questões · ${row.first_attempt_correct ?? row.correct} acertos · ${pct(row.accuracy)}`;
  return (
    <View style={{
      gap: 8, paddingVertical: 12, paddingHorizontal: space[3], borderRadius: radius.md,
      backgroundColor: row.position <= 3 ? destaque : row.is_me ? p.surfaceSunken : 'transparent',
      borderWidth: row.is_me ? 1.5 : 0, borderColor: p.ink,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ width: isDesktop ? 72 : 64 }}><Posicao pos={row.position} /></View>
        {row.photo_url ? (
          <Image source={{ uri: row.photo_url }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.surfaceSunken }} />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...font.extrabold, fontSize: 13, color: p.inkMuted }}>{initials(row.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Txt variant="titleSm" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, flexShrink: 1 }}>{row.name}</Txt>
          {row.is_me ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: p.surfaceInverse }}>
              <Text style={{ ...font.extrabold, fontSize: 11, letterSpacing: 0.44, color: p.onInverse }}>VOCÊ</Text>
            </View>
          ) : null}
        </View>
        {isDesktop ? <Metricas row={row} mode={mode} /> : (
          <Text style={{ ...font.extrabold, fontSize: 18, color: p.ink, fontVariant: ['tabular-nums'] }}>{mode === 'dedication' ? String(score) : pontos(score)}</Text>
        )}
      </View>
      {isDesktop ? null : <Txt variant="bodySm" tone="subtle">{rotulo}</Txt>}
      {(row.retakes ?? 0) > 0 ? <Txt variant="caption" tone="subtle">{row.retakes} {(row.retakes ?? 0) === 1 ? 'retentativa' : 'retentativas'} fora da pontuação</Txt> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><ProgressBar value={score} max={mode === 'dedication' ? maxScore : 100} tone="brand" size="sm" label={`Pontuação ${mode === 'dedication' ? score : pontos(score)}`} /></View>
        {isDesktop ? <Text style={{ width: 52, textAlign: 'right', ...font.extrabold, fontSize: 16, color: p.ink, fontVariant: ['tabular-nums'] }}>{mode === 'dedication' ? score : pontos(score)}</Text> : null}
      </View>
    </View>
  );
}

function Metricas({ row, mode }: { row: RankingRow; mode: 'wilson' | 'dedication' }) {
  const p = usePalette();
  const item = (valor: string, rotulo: string, largura: number) => (
    <View style={{ width: largura, alignItems: 'flex-end' }}>
      <Text style={{ ...font.bold, fontSize: 15, color: p.ink, fontVariant: ['tabular-nums'] }}>{valor}</Text>
      <Txt variant="caption" tone="subtle">{rotulo}</Txt>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {mode === 'dedication' ? item(String(row.questions), 'inéditas', 72) : item(String(row.questions), 'questões', 72)}
      {mode === 'dedication' ? item(String(row.active_days ?? 0), 'dias', 52) : item(String(row.first_attempt_correct ?? row.correct), 'acertos', 64)}
      {mode === 'dedication' ? item(String(row.streak ?? 0), 'seguidos', 68) : item(pct(row.accuracy), 'aproveitamento', 108)}
    </View>
  );
}

/** Medalhas, foto e barra. Desempenho usa Wilson; dedicação usa questões inéditas e dias ativos. */
export function WilsonRankingList({ rows, pinned, isDesktop, mode }: { rows: RankingRow[]; pinned?: RankingRow | null; isDesktop: boolean; mode: 'wilson' | 'dedication' }) {
  const p = usePalette();
  const [ajuda, setAjuda] = useState(false);
  const maxScore = Math.max(1, ...rows.map((row) => row.score ?? 0), pinned?.score ?? 0);
  const texto = AJUDA[mode];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isDesktop ? 'flex-end' : 'flex-start', gap: 6, paddingHorizontal: space[2] }}>
        {isDesktop ? <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>{mode === 'dedication' ? 'A barra compara com quem está em primeiro.' : 'A barra é a pontuação de Wilson, de 0 a 100.'}</Txt> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Como a pontuação é calculada" accessibilityHint={texto}
          onPress={() => setAjuda((v) => !v)} {...{ title: texto }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
          <Icon name="info" size={16} color={p.info} />
          <Txt variant="bodySm" tone="muted">Pontuação</Txt>
        </Pressable>
      </View>
      {ajuda ? <Txt variant="bodySm" tone="muted" style={{ lineHeight: 20, paddingHorizontal: space[2] }}>{texto}</Txt> : null}
      <View style={{ gap: 4 }}>
        {rows.map((row) => <Linha key={`${row.position}-${row.name}-${row.is_me}`} row={row} isDesktop={isDesktop} mode={mode} maxScore={maxScore} />)}
        {pinned ? (
          <>
            <View style={{ height: 1, backgroundColor: p.line, marginVertical: 4 }} />
            <Linha row={pinned} isDesktop={isDesktop} mode={mode} maxScore={maxScore} />
          </>
        ) : null}
      </View>
    </View>
  );
}
