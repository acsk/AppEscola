import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ConsultaStatusModalData } from '../hooks/usePaymentModal';
import {
  formatarStatusCobranca,
  obterEstiloBadgeStatus,
  obterTemaModalStatus,
  statusEhPago,
} from '../utils/payment';
import { formatarData, formatarMoeda } from '../utils/formatters';
import { colors } from '../../../theme';
import { styles } from '../styles/financeiro.styles';

interface ConsultaStatusModalProps {
  visible: boolean;
  data: ConsultaStatusModalData | null;
  onClose: () => void;
}

const BADGE_STYLES = {
  pendente: {
    container: styles.consultaStatusBadgePendente,
    texto: styles.consultaStatusBadgeTextoPendente,
  },
  paga: {
    container: styles.consultaStatusBadgePaga,
    texto: styles.consultaStatusBadgeTextoPaga,
  },
  atrasada: {
    container: styles.consultaStatusBadgeAtrasada,
    texto: styles.consultaStatusBadgeTextoAtrasada,
  },
  cancelada: {
    container: styles.consultaStatusBadgeCancelada,
    texto: styles.consultaStatusBadgeTextoCancelada,
  },
  default: {
    container: styles.consultaStatusBadgeDefault,
    texto: styles.consultaStatusBadgeTextoDefault,
  },
} as const;

export function ConsultaStatusModal({ visible, data, onClose }: ConsultaStatusModalProps) {
  const isPago = Boolean(data && statusEhPago(data.invoice.status));
  const tema = data ? obterTemaModalStatus(data.invoice.status) : null;
  const badgeKey = data ? obterEstiloBadgeStatus(data.invoice.status).badge : null;
  const badgeStyle = badgeKey ? BADGE_STYLES[badgeKey] : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.consultaStatusOverlay}>
        <View style={styles.consultaStatusCard}>
          <View
            style={[
              styles.consultaStatusTopBar,
              isPago ? styles.consultaStatusTopBarSucesso : styles.consultaStatusTopBarWarning,
            ]}
          />

          <TouchableOpacity
            style={styles.consultaStatusFecharBtn}
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={colors.muted} />
          </TouchableOpacity>

          {tema && (
            <View
              style={[
                styles.consultaStatusIconeWrap,
                isPago ? styles.consultaStatusIconeWrapSucesso : styles.consultaStatusIconeWrapWarning,
              ]}
            >
              <Ionicons name={tema.indicadorIcone as any} size={38} color={isPago ? '#16A34A' : '#D97706'} />
            </View>
          )}

          {tema && (
            <Text style={[styles.consultaStatusStatusTexto, { color: isPago ? '#16A34A' : '#D97706' }]}>
              {tema.indicadorTexto}
            </Text>
          )}

          {data && (
            <>
              <Text style={styles.consultaStatusDescricao} numberOfLines={2}>
                {data.invoice.description}
              </Text>

              <Text style={styles.consultaStatusVencimento}>
                <Ionicons name="calendar-outline" size={13} color={colors.muted} /> Vence em{' '}
                {formatarData(data.invoice.due_date)}
              </Text>

              <Text style={styles.consultaStatusValor}>{formatarMoeda(data.invoice.amount)}</Text>

              {badgeStyle && (
                <View style={[styles.consultaStatusBadge, badgeStyle.container]}>
                  <Text style={[styles.consultaStatusBadgeTexto, badgeStyle.texto]}>
                    {formatarStatusCobranca(data.invoice.status)}
                  </Text>
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            style={[
              styles.consultaStatusBotaoFechar,
              isPago ? styles.consultaStatusBotaoFecharSucesso : styles.consultaStatusBotaoFecharWarning,
            ]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.consultaStatusBotaoFecharTexto}>
              {isPago ? 'Pagamento confirmado — Fechar' : 'Fechar'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
