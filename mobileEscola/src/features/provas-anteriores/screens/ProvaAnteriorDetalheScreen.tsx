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
  const { pastExamId } = route.params;
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
        <ProvasAnterioresHeader variant="detail" />
        <View style={styles.centro}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.carregandoTexto}>Carregando prova…</Text>
        </View>
      </View>
    );
  }

  if (isError || !prova) {
    return (
      <View style={styles.container}>
        <ProvasAnterioresHeader variant="detail" />
        <View style={styles.centro}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.border} />
          <Text style={styles.erroTexto}>
            {getApiErrorMessage(error, 'Prova não encontrada.')}
          </Text>
          <TouchableOpacity style={styles.botaoTentar} onPress={() => refetch()} activeOpacity={0.85}>
            <Text style={styles.botaoTentarTexto}>Tentar novamente</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.botaoVoltarLink}>
            <Text style={styles.botaoVoltarLinkTexto}>Voltar para a lista</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const subjectColor = prova.subject?.color ?? colors.primary;
  const cursoLabel =
    prova.courses?.length
      ? prova.courses.map((c) => c.name).join(', ')
      : prova.course?.name ?? null;
  const tamanhoArquivo = formatFileSize(prova.file_size);
  const botaoLabel =
    prova.type === 'file'
      ? prova.file_type === 'pdf'
        ? 'Abrir PDF da prova'
        : 'Abrir arquivo da prova'
      : 'Abrir prova no navegador';

  return (
    <View style={styles.container}>
      <ProvasAnterioresHeader variant="detail" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: tint(subjectColor, '0D', colors.soft),
              borderColor: tint(subjectColor, '35', colors.soft),
              borderTopColor: subjectColor,
              ...platformShadow({ color: subjectColor, opacity: 0.1, radius: 16, elevation: 2 }),
            },
          ]}
        >
          <View style={[styles.cardGlow, { backgroundColor: tint(subjectColor, '18', colors.soft) }]} />

          <View style={styles.headerBlock}>
            <View style={styles.titleGroup}>
              {prova.subject ? (
                <View style={[styles.subjectBadge, { backgroundColor: tint(subjectColor, '18', colors.soft) }]}>
                  <Ionicons
                    name={subjectIconName(prova.subject.icon) as any}
                    size={15}
                    color={subjectColor}
                  />
                  <Text style={[styles.subjectBadgeText, { color: subjectColor }]}>
                    {prova.subject.name}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.titulo}>{prova.title}</Text>
            </View>
            <View style={[styles.tipoBadge, { backgroundColor: tint(subjectColor, '14', colors.soft) }]}>
              <Ionicons name="archive-outline" size={15} color={subjectColor} />
              <Text style={[styles.tipoBadgeText, { color: subjectColor }]}>Prova anterior</Text>
            </View>
          </View>

          {prova.description ? (
            <Text style={styles.descricao}>{prova.description}</Text>
          ) : null}

          <View style={styles.metaBox}>
            {prova.exam_year ? (
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                <Text style={styles.metaLabel}>Ano</Text>
                <Text style={styles.metaValue}>{prova.exam_year}</Text>
              </View>
            ) : null}
            {prova.exam_type_label ? (
              <View style={styles.metaRow}>
                <Ionicons name="layers-outline" size={16} color={colors.muted} />
                <Text style={styles.metaLabel}>Tipo</Text>
                <Text style={styles.metaValue}>{prova.exam_type_label}</Text>
              </View>
            ) : null}
            {cursoLabel ? (
              <View style={styles.metaRow}>
                <Ionicons name="school-outline" size={16} color={colors.muted} />
                <Text style={styles.metaLabel}>Curso</Text>
                <Text style={styles.metaValue}>{cursoLabel}</Text>
              </View>
            ) : null}
            {tamanhoArquivo ? (
              <View style={styles.metaRow}>
                <Ionicons name="document-outline" size={16} color={colors.muted} />
                <Text style={styles.metaLabel}>Arquivo</Text>
                <Text style={styles.metaValue}>{tamanhoArquivo}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.avisoBox, { backgroundColor: tint(subjectColor, '12', colors.soft) }]}>
            <Ionicons name="information-circle-outline" size={18} color={subjectColor} />
            <Text style={[styles.avisoTexto, { color: subjectColor }]}>
              Material de consulta publicado pela escola. Abra o arquivo para estudar offline ou no navegador.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.botaoAcao, { backgroundColor: subjectColor }]}
            onPress={abrirConteudo}
            activeOpacity={0.85}
          >
            <Ionicons
              name={prova.type === 'file' ? 'document-text-outline' : 'open-outline'}
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
    container: { flex: 1, backgroundColor: '#F6F7FB' },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 32 },

    centro: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    carregandoTexto: { marginTop: 12, fontSize: 14, color: colors.muted },
    erroTexto: {
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
      marginTop: 12,
      lineHeight: 20,
      paddingHorizontal: 16,
    },
    botaoTentar: {
      marginTop: 20,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 12,
    },
    botaoTentarTexto: { color: colors.surface, fontWeight: '700', fontSize: 15 },
    botaoVoltarLink: { marginTop: 14, padding: 8 },
    botaoVoltarLinkTexto: { color: colors.primary, fontWeight: '600', fontSize: 14 },

    card: {
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderTopWidth: 4,
      overflow: 'hidden',
    },
    cardGlow: {
      position: 'absolute',
      width: 240,
      height: 240,
      borderRadius: 120,
      right: -110,
      top: -112,
      opacity: 0.92,
    },
    headerBlock: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
      flexWrap: 'wrap',
    },
    titleGroup: { flex: 1, minWidth: 200 },
    subjectBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginBottom: 10,
    },
    subjectBadgeText: { fontSize: 12, fontWeight: '800' },
    tipoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    tipoBadgeText: { fontSize: 12, fontWeight: '800' },
    titulo: { fontSize: 22, fontWeight: '800', color: colors.ink, lineHeight: 28 },
    descricao: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 16 },

    metaBox: {
      backgroundColor: 'rgba(255,255,255,0.72)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.95)',
      borderRadius: 14,
      padding: 12,
      gap: 10,
      marginBottom: 14,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    metaLabel: {
      width: 58,
      fontSize: 12,
      fontWeight: '800',
      color: colors.muted,
      textTransform: 'uppercase',
    },
    metaValue: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },

    avisoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 14,
      padding: 12,
      marginBottom: 16,
    },
    avisoTexto: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },

    botaoAcao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
    },
    botaoAcaoTexto: { color: colors.surface, fontWeight: '800', fontSize: 16 },
  });
}
