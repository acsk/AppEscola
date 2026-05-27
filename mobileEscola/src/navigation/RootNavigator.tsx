import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { useAuth } from '../context/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { AlunoStack } from './stacks/AlunoStack';
import { AdminStack } from './stacks/AdminStack';
import { ProfessorStack } from './stacks/ProfessorStack';
import { ChangePasswordScreen } from '../features/auth/screens/ChangePasswordScreen';
import { colors } from '../theme';

import * as Linking from 'expo-linking';

const prefix = Linking.createURL('/');

const linking: LinkingOptions<any> = {
  prefixes: [prefix, 'mobileescola://'],
  config: {
    screens: {
      Login: 'login',
      PublicRegister: {
        path: ':tenantSlug/register',
        parse: {
          tenantSlug: (slug: string) => slug,
        },
      },
      AlunoTabs: {
        screens: {
          Home:       'home',
          Desempenho: 'desempenho',
          Simulados: {
            path: 'simulados',
            screens: {
              SimuladosList: '',
              ProvasAnteriores: 'provas-anteriores',
              Exercicios: 'exercicios',
              ProvaAnteriorDetalhe: {
                path: 'provas-anteriores/:pastExamId',
                parse: { pastExamId: (id: string) => Number(id) },
                stringify: { pastExamId: (id: number) => String(id) },
              },
              SimuladoDetalhe: {
                path: ':examId',
                parse:     { examId: (id: string) => Number(id) },
                stringify: { examId: (id: number) => String(id) },
              },
              SimuladoExam: {
                path: ':examId/exam/:attemptId',
                parse: {
                  examId:    (id: string) => Number(id),
                  attemptId: (id: string) => Number(id),
                },
                stringify: {
                  examId:    (id: number) => String(id),
                  attemptId: (id: number) => String(id),
                },
              },
            },
          },
          Financeiro: 'financeiro',
        },
      },
      AlterarSenha: 'alterar-senha',
    },
  },
};

export function RootNavigator() {
  const { user, isLoading, requirePasswordChange } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  function renderStack() {
    if (!user) return <AuthNavigator />;

    if (requirePasswordChange) return <ChangePasswordScreen />;

    switch (user.role) {
      case 'admin':
      case 'super_admin':
        return <AdminStack />;
      case 'professor':
        return <ProfessorStack />;
      case 'aluno':
        return <AlunoStack />;
      default:
        return <AuthNavigator />;
    }
  }

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      {renderStack()}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});
