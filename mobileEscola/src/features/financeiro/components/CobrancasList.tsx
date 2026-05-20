import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Cobranca, CobrancasResponse } from '../../../services/financeiro.service';
import { colors } from '../../../theme';
import { CobrancaCard } from './CobrancaCard';
import { styles } from '../styles/financeiro.styles';

interface CobrancasListProps {
  data: CobrancasResponse;
  onPagar: (cobranca: Cobranca) => void;
}

export function CobrancasList({ data, onPagar }: CobrancasListProps) {
  const cobrancasAbertas = data.abertas.length ? data.abertas : data.atual ? [data.atual] : [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {data.atrasados.length > 0 && (
        <View style={styles.secaoCard}>
          <View style={styles.secaoHeader}>
            <View style={[styles.secaoIcone, styles.secaoIconeAtrasada]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.debit} />
            </View>
            <View style={styles.secaoTituloWrap}>
              <Text style={styles.secaoTitulo}>Atrasados</Text>
              <Text style={styles.secaoSubtitulo}>
                {data.atrasados.length}{' '}
                {data.atrasados.length === 1 ? 'cobrança pendente' : 'cobranças pendentes'}
              </Text>
            </View>
          </View>
          {data.atrasados.map((cobranca) => (
            <CobrancaCard key={cobranca.id} cobranca={cobranca} tipo="atrasada" onPagar={onPagar} />
          ))}
        </View>
      )}

      {cobrancasAbertas.length > 0 && (
        <View style={styles.secaoCard}>
          <View style={styles.secaoHeader}>
            <View style={[styles.secaoIcone, styles.secaoIconeAtual]}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.secaoTituloWrap}>
              <Text style={styles.secaoTitulo}>Cobranças em aberto</Text>
              <Text style={styles.secaoSubtitulo}>
                {cobrancasAbertas.length}{' '}
                {cobrancasAbertas.length === 1 ? 'mensalidade em aberto' : 'mensalidades em aberto'}
              </Text>
            </View>
          </View>
          {cobrancasAbertas.map((cobranca) => (
            <CobrancaCard key={cobranca.id} cobranca={cobranca} tipo="atual" onPagar={onPagar} />
          ))}
        </View>
      )}

      {data.pagas.length > 0 && (
        <View style={styles.secaoCard}>
          <View style={styles.secaoHeader}>
            <View style={[styles.secaoIcone, styles.secaoIconePaga]}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.credit} />
            </View>
            <View style={styles.secaoTituloWrap}>
              <Text style={styles.secaoTitulo}>Histórico de pagamentos</Text>
              <Text style={styles.secaoSubtitulo}>
                {data.pagas.length}{' '}
                {data.pagas.length === 1 ? 'pagamento confirmado' : 'pagamentos confirmados'}
              </Text>
            </View>
          </View>
          {data.pagas.map((cobranca) => (
            <CobrancaCard key={cobranca.id} cobranca={cobranca} tipo="paga" />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
