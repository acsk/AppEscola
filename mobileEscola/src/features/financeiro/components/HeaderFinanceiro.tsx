import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CobrancasResponse } from '../../../services/financeiro.service';
import { useThemeColors } from '../../../context/TenantThemeContext';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { formatarMoeda, formatarReferenciaMes } from '../utils/formatters';
import { useFinanceiroStyles } from '../FinanceiroStylesContext';

interface HeaderFinanceiroProps {
  topInset: number;
  resumo?: CobrancasResponse['resumo'];
  referencia?: CobrancasResponse['referencia'];
}

export function HeaderFinanceiro({ topInset, resumo, referencia }: HeaderFinanceiroProps) {
  const colors = useThemeColors();
  const styles = useFinanceiroStyles();
  const periodoAtual = referencia ? formatarReferenciaMes(referencia) : null;

  return (
    <View style={[styles.headerWrap, { paddingTop: topInset }]}>
      <View style={styles.headerGlowPrimary} />
      <View style={styles.headerGlowSecondary} />
      <View style={styles.headerTituloRow}>
        <MenuButton />
        <View style={styles.headerTituloConteudo}>
          <View style={styles.headerTituloIcone}>
            <Ionicons name="cash-outline" size={24} color={colors.surface} />
          </View>
          <Text style={styles.headerTitulo}>Financeiro</Text>
        </View>
      </View>
      {resumo ? (
        <View style={styles.resumoGrid}>
          <View style={styles.resumoItem}>
            <View style={[styles.resumoIcone, styles.resumoIconeAtrasado]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.debit} />
            </View>
            <Text style={styles.resumoItemLabel}>Atrasados</Text>
            <Text style={[styles.resumoItemValor, { color: colors.debit }]}>
              {formatarMoeda(resumo.valor_total_atrasados)}
            </Text>
            <Text style={styles.resumoItemQtd}>{resumo.quantidade_atrasados} cobranças</Text>
          </View>

          {resumo.possui_atual && (
            <>
              <View style={styles.divisorResumo} />
              <View style={styles.resumoItem}>
                <View style={[styles.resumoIcone, styles.resumoIconeAtual]}>
                  <Ionicons name="calendar-outline" size={16} color="#F97316" />
                </View>
                <Text style={styles.resumoItemLabel}>Atual</Text>
                <Text style={[styles.resumoItemValor, { color: '#F97316' }]}>
                  {formatarMoeda(resumo.valor_atual || '0')}
                </Text>
                {periodoAtual ? (
                  <Text style={styles.resumoItemQtd}>{periodoAtual}</Text>
                ) : null}
              </View>
            </>
          )}

          <View style={styles.divisorResumo} />
          <View style={styles.resumoItem}>
            <View style={[styles.resumoIcone, styles.resumoIconePago]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.credit} />
            </View>
            <Text style={styles.resumoItemLabel}>Pagas</Text>
            <Text style={[styles.resumoItemValor, { color: colors.credit }]}>
              {formatarMoeda(resumo.valor_total_pagas)}
            </Text>
            <Text style={styles.resumoItemQtd}>{resumo.quantidade_pagas} cobranças</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
