import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { platformShadow } from '../lib/shadow';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDestructive?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmDestructive = false,
  icon = 'alert-circle-outline',
  iconColor = '#F59E0B',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      {/* Backdrop separado — não envolve o card, elimina bubbling */}
      <Pressable style={s.backdrop} onPress={onCancel} />

      <View style={[s.overlay, { pointerEvents: 'box-none' }]}>
        <View style={s.card}>
          {/* Ícone */}
          <View style={[s.iconCircle, { backgroundColor: iconColor + '1A' }]}>
            <Ionicons name={icon} size={32} color={iconColor} />
          </View>

          {/* Textos */}
          <Text style={s.title}>{title}</Text>
          <Text style={s.message}>{message}</Text>

          {/* Botões */}
          <View style={s.row}>
            <TouchableOpacity
              style={[s.btn, s.btnCancel]}
              onPress={onCancel}
              activeOpacity={0.75}
            >
              <Text style={s.btnCancelText}>{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, confirmDestructive ? s.btnDanger : s.btnPrimary]}
              onPress={onConfirm}
              activeOpacity={0.75}
            >
              <Text style={[s.btnText, { color: colors.surface }]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    ...platformShadow({ color: '#000000', opacity: 0.15, radius: 20, elevation: 10, offsetY: 4 }),
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: '#F3F4F6',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnDanger: {
    backgroundColor: colors.debit,
  },
  btnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
