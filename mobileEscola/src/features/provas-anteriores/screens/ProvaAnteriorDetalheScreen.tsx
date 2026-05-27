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
import { getApiErrorMessage } from '../../../lib/apiError';
import { formatDataProva } from '../../../services/past-exams.service';
import { platformShadow } from '../../../lib/shadow';
import { useProvaAnteriorDetail } from '../hooks';
import { ProvasAnterioresHeader } from '../components/ProvasAnterioresHeader';
import { PastMaterialPdfIcon } from '../components/PastMaterialPdfIcon';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'ProvaAnteriorDetalhe'>;

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

  const dataProva = formatDataProva(prova.exam_date, prova.exam_year);
  const isPdf = prova.type === 'file' && (prova.file_type === 'pdf' || !prova.file_type);
  const pdfBadge = prova.type === 'link' ? 'LINK' : isPdf ? 'PDF' : 'ARQ';
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
        <View
          style={[
            styles.card,
            platformShadow({ color: colors.primary, opacity: 0.08, radius: 12, elevation: 2 }),
          ]}
        >
          <View style={[styles.cardAccent, { backgroundColor: colors.primary }]} />

          <View style={styles.pdfHero}>
            <PastMaterialPdfIcon
              variant="detail"
              fileLabel={pdfBadge}
              isLink={prova.type === 'link'}
            />
            {tamanhoArquivo ? <Text style={styles.pdfTamanho}>{tamanhoArquivo}</Text> : null}
          </View>

          {prova.subject ? (
            <Text style={styles.disciplina}>{prova.subject.name.toUpperCase()}</Text>
          ) : null}
          <Text style={styles.titulo}>{prova.title}</Text>

          <View style={styles.metaBox}>
            {dataProva ? (
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={15} color={colors.primary} />
                <Text style={styles.metaTexto}>{dataProva}</Text>
              </View>
            ) : null}
            {prova.exam_type_label ? (
              <View style={styles.metaRow}>
                <Ionicons name="layers-outline" size={15} color={colors.primary} />
                <Text style={styles.metaTexto}>{prova.exam_type_label}</Text>
              </View>
            ) : null}
            {cursoLabel ? (
              <View style={styles.metaRow}>
                <Ionicons name="school-outline" size={15} color={colors.primary} />
                <Text style={styles.metaTexto} numberOfLines={2}>
                  {cursoLabel}
                </Text>
              </View>
            ) : null}
          </View>

          {prova.description ? (
            <Text style={styles.descricao} numberOfLines={3}>
              {prova.description}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.botaoAcao}
            onPress={abrirConteudo}
            activeOpacity={0.85}
          >
            <Ionicons
              name={prova.type === 'file' ? 'document-text' : 'open-outline'}
              size={20}
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
      paddingTop: 16,
      paddingBottom: 16,
      paddingHorizontal: 16,
      paddingLeft: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      alignItems: 'stretch',
    },
    cardAccent: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
    },
    pdfHero: {
      alignItems: 'center',
      marginBottom: 12,
      gap: 6,
    },
    pdfTamanho: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.muted,
    },
    disciplina: {
      fontSize: 10,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    titulo: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.ink,
      lineHeight: 22,
      marginBottom: 10,
      textAlign: 'center',
    },
    metaBox: {
      backgroundColor: colors.soft,
      borderRadius: 12,
      padding: 10,
      gap: 8,
      marginBottom: 10,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    metaTexto: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    descricao: {
      fontSize: 12,
      color: colors.muted,
      lineHeight: 17,
      marginBottom: 12,
      textAlign: 'center',
    },
    botaoAcao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    botaoAcaoTexto: { color: colors.surface, fontWeight: '800', fontSize: 15 },
  });
}
