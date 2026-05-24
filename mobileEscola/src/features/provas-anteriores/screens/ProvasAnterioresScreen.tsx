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

function tint(hex: string | undefined, alpha: string, fallback: string): string {
  if (!hex || !hex.startsWith('#')) return fallback;
  return `${hex}${alpha}`;
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
      <View style={styles.headerGlowPrimary} />
      <View style={styles.headerGlowSecondary} />
      <View style={styles.headerTituloRow}>
        <MenuButton />
        <Text style={styles.headerTitulo}>Provas anteriores</Text>
        <TouchableOpacity
          style={styles.headerLinkBtn}
          onPress={() => navigation.navigate('SimuladosList')}
          activeOpacity={0.85}
        >
          <Ionicons name="clipboard-outline" size={16} color={colors.surface} />
          <Text style={styles.headerLinkTexto}>Simulados</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: PastExamListItem }) => {
    const subjectColor = item.subject?.color ?? colors.primary;
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: tint(subjectColor, '10', colors.soft),
            borderColor: tint(subjectColor, '35', colors.border),
            shadowColor: subjectColor,
          },
        ]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('ProvaAnteriorDetalhe', { pastExamId: item.id })}
      >
        {item.subject ? (
          <View style={[styles.cardAccent, { backgroundColor: subjectColor }]} />
        ) : null}
        <View style={styles.cardTopo}>
          {item.subject ? (
            <View style={[styles.subjectChip, { backgroundColor: tint(subjectColor, '18', colors.soft) }]}>
              <Ionicons
                name={subjectIconName(item.subject.icon) as any}
                size={12}
                color={subjectColor}
              />
              <Text style={[styles.subjectNome, { color: subjectColor }]}>{item.subject.name}</Text>
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
          <Ionicons name="document-outline" size={14} color={colors.muted} />
          <Text style={styles.rodapeTexto}>PDF</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.centrado}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.carregandoTexto}>Carregando provas anteriores…</Text>
        </View>
      </View>
    );
  }

  if (erro) {
    return (
      <View style={styles.container}>
        {header}
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
      {header}
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
            <Text style={styles.contador}>
              {itens.length} prova{itens.length !== 1 ? 's' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Ionicons name="folder-open-outline" size={48} color={colors.border} />
            <Text style={styles.vazioTitulo}>Nenhuma prova anterior disponível</Text>
            <Text style={styles.vazioSub}>
              Quando sua escola publicar provas, elas aparecerão aqui.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F6F7FB' },
    headerWrap: {
      backgroundColor: '#FBFAFF',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      overflow: 'hidden',
      shadowColor: '#7C3AED',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 3,
    },
    headerGlowPrimary: {
      position: 'absolute',
      width: 320,
      height: 320,
      borderRadius: 160,
      right: -104,
      top: -150,
      backgroundColor: '#F0E9FF',
      opacity: 0.92,
    },
    headerGlowSecondary: {
      position: 'absolute',
      width: 190,
      height: 190,
      borderRadius: 95,
      left: -76,
      top: 58,
      backgroundColor: '#F7F2FF',
      opacity: 0.98,
    },
    headerTituloRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: 18,
      paddingBottom: 14,
    },
    headerTitulo: { flex: 1, fontSize: 22, fontWeight: '800', color: '#111827' },
    headerLinkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    headerLinkTexto: { fontSize: 11, fontWeight: '700', color: colors.surface },
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
    contador: { fontSize: 13, color: colors.muted },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 16,
      paddingLeft: 20,
      marginBottom: 12,
      overflow: 'hidden',
      borderWidth: 1,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 2,
    },
    cardAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    cardTopo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    subjectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
    },
    subjectNome: { fontSize: 11, fontWeight: '800' },
    anoChip: {
      backgroundColor: '#EEF2FF',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
    },
    anoTexto: { fontSize: 11, fontWeight: '800', color: '#64748B' },
    cardTitulo: { fontSize: 16, fontWeight: '800', color: colors.ink, lineHeight: 22 },
    subtitulo: { fontSize: 12, color: colors.muted, marginTop: 4 },
    cursosTexto: { fontSize: 11, color: colors.muted, marginTop: 4 },
    rodape: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    rodapeTexto: { fontSize: 12, color: colors.muted },
    centrado: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
      backgroundColor: '#F6F7FB',
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
