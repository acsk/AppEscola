import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Cobranca } from '../../../services/financeiro.service';
import { useThemeColors } from '../../../context/TenantThemeContext';
import { formatarData, formatarMoeda } from '../utils/formatters';
import { useFinanceiroStyles } from '../FinanceiroStylesContext';

export type CobrancaCardTipo = 'atrasada' | 'atual' | 'paga';

interface CobrancaCardProps {
  cobranca: Cobranca;
  tipo: CobrancaCardTipo;
  onPagar?: (cobranca: Cobranca) => void;
}

export function CobrancaCard({ cobranca, tipo, onPagar }: CobrancaCardProps) {
  const colors = useThemeColors();
  const styles = useFinanceiroStyles();
  const corFundo = tipo === 'atrasada' ? '#FEF2F2' : tipo === 'atual' ? colors.soft : '#ECFDF5';
  const corBorda = tipo === 'atrasada' ? '#FEE2E2' : tipo === 'atual' ? colors.border : '#D1FAE5';
  const corIcone = tipo === 'atrasada' ? colors.debit : tipo === 'atual' ? colors.primary : colors.credit;
  const icone =
    tipo === 'atrasada' ? 'alert-circle-outline' : tipo === 'atual' ? 'time-outline' : 'checkmark-circle-outline';
  const statusLabel = tipo === 'atrasada' ? 'Atrasado' : tipo === 'atual' ? 'Aberto' : 'Pago';

  return (
    <View
      style={[
        styles.cobrancaCard,
        {
          backgroundColor: colors.surface,
          borderColor: corBorda,
          borderLeftColor: corIcone,
        },
      ]}
    >
      <View style={styles.cobrancaHeader}>
        <View style={[styles.cobrancaIcone, { backgroundColor: corFundo }]}>
          <Ionicons name={icone as any} size={21} color={corIcone} />
        </View>
        <View style={styles.cobrancaInfo}>
          <Text style={styles.cobrancaDescricao}>{cobranca.description}</Text>
          <Text style={styles.cobrancaData}>Vencimento: {formatarData(cobranca.due_date)}</Text>
        </View>
        <View style={styles.cobrancaMeta}>
          <Text
            style={[
              styles.cobrancaStatus,
              { backgroundColor: corFundo, color: corIcone },
              tipo === 'paga' && styles.cobrancaStatusPago,
            ]}
          >
            {statusLabel}
          </Text>
          <Text style={styles.cobrancaValor}>{formatarMoeda(cobranca.amount)}</Text>
        </View>
      </View>

      {tipo !== 'paga' && onPagar && (
        <View style={styles.acoesBotoes}>
          <TouchableOpacity
            style={[styles.botaoAcao, styles.botaoPagarPrimario]}
            onPress={() => onPagar(cobranca)}
          >
            <Ionicons name="card-outline" size={19} color={colors.surface} />
            <Text style={styles.botaoAcaoTexto}>Pagar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
