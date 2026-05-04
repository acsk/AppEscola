import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  const totalDebito = TRANSACOES
    .filter((t) => t.tipo === 'debito')
    .reduce((acc, t) => acc + t.valor, 0);

  const totalCredito = TRANSACOES
    .filter((t) => t.tipo === 'credito')
    .reduce((acc, t) => acc + t.valor, 0);

  const saldo = totalCredito - totalDebito;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Resumo */}
      <View style={styles.resumo}>
        <View style={styles.resumoItem}>
          <Ionicons name="arrow-down-circle-outline" size={24} color="#EF4444" />
          <Text style={styles.resumoLabel}>Total a pagar</Text>
          <Text style={[styles.resumoValor, { color: '#EF4444' }]}>{formatarMoeda(totalDebito)}</Text>
        </View>
        <View style={styles.divisor} />
        <View style={styles.resumoItem}>
          <Ionicons name="arrow-up-circle-outline" size={24} color="#10B981" />
          <Text style={styles.resumoLabel}>Benefícios</Text>
          <Text style={[styles.resumoValor, { color: '#10B981' }]}>{formatarMoeda(totalCredito)}</Text>
        </View>
      </View>

      <View style={styles.saldoCard}>
        <Text style={styles.saldoLabel}>Saldo devedor</Text>
        <Text style={[styles.saldoValor, { color: saldo < 0 ? '#EF4444' : '#10B981' }]}>
          {formatarMoeda(Math.abs(saldo))}
        </Text>
      </View>

      {/* Extrato */}
      <Text style={styles.secaoTitulo}>Extrato</Text>

      {TRANSACOES.map((transacao) => (
        <View key={transacao.id} style={styles.transacaoCard}>
          <View style={[
            styles.transacaoIcone,
            { backgroundColor: transacao.tipo === 'debito' ? '#FEF2F2' : '#F0FDF4' }
          ]}>
            <Ionicons
              name={transacao.icone as any}
              size={20}
              color={transacao.tipo === 'debito' ? '#EF4444' : '#10B981'}
            />
          </View>
          <View style={styles.transacaoInfo}>
            <Text style={styles.transacaoDescricao}>{transacao.descricao}</Text>
            <Text style={styles.transacaoData}>{transacao.data}</Text>
          </View>
          <Text style={[
            styles.transacaoValor,
            { color: transacao.tipo === 'debito' ? '#EF4444' : '#10B981' }
          ]}>
            {transacao.tipo === 'debito' ? '-' : '+'}{formatarMoeda(transacao.valor)}
          </Text>
        </View>
      ))}

      <TouchableOpacity style={styles.botaoBoleto} activeOpacity={0.8}>
        <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
        <Text style={styles.botaoBoletoTexto}>Gerar 2ª via do boleto</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, paddingBottom: 40 },
  resumo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  resumoItem: { alignItems: 'center', flex: 1 },
  resumoLabel: { fontSize: 12, color: '#6B7280', marginTop: 6, marginBottom: 4 },
  resumoValor: { fontSize: 16, fontWeight: '700' },
  divisor: { width: 1, height: 60, backgroundColor: '#F3F4F6' },
  saldoCard: {
    backgroundColor: '#4F46E5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  saldoLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  saldoValor: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  secaoTitulo: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  transacaoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  transacaoDescricao: { fontSize: 14, fontWeight: '500', color: '#111827' },
  transacaoData: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  transacaoValor: { fontSize: 15, fontWeight: '600' },
  botaoBoleto: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  botaoBoletoTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
