import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { RankingRow } from '../../../services/practice.service';
import { Icon, ProgressBar, Txt, font, radius, space, usePalette } from '../../../ui';

const AJUDA = 'Limite inferior do intervalo de Wilson com 95% de confiança. Combina o percentual de acertos com a quantidade de questões, para que poucas respostas certas não passem na frente de quem praticou mais.';

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

function Linha({ row, isDesktop }: { row: RankingRow; isDesktop: boolean }) {
  const p = usePalette();
  const score = row.score ?? 0;
  const destaque = row.position <= 3 ? p.accentSoft : 'transparent';
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
        {isDesktop ? <Metricas row={row} /> : (
          <Text style={{ ...font.extrabold, fontSize: 18, color: p.ink, fontVariant: ['tabular-nums'] }}>{pontos(score)}</Text>
        )}
      </View>
      {isDesktop ? null : (
        <Txt variant="bodySm" tone="subtle">
          {row.answered} respondidas · {row.correct} acertos · {pct(row.accuracy)} de aproveitamento
        </Txt>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><ProgressBar value={score} tone="brand" size="sm" label={`Pontuação ${pontos(score)}`} /></View>
        {isDesktop ? <Text style={{ width: 52, textAlign: 'right', ...font.extrabold, fontSize: 16, color: p.ink, fontVariant: ['tabular-nums'] }}>{pontos(score)}</Text> : null}
      </View>
    </View>
  );
}

function Metricas({ row }: { row: RankingRow }) {
  const p = usePalette();
  const item = (valor: string, rotulo: string, largura: number) => (
    <View style={{ width: largura, alignItems: 'flex-end' }}>
      <Text style={{ ...font.bold, fontSize: 15, color: p.ink, fontVariant: ['tabular-nums'] }}>{valor}</Text>
      <Txt variant="caption" tone="subtle">{rotulo}</Txt>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {item(String(row.answered), 'respondidas', 88)}
      {item(String(row.correct), 'acertos', 64)}
      {item(pct(row.accuracy), 'aproveitamento', 108)}
    </View>
  );
}

/** Tabela do ranking de desempenho: medalhas, aproveitamento e barra da pontuação de Wilson. */
export function WilsonRankingList({ rows, pinned, isDesktop }: { rows: RankingRow[]; pinned?: RankingRow | null; isDesktop: boolean }) {
  const p = usePalette();
  const [ajuda, setAjuda] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isDesktop ? 'flex-end' : 'flex-start', gap: 6, paddingHorizontal: space[2] }}>
        {isDesktop ? <Txt variant="caption" tone="subtle" style={{ flex: 1 }}>Posição, aluno, respondidas, acertos e aproveitamento ficam em cada linha. A barra é a pontuação.</Txt> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Como a pontuação é calculada" accessibilityHint={AJUDA}
          onPress={() => setAjuda((v) => !v)} {...{ title: AJUDA }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 }}>
          <Icon name="info" size={16} color={p.info} />
          <Txt variant="bodySm" tone="muted">Pontuação</Txt>
        </Pressable>
      </View>
      {ajuda ? <Txt variant="bodySm" tone="muted" style={{ lineHeight: 20, paddingHorizontal: space[2] }}>{AJUDA}</Txt> : null}
      <View style={{ gap: 4 }}>
        {rows.map((row) => <Linha key={`${row.position}-${row.name}-${row.is_me}`} row={row} isDesktop={isDesktop} />)}
        {pinned ? (
          <>
            <View style={{ height: 1, backgroundColor: p.line, marginVertical: 4 }} />
            <Linha row={pinned} isDesktop={isDesktop} />
          </>
        ) : null}
      </View>
    </View>
  );
}
