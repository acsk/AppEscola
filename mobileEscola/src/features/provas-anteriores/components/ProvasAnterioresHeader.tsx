import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SimuladosStackParamList } from '../../../navigation/stacks/SimuladosStack';
import { MenuButton } from '../../../components/navigation/MenuButton';
import { useThemeColors } from '../../../context/TenantThemeContext';
import type { ThemeColors } from '../../../theme';

type Nav = NativeStackNavigationProp<SimuladosStackParamList>;

export function ProvasAnterioresHeader() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  return (
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
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
  });
}
