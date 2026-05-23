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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { subjectIconName } from '../../../services/simulados.service';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useProvaAnteriorDetail } from '../hooks';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type Props = NativeStackScreenProps<SimuladosStackParamList, 'ProvaAnteriorDetalhe'>;

export function ProvaAnteriorDetalheScreen({ route, navigation }: Props) {
  const { pastExamId } = route.params;
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { data: prova, isLoading, isError, error } = useProvaAnteriorDetail(pastExamId);

  const abrirConteudo = async () => {
    if (!prova?.content) return;
    const url = prova.content.trim();
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('Não foi possível abrir', 'O link desta prova não está disponível.');
      return;
    }
    await Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !prova) {
    return (
      <View style={styles.centro}>
        <Text style={styles.erro}>
          {getApiErrorMessage(error, 'Prova não encontrada.')}
        </Text>
      </View>
    );
  }

  const subjectColor = prova.subject?.color ?? colors.primary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {prova.subject ? (
        <View style={[styles.chip, { backgroundColor: `${subjectColor}18` }]}>
          <Ionicons
            name={subjectIconName(prova.subject.icon) as any}
            size={14}
            color={subjectColor}
          />
          <Text style={[styles.chipTexto, { color: subjectColor }]}>{prova.subject.name}</Text>
        </View>
      ) : null}

      <Text style={styles.titulo}>{prova.title}</Text>

      <View style={styles.metaRow}>
        {prova.exam_year ? (
          <View style={styles.metaChip}>
            <Ionicons name="calendar-outline" size={14} color={colors.muted} />
            <Text style={styles.metaTexto}>{prova.exam_year}</Text>
          </View>
        ) : null}
        {prova.exam_type_label ? (
          <View style={styles.metaChip}>
            <Text style={styles.metaTexto}>{prova.exam_type_label}</Text>
          </View>
        ) : null}
        {prova.course?.name ? (
          <View style={styles.metaChip}>
            <Ionicons name="book-outline" size={14} color={colors.muted} />
            <Text style={styles.metaTexto}>{prova.course.name}</Text>
          </View>
        ) : null}
      </View>

      {prova.description ? (
        <Text style={styles.descricao}>{prova.description}</Text>
      ) : null}

      <TouchableOpacity style={styles.botao} onPress={abrirConteudo} activeOpacity={0.85}>
        <Ionicons
          name={prova.type === 'file' ? 'document-text-outline' : 'open-outline'}
          size={20}
          color={colors.surface}
        />
        <Text style={styles.botaoTexto}>Abrir PDF da prova</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

ProvaAnteriorDetalheScreen.displayName = 'ProvaAnteriorDetalhe';

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 20, paddingBottom: 40 },
    centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    erro: { color: colors.muted, textAlign: 'center', padding: 24 },
    chip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      marginBottom: 12,
    },
    chipTexto: { fontSize: 12, fontWeight: '700' },
    titulo: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 12 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.soft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    metaTexto: { fontSize: 12, color: colors.muted, fontWeight: '600' },
    descricao: { fontSize: 15, lineHeight: 22, color: colors.ink, marginBottom: 24 },
    botao: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 14,
    },
    botaoTexto: { color: colors.surface, fontWeight: '800', fontSize: 15 },
  });
}
