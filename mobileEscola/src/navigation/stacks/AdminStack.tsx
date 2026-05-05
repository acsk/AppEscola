import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { HomeScreen } from '../../features/home/screens/HomeScreen';
import { SimuladosScreen } from '../../features/simulados/screens/SimuladosScreen';

// ── Tela placeholder — Dashboard Admin ─────────────────────────────────────
function AdminDashboardScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.titulo}>Dashboard</Text>
      <View style={styles.grid}>
        {[
          { label: 'Alunos',      icone: 'people-outline',   cor: '#4F46E5' },
          { label: 'Professores', icone: 'school-outline',   cor: '#10B981' },
          { label: 'Turmas',      icone: 'albums-outline',   cor: '#F59E0B' },
          { label: 'Relatórios',  icone: 'bar-chart-outline', cor: '#EF4444' },
        ].map((item) => (
          <View key={item.label} style={[styles.card, { borderLeftColor: item.cor }]}>
            <Ionicons name={item.icone as any} size={28} color={item.cor} />
            <Text style={styles.cardLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

type AdminTabParamList = {
  Dashboard: undefined;
  Simulados: undefined;
  Home: undefined;
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, { active: IoniconsName; inactive: IoniconsName }> = {
  Dashboard: { active: 'grid',       inactive: 'grid-outline' },
  Simulados: { active: 'clipboard',  inactive: 'clipboard-outline' },
  Home:      { active: 'home',       inactive: 'home-outline' },
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

export function AdminStack() {
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
        headerStyle: { backgroundColor: '#1E1B4B' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#F3F4F6', height: 60, paddingBottom: 4 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = ICONS[route.name];
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
        headerRight: () => (
          <TouchableOpacity onPress={confirmarSair} style={{ marginRight: 16 }}>
            <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Simulados" component={SimuladosScreen}      options={{ title: 'Simulados' }} />
      <Tab.Screen name="Home"      component={HomeScreen}           options={{ title: 'Home', headerShown: false }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 20 },
  titulo: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  cardLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
});
