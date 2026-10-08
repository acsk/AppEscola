import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { font, usePalette } from '../../ui';
import { BancoQuestoesScreen } from '../../features/banco-questoes/screens/BancoQuestoesScreen';
import { BancoPraticarScreen } from '../../features/banco-questoes/screens/BancoPraticarScreen';
import { BancoSimuladoScreen } from '../../features/banco-questoes/screens/BancoSimuladoScreen';
import { BancoDesempenhoScreen } from '../../features/banco-questoes/screens/BancoDesempenhoScreen';
import { BancoRankingScreen } from '../../features/banco-questoes/screens/BancoRankingScreen';

/** Aba "Questões" (banco de questões do aluno). */
export type QuestoesStackParamList = {
  /** `subjectId` chega já marcado (ex.: "Treinar estes assuntos antes" no simulado). */
  BancoQuestoes: { subjectId?: number } | undefined;
  BancoPraticar: { subjectId?: number; topicId?: number } | undefined;
  /** `setId` inicia (ou retoma) o simulado do banco; `attemptId` abre uma tentativa já existente. */
  BancoSimulado: { setId?: number; attemptId?: number; title?: string };
  BancoDesempenho: undefined;
  BancoRanking: undefined;
};

const Stack = createNativeStackNavigator<QuestoesStackParamList>();

export function QuestoesNavigator() {
  const p = usePalette();
  return (
    <Stack.Navigator
      screenOptions={{
        animation: 'slide_from_right',
        animationTypeForReplace: 'push',
        gestureDirection: 'horizontal',
        fullScreenGestureEnabled: true,
        // Cabeçalho do design system: sobre o fundo da tela, título em tinta, sem sombra.
        headerStyle: { backgroundColor: p.bg },
        headerTintColor: p.ink,
        headerShadowVisible: false,
        headerTitleStyle: { ...font.bold, fontSize: 17 },
        headerBackTitle: 'Voltar',
        contentStyle: { backgroundColor: p.bg },
      }}
    >
      <Stack.Screen name="BancoQuestoes" component={BancoQuestoesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BancoPraticar" component={BancoPraticarScreen} options={{ title: 'Praticar questões' }} />
      <Stack.Screen name="BancoSimulado" component={BancoSimuladoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BancoDesempenho" component={BancoDesempenhoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BancoRanking" component={BancoRankingScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
