import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  anoDaProva,
  extrairAnosDasProvas,
  extrairDisciplinasDasProvas,
  type PastExamListItem,
  type PastExamMaterialKind,
} from '../../../services/past-exams.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useProvasAnterioresList } from '../hooks';
import { ProvasAnterioresHeader } from '../components/ProvasAnterioresHeader';
import { PastMaterialCard } from '../components/PastMaterialCard';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type ListScreenName = 'ProvasAnteriores' | 'Exercicios';

type Nav = NativeStackNavigationProp<SimuladosStackParamList>;

export type PastMaterialListScreenProps = {
  materialKind: PastExamMaterialKind;
  listScreen: ListScreenName;
};

const COPY = {
  prova: {
    title: 'Provas anteriores',
    searchPlaceholder: 'Buscar prova...',
    loading: 'Carregando provas anteriores…',
    error: 'Não foi possível carregar as provas anteriores.',
    counter: (n: number) =>
      n === 1 ? '1 prova encontrada' : `${n} provas encontradas`,
    emptyTitle: 'Nenhuma prova anterior disponível',
    emptySub: 'Quando sua escola publicar provas, elas aparecerão aqui.',
    dateLabel: 'Data da prova',
  },
  exercicio: {
    title: 'Exercícios',
    searchPlaceholder: 'Buscar exercício...',
    loading: 'Carregando exercícios…',
    error: 'Não foi possível carregar os exercícios.',
    counter: (n: number) =>
      n === 1 ? '1 exercício encontrado' : `${n} exercícios encontrados`,
    emptyTitle: 'Nenhum exercício disponível',
    emptySub: 'Quando sua escola publicar exercícios, eles aparecerão aqui.',
    dateLabel: 'Data',
  },
} as const;

export function PastMaterialListScreen({ materialKind, listScreen }: PastMaterialListScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const copy = COPY[materialKind];
  const [busca, setBusca] = useState('');
  const [anoFiltro, setAnoFiltro] = useState<number | null>(null);
  const [disciplinaFiltro, setDisciplinaFiltro] = useState<number | null>(null);

  const {
    data: todas = [],
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
  } = useProvasAnterioresList({ material_kind: materialKind });

  const disciplinas = useMemo(() => extrairDisciplinasDasProvas(todas), [todas]);
  const anos = useMemo(() => extrairAnosDasProvas(todas), [todas]);

  const itens = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todas.filter((item) => {
      if (anoFiltro != null && anoDaProva(item.exam_date, item.exam_year) !== anoFiltro) return false;
      if (disciplinaFiltro != null && item.subject?.id !== disciplinaFiltro) return false;
      if (!termo) return true;
      return (
        item.title.toLowerCase().includes(termo) ||
        (item.description ?? '').toLowerCase().includes(termo) ||
        (item.exam_type_label ?? '').toLowerCase().includes(termo)
      );
    });
  }, [todas, busca, anoFiltro, disciplinaFiltro]);

  const erro = isError ? getApiErrorMessage(error, copy.error) : null;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const renderItem = ({ item }: { item: PastExamListItem }) => (
    <PastMaterialCard
      item={item}
      dateLabel={copy.dateLabel}
      onPress={() =>
        navigation.navigate('ProvaAnteriorDetalhe', {
          pastExamId: item.id,
          listScreen,
          materialKind,
        })
      }
    />
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ProvasAnterioresHeader title={copy.title} listScreen={listScreen} />
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.carregandoTexto}>{copy.loading}</Text>
        </View>
      </View>
    );
  }

  if (erro) {
    return (
      <View style={styles.container}>
        <ProvasAnterioresHeader title={copy.title} listScreen={listScreen} />
        <View style={styles.centrado}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.border} />
          <Text style={styles.erroTexto}>{erro}</Text>
          <TouchableOpacity style={styles.botaoTentar} onPress={() => refetch()} activeOpacity={0.8}>
            <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ProvasAnterioresHeader title={copy.title} listScreen={listScreen} />
      <FlatList
        data={itens}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.lista, itens.length === 0 && styles.listaComVazio]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.filtros}>
            <TextInput
              style={styles.busca}
              placeholder={copy.searchPlaceholder}
              placeholderTextColor={colors.muted}
              value={busca}
              onChangeText={setBusca}
            />
            {anos.length > 0 ? (
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  style={[styles.filtroChip, anoFiltro === null && styles.filtroChipAtivo]}
                  onPress={() => setAnoFiltro(null)}
                >
                  <Text style={[styles.filtroChipTexto, anoFiltro === null && styles.filtroChipTextoAtivo]}>
                    Todos os anos
                  </Text>
                </TouchableOpacity>
                {anos.map((ano) => (
                  <TouchableOpacity
                    key={ano}
                    style={[styles.filtroChip, anoFiltro === ano && styles.filtroChipAtivo]}
                    onPress={() => setAnoFiltro(ano)}
                  >
                    <Text style={[styles.filtroChipTexto, anoFiltro === ano && styles.filtroChipTextoAtivo]}>
                      {ano}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {disciplinas.length > 0 ? (
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  style={[styles.filtroChip, disciplinaFiltro === null && styles.filtroChipAtivo]}
                  onPress={() => setDisciplinaFiltro(null)}
                >
                  <Text style={[styles.filtroChipTexto, disciplinaFiltro === null && styles.filtroChipTextoAtivo]}>
                    Todas
                  </Text>
                </TouchableOpacity>
                {disciplinas.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.filtroChip, disciplinaFiltro === d.id && styles.filtroChipAtivo]}
                    onPress={() => setDisciplinaFiltro(d.id)}
                  >
                    <Text style={[styles.filtroChipTexto, disciplinaFiltro === d.id && styles.filtroChipTextoAtivo]}>
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <Text style={styles.contador}>{copy.counter(itens.length)}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Ionicons name="folder-open-outline" size={48} color={colors.border} />
            <Text style={styles.vazioTitulo}>{copy.emptyTitle}</Text>
            <Text style={styles.vazioSub}>{copy.emptySub}</Text>
          </View>
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    lista: { padding: 16, paddingTop: 12, paddingBottom: 32 },
    listaComVazio: { flexGrow: 1 },
    filtros: { gap: 10, marginBottom: 12 },
    busca: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.ink,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filtroChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filtroChipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
    filtroChipTexto: { fontSize: 12, fontWeight: '600', color: colors.ink },
    filtroChipTextoAtivo: { color: colors.surface },
    contador: { fontSize: 13, color: colors.muted, fontWeight: '600' },
    centrado: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    carregandoTexto: { marginTop: 12, fontSize: 14, color: colors.muted },
    erroTexto: { fontSize: 14, color: colors.text, textAlign: 'center', marginTop: 12, lineHeight: 20 },
    botaoTentar: {
      marginTop: 20,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    botaoTentarTexto: { color: colors.surface, fontWeight: '600', fontSize: 15 },
    vazio: { alignItems: 'center', padding: 32 },
    vazioTitulo: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 16, textAlign: 'center' },
    vazioSub: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  });
}
