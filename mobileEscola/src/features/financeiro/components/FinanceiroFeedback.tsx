import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../../context/TenantThemeContext';
import { useFinanceiroStyles } from '../FinanceiroStylesContext';

export function FinanceiroLoading() {
  const colors = useThemeColors();
  const styles = useFinanceiroStyles();

  return (
    <View style={styles.telaVaziaContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.telaVaziaTexto}>Carregando...</Text>
    </View>
  );
}

export function FinanceiroEmpty() {
  const colors = useThemeColors();
  const styles = useFinanceiroStyles();

  return (
    <View style={styles.telaVaziaContainer}>
      <Ionicons name="document-text-outline" size={64} color={colors.muted} />
      <Text style={styles.telaVaziaTexto}>Nenhuma cobrança encontrada</Text>
      <Text style={styles.telaVaziaSubtexto}>Você está com todas as contas em dia 🎉</Text>
    </View>
  );
}

interface FinanceiroErrorProps {
  message: string;
  onRetry: () => void;
}

export function FinanceiroError({ message, onRetry }: FinanceiroErrorProps) {
  const colors = useThemeColors();
  const styles = useFinanceiroStyles();

  return (
    <View style={styles.telaVaziaContainer}>
      <Ionicons name="alert-circle-outline" size={64} color={colors.debit} />
      <Text style={styles.telaVaziaTexto}>Erro ao carregar</Text>
      <Text style={styles.telaVaziaSubtexto}>{message}</Text>
      <TouchableOpacity style={styles.botaoTentarNovamente} onPress={onRetry}>
        <Text style={styles.botaoTentarNovamenteTexto}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}
