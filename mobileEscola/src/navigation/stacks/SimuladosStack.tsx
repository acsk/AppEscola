import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SimuladosScreen }       from '../../features/simulados/screens/SimuladosScreen';
import { SimuladoDetalheScreen } from '../../features/simulados/screens/SimuladoDetalheScreen';
import { SimuladoExamScreen }    from '../../features/simulados/screens/SimuladoExamScreen';

export type SimuladosStackParamList = {
  SimuladosList: undefined;
  SimuladoDetalhe: { examId: number; examTitle?: string };
  SimuladoExam: { examId: number; attemptId: number; examTitle?: string };
};

const Stack = createNativeStackNavigator<SimuladosStackParamList>();

export function SimuladosNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="SimuladosList"
        component={SimuladosScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SimuladoDetalhe"
        component={SimuladoDetalheScreen}
        options={({ route }) => ({
          title: route.params.examTitle ?? 'Simulado',
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: '#4F46E5' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600' },
        })}
      />
      <Stack.Screen
        name="SimuladoExam"
        component={SimuladoExamScreen}
        options={({ route }) => ({
          title: route.params.examTitle ?? 'Simulado',
          headerBackTitle: 'Detalhes',
          headerStyle: { backgroundColor: '#4F46E5' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600' },
        })}
      />
    </Stack.Navigator>
  );
}
