import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { HomeScreen } from '../../features/home/screens/HomeScreen';
import { SimuladosScreen } from '../../features/simulados/screens/SimuladosScreen';
import { colors } from '../../theme';

// ── Tela placeholder — Minhas Turmas ───────────────────────────────────────
function TurmasScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="albums-outline" size={56} color={colors.credit} style={{ marginBottom: 16 }} />
      <Text style={styles.titulo}>Minhas Turmas</Text>
      <Text style={styles.subtitulo}>Em breve disponível</Text>
    </View>
  );
}

type ProfessorTabParamList = {
  Turmas: undefined;
  Simulados: undefined;
  Home: undefined;
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  Turmas:    { active: 'albums',     inactive: 'albums-outline' },
  Simulados: { active: 'clipboard',  inactive: 'clipboard-outline' },
  Home:      { active: 'home',       inactive: 'home-outline' },
};

const Tab = createBottomTabNavigator<ProfessorTabParamList>();

export function ProfessorStack() {
  const { signOut } = useAuth();

  function confirmarSair() {
    Alert.alert('Sair', 'Deseja sair do aplicativo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#065F46' },
        headerTintColor: colors.surface,
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: colors.credit,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: '#F3F4F6', height: 60, paddingBottom: 4 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = ICONS[route.name];
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
        headerRight: () => (
          <TouchableOpacity onPress={confirmarSair} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color={colors.surface} />
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen name="Turmas"    component={TurmasScreen}    options={{ title: 'Minhas Turmas' }} />
      <Tab.Screen name="Simulados" component={SimuladosScreen} options={{ title: 'Simulados' }} />
      <Tab.Screen name="Home"      component={HomeScreen}      options={{ title: 'Home', headerShown: false }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  titulo: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitulo: { fontSize: 14, color: '#6B7280' },
});
