import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SimuladosScreen }       from '../../features/simulados/screens/SimuladosScreen';
import { SimuladoDetalheScreen } from '../../features/simulados/screens/SimuladoDetalheScreen';
import { SimuladoExamScreen }    from '../../features/simulados/screens/SimuladoExamScreen';
import { SimuladoResultScreen }  from '../../features/simulados/screens/SimuladoResultScreen';
import { ProvasAnterioresScreen } from '../../features/provas-anteriores/screens/ProvasAnterioresScreen';
import { ExerciciosScreen } from '../../features/provas-anteriores/screens/ExerciciosScreen';
import { MateriaisScreen } from '../../features/provas-anteriores/screens/MateriaisScreen';
import { ProvaAnteriorDetalheScreen } from '../../features/provas-anteriores/screens/ProvaAnteriorDetalheScreen';
import { BancoQuestoesScreen } from '../../features/banco-questoes/screens/BancoQuestoesScreen';
import { BancoPraticarScreen } from '../../features/banco-questoes/screens/BancoPraticarScreen';
import { BancoSimuladoScreen } from '../../features/banco-questoes/screens/BancoSimuladoScreen';
import { BancoDesempenhoScreen } from '../../features/banco-questoes/screens/BancoDesempenhoScreen';
import { BancoRankingScreen } from '../../features/banco-questoes/screens/BancoRankingScreen';
import type { PastExamMaterialKind } from '../../services/past-exams.service';
import { useThemeColors } from '../../context/TenantThemeContext';

export type SimuladosStackParamList = {
  SimuladosList: undefined;
  ProvasAnteriores: undefined;
  Exercicios: undefined;
  Materiais: undefined;
  ProvaAnteriorDetalhe: {
    pastExamId: number;
    listScreen?: 'ProvasAnteriores' | 'Exercicios' | 'Materiais';
    materialKind?: PastExamMaterialKind;
  };
  SimuladoDetalhe: { examId: number };
  SimuladoExam: { examId: number; attemptId: number };
  SimuladoResult: { attemptId: number };
  BancoQuestoes: undefined;
  BancoPraticar: { subjectId?: number; topicId?: number } | undefined;
  /** `setId` inicia (ou retoma) o simulado do banco; `attemptId` abre uma tentativa já existente. */
  BancoSimulado: { setId?: number; attemptId?: number; title?: string };
  BancoDesempenho: undefined;
  BancoRanking: undefined;
};

const Stack = createNativeStackNavigator<SimuladosStackParamList>();

export function SimuladosNavigator() {
  const colors = useThemeColors();

  return (
    <Stack.Navigator
      screenOptions={{
        animation: 'slide_from_right',
        animationTypeForReplace: 'push',
        gestureDirection: 'horizontal',
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="SimuladosList"
        component={SimuladosScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProvasAnteriores"
        component={ProvasAnterioresScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Exercicios"
        component={ExerciciosScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Materiais"
        component={MateriaisScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProvaAnteriorDetalhe"
        component={ProvaAnteriorDetalheScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SimuladoDetalhe"
        component={SimuladoDetalheScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SimuladoExam"
        component={SimuladoExamScreen}
        options={{
          title: 'Simulado',
          headerBackTitle: 'Detalhes',
          headerStyle: { backgroundColor: colors.ink },
          headerTintColor: colors.surface,
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="SimuladoResult"
        component={SimuladoResultScreen}
        options={{
          title: 'Resultado',
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: colors.ink },
          headerTintColor: colors.surface,
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <Stack.Group
        screenOptions={{
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.surface,
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="BancoQuestoes" component={BancoQuestoesScreen} options={{ title: 'Banco de questões' }} />
        <Stack.Screen name="BancoPraticar" component={BancoPraticarScreen} options={{ title: 'Praticar questões' }} />
        <Stack.Screen name="BancoSimulado" component={BancoSimuladoScreen} options={{ title: 'Simulado do banco' }} />
        <Stack.Screen name="BancoDesempenho" component={BancoDesempenhoScreen} options={{ title: 'O que estudar' }} />
        <Stack.Screen name="BancoRanking" component={BancoRankingScreen} options={{ title: 'Ranking' }} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
