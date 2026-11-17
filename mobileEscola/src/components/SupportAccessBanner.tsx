import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';

/** Faixa do acesso de suporte: a sessão é a do aluno, por tempo limitado, e o encerramento revoga o token. */
export function SupportAccessBanner({ expiresAt }: { expiresAt: string }) {
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const until = new Date(expiresAt);
  const label = Number.isNaN(until.getTime())
    ? ''
    : until.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: '#FEF3C7',
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Text style={{ flex: 1, color: '#78350F', fontSize: 13, lineHeight: 18 }}>
        Acesso de suporte nesta conta{label ? ` até ${label}` : ''}. O que você fizer fica registrado.
      </Text>
      <TouchableOpacity
        onPress={() => {
          setLeaving(true);
          void signOut();
        }}
        disabled={leaving}
        accessibilityRole="button"
        accessibilityLabel="Encerrar acesso de suporte"
        style={{
          borderWidth: 1,
          borderColor: '#D6D3D1',
          backgroundColor: '#FFFFFF',
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#1C1917' }}>
          {leaving ? 'Encerrando...' : 'Encerrar acesso'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
