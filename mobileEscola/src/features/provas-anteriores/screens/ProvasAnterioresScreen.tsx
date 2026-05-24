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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import {
  extrairAnosDasProvas,
  extrairDisciplinasDasProvas,
  type PastExamListItem,
} from '../../../services/past-exams.service';
import { subjectIconName } from '../../../services/simulados.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useProvasAnterioresList } from '../hooks';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type Nav = NativeStackNavigationProp<SimuladosStackParamList, 'ProvasAnteriores'>;

function formatFileLabel(fileType: string | null): string {
  if (fileType === 'pdf') return 'PDF';
  if (fileType === 'image') return 'Imagem';
  return 'Arquivo';
}

export function ProvasAnterioresScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
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
  } = useProvasAnterioresList();

  const disciplinas = useMemo(() => extrairDisciplinasDasProvas(todas), [todas]);
  const anos = useMemo(() => extrairAnosDasProvas(todas), [todas]);

  const itens = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return todas.filter((item) => {
      if (anoFiltro != null && item.exam_year !== anoFiltro) return false;
      if (disciplinaFiltro != null && item.subject?.id !== disciplinaFiltro) return false;
      if (!termo) return true;
      return (
        item.title.toLowerCase().includes(termo) ||
        (item.description ?? '').toLowerCase().includes(termo) ||
        (item.exam_type_label ?? '').toLowerCase().includes(termo)
      );
    });
  }, [todas, busca, anoFiltro, disciplinaFiltro]);

  const erro = isError
    ? getApiErrorMessage(error, 'Não foi possível carregar as provas anteriores.')
    : null;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const header = (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <MenuButton />
        <TouchableOpacity
          onPress={() => navigation.navigate('SimuladosList')}
          style={styles.voltarBtn}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitulo}>Provas anteriores</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: PastExamListItem }) => {
    const subjectColor = item.subject?.color ?? colors.primary;
    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: `${subjectColor}35` }]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('ProvaAnteriorDetalhe', { pastExamId: item.id })}
      >
        <View style={styles.cardTopo}>
          {item.subject ? (
            <View style={[styles.chip, { backgroundColor: `${subjectColor}18` }]}>
              <Ionicons
                name={subjectIconName(item.subject.icon) as any}
                size={12}
                color={subjectColor}
              />
              <Text style={[styles.chipTexto, { color: subjectColor }]}>{item.subject.name}</Text>
            </View>
          ) : null}
          {item.exam_year ? (
            <View style={styles.anoChip}>
              <Text style={styles.anoTexto}>{item.exam_year}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardTitulo} numberOfLines={2}>
          {item.title}
        </Text>
        {item.exam_type_label ? (
          <Text style={styles.subtitulo}>{item.exam_type_label}</Text>
        ) : null}
        {(item.courses?.length || item.course) ? (
          <Text style={styles.cursosTexto} numberOfLines={1}>
            {(item.courses?.length
              ? item.courses.map((c) => c.name)
              : item.course
                ? [item.course.name]
                : []
            ).join(', ')}
          </Text>
        ) : null}
        <View style={styles.rodape}>
          <Ionicons
            name={item.type === 'file' ? 'document-outline' : 'link-outline'}
            size={14}
            color={colors.muted}
          />
          <Text style={styles.rodapeTexto}>PDF</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centro}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (erro) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centro}>
          <Text style={styles.erro}>{erro}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryTexto}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <FlatList
        data={itens}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.lista}
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
              placeholder="Buscar prova..."
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
                  <Text style={styles.filtroChipTexto}>Todos os anos</Text>
                </TouchableOpacity>
                {anos.map((ano) => (
                  <TouchableOpacity
                    key={ano}
                    style={[styles.filtroChip, anoFiltro === ano && styles.filtroChipAtivo]}
                    onPress={() => setAnoFiltro(ano)}
                  >
                    <Text style={styles.filtroChipTexto}>{ano}</Text>
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
                  <Text style={styles.filtroChipTexto}>Todas</Text>
                </TouchableOpacity>
                {disciplinas.map((d) => (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.filtroChip, disciplinaFiltro === d.id && styles.filtroChipAtivo]}
                    onPress={() => setDisciplinaFiltro(d.id)}
                  >
                    <Text style={styles.filtroChipTexto}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <Text style={styles.contador}>
              {itens.length} prova{itens.length !== 1 ? 's' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centro}>
            <Ionicons name="folder-open-outline" size={48} color={colors.border} />
            <Text style={styles.vazio}>Nenhuma prova anterior disponível</Text>
          </View>
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerWrap: {
      backgroundColor: colors.primary,
      paddingBottom: 16,
      paddingHorizontal: 16,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    voltarBtn: { padding: 4 },
    headerTitulo: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.surface },
    lista: { padding: 16, paddingBottom: 32, gap: 12 },
    filtros: { gap: 10, marginBottom: 8 },
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
      backgroundColor: colors.soft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filtroChipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
    filtroChipTexto: { fontSize: 12, fontWeight: '600', color: colors.ink },
    contador: { fontSize: 13, color: colors.muted },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      marginBottom: 10,
    },
    cardTopo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    chipTexto: { fontSize: 11, fontWeight: '700' },
    anoChip: {
      backgroundColor: colors.soft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    anoTexto: { fontSize: 11, fontWeight: '700', color: colors.muted },
    cardTitulo: { fontSize: 16, fontWeight: '800', color: colors.ink },
    subtitulo: { fontSize: 12, color: colors.muted, marginTop: 4 },
    cursosTexto: { fontSize: 11, color: colors.muted, marginTop: 4 },
    rodape: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    rodapeTexto: { fontSize: 12, color: colors.muted },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    erro: { color: colors.muted, textAlign: 'center', marginBottom: 12 },
    retryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    retryTexto: { color: colors.surface, fontWeight: '700' },
    vazio: { marginTop: 12, color: colors.muted, textAlign: 'center' },
  });
}
