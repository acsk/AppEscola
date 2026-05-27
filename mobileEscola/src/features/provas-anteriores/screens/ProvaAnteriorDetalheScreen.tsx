import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { subjectIconName } from '../../../services/simulados.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { formatDataProva } from '../../../services/past-exams.service';
import { platformShadow } from '../../../lib/shadow';
import { useProvaAnteriorDetail } from '../hooks';
import { ProvasAnterioresHeader } from '../components/ProvasAnterioresHeader';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'ProvaAnteriorDetalhe'>;

function tint(hex: string | undefined, alpha: string, fallback: string): string {
  if (!hex || !hex.startsWith('#')) return fallback;
  return `${hex}${alpha}`;
}

function formatFileSize(bytes: number | null | undefined): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function ProvaAnteriorDetalheScreen({ route, navigation }: Props) {
  const {
    pastExamId,
    listScreen = 'ProvasAnteriores',
    materialKind = 'prova',
  } = route.params;
  const isExercicio = materialKind === 'exercicio';
  const listTitle = isExercicio ? 'Exercícios' : 'Provas anteriores';
  const detailTitle = isExercicio ? 'Exercício' : 'Prova';
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: prova, isLoading, isError, error, refetch } = useProvaAnteriorDetail(pastExamId);

  const abrirConteudo = async () => {
    if (!prova?.content) return;
    const url = prova.content.trim();

    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Não foi possível abrir', 'O link desta prova não está disponível.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Não foi possível abrir', 'Tente novamente em instantes.');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ProvasAnterioresHeader
          variant="detail"
          title={listTitle}
          listScreen={listScreen}
          detailTitle={detailTitle}
        />
        <View style={styles.centro}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.carregandoTexto}>
            {isExercicio ? 'Carregando exercício…' : 'Carregando prova…'}
          </Text>
        </View>
      </View>
    );
  }

  if (isError || !prova) {
    return (
      <View style={styles.container}>
        <ProvasAnterioresHeader
          variant="detail"
          title={listTitle}
          listScreen={listScreen}
          detailTitle={detailTitle}
        />
        <View style={styles.centro}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.border} />
          <Text style={styles.erroTexto}>
            {getApiErrorMessage(
              error,
              isExercicio ? 'Exercício não encontrado.' : 'Prova não encontrada.',
            )}
          </Text>
          <TouchableOpacity style={styles.botaoTentar} onPress={() => refetch()} activeOpacity={0.85}>
            <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate(listScreen)}
            style={styles.botaoVoltarLink}
          >
            <Text style={styles.botaoVoltarLinkTexto}>Voltar para a lista</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const subjectColor = prova.subject?.color ?? colors.primary;
  const dataProva = formatDataProva(prova.exam_date, prova.exam_year);
  const cursoLabel =
    prova.courses?.length
      ? prova.courses.map((c) => c.name).join(', ')
      : prova.course?.name ?? null;
  const tamanhoArquivo = formatFileSize(prova.file_size);
  const botaoLabel =
    prova.type === 'file'
      ? prova.file_type === 'pdf'
        ? isExercicio
          ? 'Abrir PDF do exercício'
          : 'Abrir PDF da prova'
        : isExercicio
          ? 'Abrir arquivo do exercício'
          : 'Abrir arquivo da prova'
      : isExercicio
        ? 'Abrir exercício no navegador'
        : 'Abrir prova no navegador';

  return (
    <View style={styles.container}>
      <ProvasAnterioresHeader
        variant="detail"
        title={listTitle}
        listScreen={listScreen}
        detailTitle={detailTitle}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, platformShadow({ color: '#7C3AED', opacity: 0.06, radius: 10, elevation: 2 })]}>
          <View style={[styles.cardAccent, { backgroundColor: colors.primary }]} />

          {prova.subject ? (
            <View style={[styles.subjectChip, { backgroundColor: tint(subjectColor, '18', colors.soft) }]}>
              <Ionicons
                name={subjectIconName(prova.subject.icon) as any}
                size={12}
                color={subjectColor}
              />
              <Text style={[styles.subjectNome, { color: subjectColor }]}>{prova.subject.name}</Text>
            </View>
          ) : null}

          <Text style={styles.titulo}>{prova.title}</Text>

          {(dataProva || prova.exam_type_label) ? (
            <View style={styles.chipsRow}>
              {dataProva ? (
                <View style={styles.metaChip}>
                  <Ionicons name="calendar-outline" size={13} color={colors.muted} />
                  <Text style={styles.metaChipTexto}>{dataProva}</Text>
                </View>
              ) : null}
              {prova.exam_type_label ? (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipTexto}>{prova.exam_type_label}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {cursoLabel ? (
            <Text style={styles.linhaMeta} numberOfLines={2}>
              <Text style={styles.linhaMetaLabel}>Curso </Text>
              {cursoLabel}
            </Text>
          ) : null}

          {tamanhoArquivo ? (
            <View style={styles.arquivoRow}>
              <Ionicons name="document-outline" size={14} color={colors.muted} />
              <Text style={styles.linhaMeta}>{tamanhoArquivo}</Text>
            </View>
          ) : null}

          {prova.description ? (
            <Text style={styles.descricao} numberOfLines={4}>
              {prova.description}
            </Text>
          ) : null}

          <View style={styles.avisoBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.avisoTexto}>
              Material de consulta da escola. Abra o arquivo para estudar.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.botaoAcao}
            onPress={abrirConteudo}
            activeOpacity={0.85}
          >
            <Ionicons
              name={prova.type === 'file' ? 'document-text-outline' : 'open-outline'}
              size={18}
              color={colors.surface}
            />
            <Text style={styles.botaoAcaoTexto}>{botaoLabel}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

ProvaAnteriorDetalheScreen.displayName = 'ProvaAnteriorDetalhe';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },

    centro: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    carregandoTexto: { marginTop: 10, fontSize: 14, color: colors.muted },
    erroTexto: {
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
      marginTop: 10,
      lineHeight: 20,
      paddingHorizontal: 16,
    },
    botaoTentar: {
      marginTop: 16,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 11,
    },
    botaoTentarTexto: { color: colors.surface, fontWeight: '700', fontSize: 14 },
    botaoVoltarLink: { marginTop: 12, padding: 6 },
    botaoVoltarLinkTexto: { color: colors.primary, fontWeight: '600', fontSize: 14 },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      paddingLeft: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    cardAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    subjectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 20,
      marginBottom: 8,
    },
    subjectNome: { fontSize: 11, fontWeight: '800' },
    titulo: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.ink,
      lineHeight: 24,
      marginBottom: 8,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.soft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    metaChipTexto: { fontSize: 12, fontWeight: '600', color: colors.text },
    linhaMeta: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 4 },
    linhaMetaLabel: { fontWeight: '700', color: colors.muted },
    arquivoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    descricao: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
      marginTop: 4,
      marginBottom: 10,
    },
    avisoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.soft,
      borderRadius: 10,
      padding: 10,
      marginTop: 6,
      marginBottom: 12,
    },
    avisoTexto: {
      flex: 1,
      fontSize: 12,
      color: colors.text,
      lineHeight: 17,
    },
    botaoAcao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    botaoAcaoTexto: { color: colors.surface, fontWeight: '700', fontSize: 15 },
  });
}
