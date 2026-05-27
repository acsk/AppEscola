import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SimuladosScreen }       from '../../features/simulados/screens/SimuladosScreen';
import { SimuladoDetalheScreen } from '../../features/simulados/screens/SimuladoDetalheScreen';
import { SimuladoExamScreen }    from '../../features/simulados/screens/SimuladoExamScreen';
import { SimuladoResultScreen }  from '../../features/simulados/screens/SimuladoResultScreen';
import { ProvasAnterioresScreen } from '../../features/provas-anteriores/screens/ProvasAnterioresScreen';
import { ExerciciosScreen } from '../../features/provas-anteriores/screens/ExerciciosScreen';
import { ProvaAnteriorDetalheScreen } from '../../features/provas-anteriores/screens/ProvaAnteriorDetalheScreen';
import type { PastExamMaterialKind } from '../../services/past-exams.service';
import { useThemeColors } from '../../context/TenantThemeContext';

export type SimuladosStackParamList = {
  SimuladosList: undefined;
  ProvasAnteriores: undefined;
  Exercicios: undefined;
  ProvaAnteriorDetalhe: {
    pastExamId: number;
    listScreen?: 'ProvasAnteriores' | 'Exercicios';
    materialKind?: PastExamMaterialKind;
  };
  SimuladoDetalhe: { examId: number };
  SimuladoExam: { examId: number; attemptId: number };
  SimuladoResult: { attemptId: number };
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
        name="ProvaAnteriorDetalhe"
        component={ProvaAnteriorDetalheScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SimuladoDetalhe"
        component={SimuladoDetalheScreen}
        options={{
          title: 'Simulado',
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: '#FBFAFF' },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '800', color: '#111827' },
          headerShadowVisible: false,
        }}
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
    </Stack.Navigator>
  );
}
