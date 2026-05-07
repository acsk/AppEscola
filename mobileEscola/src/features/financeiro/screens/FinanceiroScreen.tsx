import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../../theme';

interface Transacao {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  tipo: 'credito' | 'debito';
  icone: string;
}

const TRANSACOES: Transacao[] = [
  { id: '1', descricao: 'Mensalidade - Maio/2026', valor: 650.0, data: '01/05/2026', tipo: 'debito', icone: 'school-outline' },
  { id: '2', descricao: 'Material didático', valor: 120.0, data: '15/04/2026', tipo: 'debito', icone: 'book-outline' },
  { id: '3', descricao: 'Bolsa de estudos', valor: 300.0, data: '10/04/2026', tipo: 'credito', icone: 'ribbon-outline' },
  { id: '4', descricao: 'Mensalidade - Abril/2026', valor: 650.0, data: '01/04/2026', tipo: 'debito', icone: 'school-outline' },
  { id: '5', descricao: 'Taxa de laboratório', valor: 80.0, data: '20/03/2026', tipo: 'debito', icone: 'flask-outline' },
];

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function FinanceiroScreen() {
  const insets = useSafeAreaInsets();

  const totalDebito = TRANSACOES
    .filter((t) => t.tipo === 'debito')
    .reduce((acc, t) => acc + t.valor, 0);

  const totalCredito = TRANSACOES
    .filter((t) => t.tipo === 'credito')
    .reduce((acc, t) => acc + t.valor, 0);

  const saldo = totalCredito - totalDebito;

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitulo}>Financeiro</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.saldoCard}>
          <Text style={styles.saldoLabel}>Saldo devedor</Text>
          <Text style={styles.saldoValor}>{formatarMoeda(Math.abs(saldo))}</Text>
          <View style={styles.saldoMeta}>
            <Ionicons name="calendar-outline" size={14} color="#CBD5E1" />
            <Text style={styles.saldoMetaTexto}>Atualizado em maio/2026</Text>
          </View>
        </View>

        <View style={styles.resumo}>
          <View style={styles.resumoItem}>
            <View style={[styles.resumoIcone, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="arrow-down-outline" size={18} color={colors.debit} />
            </View>
            <Text style={styles.resumoLabel}>Total a pagar</Text>
            <Text style={[styles.resumoValor, { color: colors.debit }]}>{formatarMoeda(totalDebito)}</Text>
          </View>
          <View style={styles.divisor} />
          <View style={styles.resumoItem}>
            <View style={[styles.resumoIcone, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="arrow-up-outline" size={18} color={colors.credit} />
            </View>
            <Text style={styles.resumoLabel}>Benefícios</Text>
            <Text style={[styles.resumoValor, { color: colors.credit }]}>{formatarMoeda(totalCredito)}</Text>
          </View>
        </View>

        {/* Extrato */}
        <View style={styles.secaoHeader}>
          <Text style={styles.secaoTitulo}>Extrato</Text>
          <Text style={styles.secaoContador}>{TRANSACOES.length} lançamentos</Text>
        </View>

        {TRANSACOES.map((transacao) => (
          <View key={transacao.id} style={styles.transacaoCard}>
            <View style={[
              styles.transacaoIcone,
              { backgroundColor: transacao.tipo === 'debito' ? '#FEF2F2' : '#ECFDF5' }
            ]}>
              <Ionicons
                name={transacao.icone as any}
                size={20}
                color={transacao.tipo === 'debito' ? colors.debit : colors.credit}
              />
            </View>
            <View style={styles.transacaoInfo}>
              <Text style={styles.transacaoDescricao}>{transacao.descricao}</Text>
              <Text style={styles.transacaoData}>{transacao.data}</Text>
            </View>
            <Text style={[
              styles.transacaoValor,
              { color: transacao.tipo === 'debito' ? colors.debit : colors.credit }
            ]}>
              {transacao.tipo === 'debito' ? '-' : '+'}{formatarMoeda(transacao.valor)}
            </Text>
          </View>
        ))}

        <TouchableOpacity style={styles.botaoBoleto} activeOpacity={0.8}>
          <Ionicons name="document-text-outline" size={20} color={colors.surface} />
          <Text style={styles.botaoBoletoTexto}>Gerar 2ª via do boleto</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  headerWrap: {
    backgroundColor: colors.ink,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  headerTitulo: { fontSize: 22, fontWeight: '800', color: colors.surface, paddingTop: 18, paddingBottom: 14 },
  saldoCard: {
    backgroundColor: colors.ink,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  saldoLabel: { fontSize: 13, color: '#CBD5E1', marginBottom: 6, fontWeight: '700' },
  saldoValor: { fontSize: 31, fontWeight: '800', color: colors.surface },
  saldoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(238,242,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  saldoMetaTexto: { fontSize: 12, color: '#CBD5E1', fontWeight: '600' },
  resumo: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  resumoItem: { alignItems: 'center', flex: 1 },
  resumoIcone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resumoLabel: { fontSize: 12, color: colors.muted, marginBottom: 4, fontWeight: '600' },
  resumoValor: { fontSize: 16, fontWeight: '800' },
  divisor: { width: 1, height: 72, backgroundColor: colors.border },
  secaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  secaoTitulo: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  secaoContador: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  transacaoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  transacaoIcone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transacaoInfo: { flex: 1 },
  transacaoDescricao: { fontSize: 14, fontWeight: '700', color: colors.ink },
  transacaoData: { fontSize: 12, color: colors.muted, marginTop: 3 },
  transacaoValor: { fontSize: 15, fontWeight: '800' },
  botaoBoleto: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  botaoBoletoTexto: { color: colors.surface, fontSize: 15, fontWeight: '800' },
});
