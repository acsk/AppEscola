import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type {
  Cobranca,
  GenerateChargeResponse,
  PaymentMethod,
  PaymentOptionsResponse,
} from '../../../services/financeiro.service';
import { colors } from '../../../theme';
import { formatarData, formatarMoeda } from '../utils/formatters';
import { textoLockMetodo } from '../utils/payment';
import { PaymentResultView } from './PaymentResultView';
import { styles } from '../styles/financeiro.styles';

interface PaymentModalProps {
  visible: boolean;
  bottomInset: number;
  modalTranslateY: Animated.Value;
  cobrancaSelecionada: Cobranca | null;
  paymentOptions: PaymentOptionsResponse | null;
  paymentResult: GenerateChargeResponse | null;
  paymentLoading: boolean;
  paymentError: string | null;
  generatingMethod: PaymentMethod | null;
  checkingStatus: boolean;
  activePaymentTab: 'boleto' | 'pix';
  onChangeTab: (tab: 'boleto' | 'pix') => void;
  onClose: () => void;
  onGenerate: (method: PaymentMethod) => void;
  onCheckStatus: () => void;
  onRetry: () => void;
  onCopy: (texto: string, label: string) => void;
  onDownloadBoleto: (url: string) => void;
}

export function PaymentModal({
  visible,
  bottomInset,
  modalTranslateY,
  cobrancaSelecionada,
  paymentOptions,
  paymentResult,
  paymentLoading,
  paymentError,
  generatingMethod,
  checkingStatus,
  activePaymentTab,
  onChangeTab,
  onClose,
  onGenerate,
  onCheckStatus,
  onRetry,
  onCopy,
  onDownloadBoleto,
}: PaymentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.modalContent,
            {
              paddingBottom: Math.max(bottomInset, 12),
              transform: [{ translateY: modalTranslateY }],
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTituloWrap}>
              <Text style={styles.modalTitulo}>Forma de pagamento</Text>
            </View>
            <TouchableOpacity style={styles.modalFecharBotao} onPress={onClose}>
              <Ionicons name="close-outline" size={26} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {cobrancaSelecionada && (
              <View style={styles.modalInfoCobranca}>
                <View style={styles.modalInfoTexto}>
                  <Text style={styles.modalInfoLabel}>{cobrancaSelecionada.description}</Text>
                  <Text style={styles.modalInfoVencimento}>
                    Vence em {formatarData(cobrancaSelecionada.due_date)}
                  </Text>
                </View>
                <Text style={styles.modalInfoValor}>{formatarMoeda(cobrancaSelecionada.amount)}</Text>
              </View>
            )}

            {paymentError && (
              <View style={styles.modalErro}>
                <Ionicons name="alert-circle-outline" size={22} color={colors.debit} />
                <Text style={styles.modalErroTexto}>{paymentError}</Text>
              </View>
            )}

            {paymentLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.modalLoadingTexto}>Carregando formas de pagamento...</Text>
              </View>
            ) : paymentResult ? (
              <PaymentResultView
                paymentResult={paymentResult}
                cobranca={cobrancaSelecionada}
                activePaymentTab={activePaymentTab}
                onChangeTab={onChangeTab}
                onCopy={onCopy}
                onDownloadBoleto={onDownloadBoleto}
              />
            ) : paymentOptions && paymentOptions.actions.can_generate_charge === false ? (
              <View style={styles.modalBloqueioContainer}>
                <Ionicons name="lock-closed-outline" size={22} color="#92400E" />
                <View style={styles.modalBloqueioTextoWrap}>
                  <Text style={styles.modalBloqueioTexto}>
                    {paymentOptions.method_lock?.locked
                      ? textoLockMetodo(paymentOptions.method_lock?.reason)
                      : 'Pagamento online indisponível para esta escola. Procure a secretaria para quitar esta cobrança.'}
                  </Text>
                </View>
              </View>
            ) : paymentError && !paymentOptions ? (
              <TouchableOpacity
                style={[styles.modalBotao, styles.modalBotaoPrincipal]}
                onPress={onRetry}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-outline" size={22} color={colors.surface} />
                <Text style={styles.modalBotaoPrincipalTexto}>Tentar novamente</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.modalBotaoGerar, Boolean(generatingMethod) && styles.modalBotaoGerarDesabilitado]}
                onPress={() => onGenerate('boleto')}
                activeOpacity={0.8}
                disabled={Boolean(generatingMethod)}
              >
                {generatingMethod ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <>
                    <View style={styles.modalBotaoGerarIconeWrap}>
                      <MaterialCommunityIcons name="barcode-scan" size={24} color={colors.surface} />
                    </View>
                    <View style={styles.modalBotaoGerarTexto}>
                      <Text style={styles.modalBotaoGerarTitulo}>Gerar boleto</Text>
                      <Text style={styles.modalBotaoGerarSub}>Inclui PIX embutido</Text>
                    </View>
                    <View style={styles.modalBotaoGerarPixBadge}>
                      <FontAwesome6 name="pix" size={13} color="#00A884" />
                      <Text style={styles.modalBotaoGerarPixBadgeTexto}>PIX</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.modalAcoesFooter}>
              <TouchableOpacity
                style={[styles.modalBotaoCancelar, styles.modalBotaoConsultar]}
                onPress={onCheckStatus}
                disabled={checkingStatus || paymentLoading || Boolean(generatingMethod)}
              >
                {checkingStatus ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={18} color={colors.primary} />
                    <Text style={styles.modalBotaoConsultarTexto}>Consultar status</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBotaoCancelar, styles.modalBotaoCancelarSecundario]}
                onPress={onClose}
              >
                <Text style={styles.modalBotaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
