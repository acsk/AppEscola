import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SimuladosScreen }       from '../../features/simulados/screens/SimuladosScreen';
import { SimuladoDetalheScreen } from '../../features/simulados/screens/SimuladoDetalheScreen';
import { SimuladoExamScreen }    from '../../features/simulados/screens/SimuladoExamScreen';

export type SimuladosStackParamList = {
  SimuladosList: undefined;
  SimuladoDetalhe: { examId: number };
  SimuladoExam: { examId: number; attemptId: number };
};

const Stack = createNativeStackNavigator<SimuladosStackParamList>();
const HEADER_BG = '#1E1B4B';

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
        options={{
          title: 'Simulado',
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: HEADER_BG },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
      <Stack.Screen
        name="SimuladoExam"
        component={SimuladoExamScreen}
        options={{
          title: 'Simulado',
          headerBackTitle: 'Detalhes',
          headerStyle: { backgroundColor: HEADER_BG },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600' },
        }}
      />
    </Stack.Navigator>
  );
}
