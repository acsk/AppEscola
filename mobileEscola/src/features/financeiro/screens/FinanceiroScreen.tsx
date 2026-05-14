import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Clipboard, Modal, Image, Animated, Easing } from 'react-native';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { colors } from '../../../theme';
import {
  generateChargeApi,
  getCobrancasApi,
  getPaymentOptionsApi,
  resolvePixQrImageUrl,
  CobrancasResponse,
  Cobranca,
  GenerateChargeResponse,
  PaymentMethod,
  PaymentOptionsResponse,
} from '../../../services/financeiro.service';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

function formatarMoeda(valor: string | number): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function FinanceiroScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadingState>('loading');
  const [data, setData] = useState<CobrancasResponse | null>(null);
  const [error, setError] = useState<string>('');
  const [modalPagamentoVisivel, setModalPagamentoVisivel] = useState(false);
  const [cobrancaSelecionada, setCobrancaSelecionada] = useState<Cobranca | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptionsResponse | null>(null);
  const [paymentResult, setPaymentResult] = useState<GenerateChargeResponse | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [generatingMethod, setGeneratingMethod] = useState<PaymentMethod | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const modalTranslateY = useRef(new Animated.Value(64)).current;
  const modalAnimatedOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    carregarCobrancas();
  }, []);

  const carregarCobrancas = async () => {
    try {
      setState('loading');
      const response = await getCobrancasApi();
      setData(response);
      setState('success');
    } catch (err: any) {
      const mensagem = err.response?.status === 401
        ? 'Sessão expirada. Faça login novamente.'
        : err.response?.status === 403
        ? 'Você não tem permissão para acessar esta informação.'
        : err.message || 'Erro ao carregar cobranças';
      setError(mensagem);
      setState('error');
    }
  };

  const copiarParaClipboard = (texto: string, label: string) => {
    Clipboard.setString(texto);
    Alert.alert('Copiado', `${label} copiado com sucesso!`);
  };

  const baixarBoleto = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Erro', 'Não foi possível baixar o boleto.');
    }
  };

  const aplicarCobrancaGerada = (invoiceId: number, result: GenerateChargeResponse) => {
    setData((prev) => {
      if (!prev) return prev;

      const atualizar = (cobranca: Cobranca): Cobranca => {
        if (cobranca.id !== invoiceId) return cobranca;

        return {
          ...cobranca,
          status: result.status,
          payment_method: result.method,
          boleto_number: result.payment_assets.boleto_number,
          boleto_digitable: result.payment_assets.boleto_digitable,
          payment_url: result.payment_assets.boleto_url,
          pix_copy_paste: result.payment_assets.pix_copy_paste,
          pix_qr_image_url: result.payment_assets.pix_qr_image_url,
        };
      };

      return {
        ...prev,
        atual: prev.atual ? atualizar(prev.atual) : null,
        atrasados: prev.atrasados.map(atualizar),
        pagas: prev.pagas.map(atualizar),
      };
    });
  };

  const abrirModalPagamento = async (cobranca: Cobranca) => {
    setCobrancaSelecionada(cobranca);
    setModalPagamentoVisivel(true);
    modalTranslateY.setValue(64);
    modalAnimatedOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(modalTranslateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(modalAnimatedOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    setPaymentOptions(null);
    setPaymentResult(null);
    setPaymentError(null);
    setPaymentLoading(true);

    try {
      const options = await getPaymentOptionsApi(cobranca.id);
      setPaymentOptions(options);
    } catch (err: any) {
      setPaymentError(err.response?.data?.message ?? err.message ?? 'Não foi possível carregar as formas de pagamento.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const fecharModalPagamento = () => {
    Animated.parallel([
      Animated.timing(modalTranslateY, {
        toValue: 64,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(modalAnimatedOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setModalPagamentoVisivel(false);
      setCobrancaSelecionada(null);
      setPaymentOptions(null);
      setPaymentResult(null);
      setPaymentError(null);
      setPaymentLoading(false);
      setGeneratingMethod(null);
    });
  };

  const gerarCobranca = async (method: PaymentMethod) => {
    if (!cobrancaSelecionada) return;

    try {
      setPaymentError(null);
      setGeneratingMethod(method);
      const result = await generateChargeApi(cobrancaSelecionada.id, method);
      setPaymentResult(result);
      aplicarCobrancaGerada(cobrancaSelecionada.id, result);
    } catch (err: any) {
      setPaymentError(err.response?.data?.message ?? err.message ?? 'Não foi possível gerar a cobrança.');
    } finally {
      setGeneratingMethod(null);
    }
  };

  const metodoPermitido = (method: PaymentMethod) =>
    !paymentOptions || paymentOptions.allowed_methods.includes(method);

  const renderResultadoPagamento = () => {
    if (!paymentResult) return null;

    const { method, payment_assets: assets, actions } = paymentResult;
    const isPix = method === 'pix';
    const pixQrUrl = isPix ? resolvePixQrImageUrl(assets, 320) : null;

    return (
      <View>
        <View style={styles.modalResultadoHeader}>
          <View style={[styles.modalBotaoIcone, isPix ? styles.modalBotaoIconePix : styles.modalBotaoIconeBoleto]}>
            {isPix ? (
              <FontAwesome6 name="pix" size={30} color="#00A884" />
            ) : (
              <MaterialCommunityIcons name="barcode-scan" size={32} color="#2563EB" />
            )}
          </View>
          <Text style={styles.modalResultadoTitulo}>
            {isPix ? 'PIX gerado' : 'Boleto gerado'}
          </Text>
        </View>

        {isPix && pixQrUrl && (
          <View style={styles.pixQrWrap}>
            <Image source={{ uri: pixQrUrl }} style={styles.pixQrImage} resizeMode="contain" />
          </View>
        )}

        {isPix && actions.can_copy_pix_code && assets.pix_copy_paste && (
          <TouchableOpacity
            style={[styles.modalBotao, styles.modalBotaoPrincipal]}
            onPress={() => copiarParaClipboard(assets.pix_copy_paste!, 'Código PIX')}
            activeOpacity={0.8}
          >
            <Ionicons name="copy-outline" size={22} color={colors.surface} />
            <Text style={styles.modalBotaoPrincipalTexto}>Copiar e cola PIX</Text>
          </TouchableOpacity>
        )}

        {isPix && assets.pix_copy_paste && (
          <View style={styles.pixCodeBox}>
            <Text style={styles.pixCodeLabel}>PIX copia e cola</Text>
            <Text style={styles.pixCodeValue} numberOfLines={1} ellipsizeMode="middle">
              {assets.pix_copy_paste}
            </Text>
          </View>
        )}

        {!isPix && assets.boleto_digitable && (
          <View style={styles.boletoLinhaBox}>
            <View style={styles.boletoLinhaTextWrap}>
              <Text style={styles.boletoLinhaLabel}>Linha digitável</Text>
              <Text style={styles.boletoLinhaValor} selectable>
                {assets.boleto_digitable}
              </Text>
            </View>
            {actions.can_copy_boleto_line && (
              <TouchableOpacity
                style={styles.boletoCopiarBotao}
                onPress={() => copiarParaClipboard(assets.boleto_digitable!, 'Linha digitável')}
                activeOpacity={0.8}
              >
                <Ionicons name="copy-outline" size={20} color={colors.surface} />
                <Text style={styles.boletoCopiarBotaoTexto}>Copiar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!isPix && assets.boleto_url && (
          <TouchableOpacity
            style={styles.modalBotao}
            onPress={() => baixarBoleto(assets.boleto_url!)}
            activeOpacity={0.8}
          >
            <Ionicons style={styles.modalAcaoIcone} name="download-outline" size={22} color={colors.primary} />
            <Text style={[styles.modalBotaoTitulo, { color: colors.primary }]}>Baixar boleto</Text>
          </TouchableOpacity>
        )}

      </View>
    );
  };

  const renderCardCobranca = (cobranca: Cobranca, tipo: 'atrasada' | 'atual' | 'paga') => {
    const corFundo = tipo === 'atrasada' ? '#FEF2F2' : tipo === 'atual' ? '#FEF3F2' : '#ECFDF5';
    const corIcone = tipo === 'atrasada' ? colors.debit : tipo === 'atual' ? '#F97316' : colors.credit;
    const icone = tipo === 'atrasada' ? 'alert-circle-outline' : tipo === 'atual' ? 'time-outline' : 'checkmark-circle-outline';
    const statusLabel = tipo === 'atrasada' ? 'Atrasado' : tipo === 'atual' ? 'Aberto' : 'Pago';

    return (
      <View key={cobranca.id} style={[styles.cobrancaCard, { borderLeftColor: corIcone }]}>
        <View style={styles.cobrancaHeader}>
          <View style={[styles.cobrancaIcone, { backgroundColor: corFundo }]}>
            <Ionicons name={icone as any} size={28} color={corIcone} />
          </View>
          <View style={styles.cobrancaInfo}>
            <Text style={styles.cobrancaDescricao}>{cobranca.description}</Text>
            <Text style={styles.cobrancaData}>Vencimento: {formatarData(cobranca.due_date)}</Text>
          </View>
          <View style={styles.cobrancaMeta}>
            <Text style={[styles.cobrancaStatus, { backgroundColor: corFundo, color: corIcone }]}>
              {statusLabel}
            </Text>
            <Text style={[styles.cobrancaValor, { color: corIcone }]}>{formatarMoeda(cobranca.amount)}</Text>
          </View>
        </View>

        <View style={styles.acoesBotoes}>
          {tipo !== 'paga' && (
            <TouchableOpacity
              style={[styles.botaoAcao, styles.botaoPagarPrimario]}
              onPress={() => abrirModalPagamento(cobranca)}
            >
              <Ionicons name="card-outline" size={19} color={colors.surface} />
              <Text style={styles.botaoAcaoTexto}>Pagar</Text>
            </TouchableOpacity>
          )}

        </View>
      </View>
    );
  };

  const renderTelaVazia = () => (
    <View style={styles.telaVaziaContainer}>
      <Ionicons name="document-text-outline" size={64} color={colors.muted} />
      <Text style={styles.telaVaziaTexto}>Nenhuma cobrança encontrada</Text>
      <Text style={styles.telaVaziaSubtexto}>Você está com todas as contas em dia 🎉</Text>
    </View>
  );

  const renderErro = () => (
    <View style={styles.telaVaziaContainer}>
      <Ionicons name="alert-circle-outline" size={64} color={colors.debit} />
      <Text style={styles.telaVaziaTexto}>Erro ao carregar</Text>
      <Text style={styles.telaVaziaSubtexto}>{error}</Text>
      <TouchableOpacity style={styles.botaoTentarNovamente} onPress={carregarCobrancas}>
        <Text style={styles.botaoTentarNovamenteTexto}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCarregando = () => (
    <View style={styles.telaVaziaContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.telaVaziaTexto}>Carregando...</Text>
    </View>
  );

  if (state === 'loading') {
    return (
      <View style={styles.container}>
        <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
          <Text style={styles.headerTitulo}>Financeiro</Text>
        </View>
        {renderCarregando()}
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.container}>
        <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
          <Text style={styles.headerTitulo}>Financeiro</Text>
        </View>
        {renderErro()}
      </View>
    );
  }

  if (!data || (!data.atrasados.length && !data.atual && !data.pagas.length)) {
    return (
      <View style={styles.container}>
        <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
          <Text style={styles.headerTitulo}>Financeiro</Text>
        </View>
        {renderTelaVazia()}
      </View>
    );
  }

  const renderModalPagamento = () => (
    <Modal
      visible={modalPagamentoVisivel}
      transparent
      animationType="fade"
      onRequestClose={fecharModalPagamento}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.modalContent,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              opacity: modalAnimatedOpacity,
              transform: [{ translateY: modalTranslateY }],
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTituloWrap}>
              <Text style={styles.modalTitulo}>Forma de pagamento</Text>
            </View>
            <TouchableOpacity style={styles.modalFecharBotao} onPress={fecharModalPagamento}>
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
                  <Text style={styles.modalInfoVencimento}>Vence em {formatarData(cobrancaSelecionada.due_date)}</Text>
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
              renderResultadoPagamento()
            ) : paymentError && !paymentOptions ? (
              <TouchableOpacity
                style={[styles.modalBotao, styles.modalBotaoPrincipal]}
                onPress={() => cobrancaSelecionada && abrirModalPagamento(cobrancaSelecionada)}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-outline" size={22} color={colors.surface} />
                <Text style={styles.modalBotaoPrincipalTexto}>Tentar novamente</Text>
              </TouchableOpacity>
            ) : (
              <>
                {metodoPermitido('boleto') && (
                  <TouchableOpacity
                    style={styles.modalBotao}
                    onPress={() => gerarCobranca('boleto')}
                    activeOpacity={0.8}
                    disabled={Boolean(generatingMethod)}
                  >
                    <View style={[styles.modalBotaoIcone, styles.modalBotaoIconeBoleto]}>
                      <MaterialCommunityIcons name="barcode-scan" size={32} color="#2563EB" />
                    </View>
                    <View style={styles.modalBotaoTexto}>
                      <Text style={styles.modalBotaoTitulo}>Boleto</Text>
                    </View>
                    {generatingMethod === 'boleto' ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Ionicons name="chevron-forward-outline" size={24} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                )}

                {metodoPermitido('pix') && (
                  <TouchableOpacity
                    style={styles.modalBotao}
                    onPress={() => gerarCobranca('pix')}
                    activeOpacity={0.8}
                    disabled={Boolean(generatingMethod)}
                  >
                    <View style={[styles.modalBotaoIcone, styles.modalBotaoIconePix]}>
                      <FontAwesome6 name="pix" size={30} color="#00A884" />
                    </View>
                    <View style={styles.modalBotaoTexto}>
                      <Text style={styles.modalBotaoTitulo}>PIX</Text>
                    </View>
                    {generatingMethod === 'pix' ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Ionicons name="chevron-forward-outline" size={24} color="#94A3B8" />
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.modalBotaoCancelar}
              onPress={fecharModalPagamento}
            >
              <Text style={styles.modalBotaoCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitulo}>Financeiro</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Resumo */}
        <View style={styles.resumoContainer}>
          <View style={styles.resumoItem}>
            <Text style={styles.resumoItemLabel}>Atrasados</Text>
            <Text style={[styles.resumoItemValor, { color: colors.debit }]}>
              {formatarMoeda(data.resumo.valor_total_atrasados)}
            </Text>
            <Text style={styles.resumoItemQtd}>{data.resumo.quantidade_atrasados} cobranças</Text>
          </View>

          {data.resumo.possui_atual && (
            <>
              <View style={styles.divisorResumo} />
              <View style={styles.resumoItem}>
                <Text style={styles.resumoItemLabel}>Atual</Text>
                <Text style={[styles.resumoItemValor, { color: '#F97316' }]}>
                  {formatarMoeda(data.resumo.valor_atual || '0')}
                </Text>
                <Text style={styles.resumoItemQtd}>Maio/2026</Text>
              </View>
            </>
          )}

          <View style={styles.divisorResumo} />
          <View style={styles.resumoItem}>
            <Text style={styles.resumoItemLabel}>Pagas</Text>
            <Text style={[styles.resumoItemValor, { color: colors.credit }]}>
              {formatarMoeda(data.resumo.valor_total_pagas)}
            </Text>
            <Text style={styles.resumoItemQtd}>{data.resumo.quantidade_pagas} cobranças</Text>
          </View>
        </View>

        {/* Atrasados */}
        {data.atrasados.length > 0 && (
          <>
            <View style={styles.secaoHeader}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.debit} />
              <Text style={styles.secaoTitulo}>Atrasados</Text>
            </View>
            {data.atrasados.map((c) => renderCardCobranca(c, 'atrasada'))}
          </>
        )}

        {/* Atual */}
        {data.atual && (
          <>
            <View style={styles.secaoHeader}>
              <Ionicons name="calendar-outline" size={22} color="#F97316" />
              <Text style={styles.secaoTitulo}>Cobrança atual</Text>
            </View>
            {renderCardCobranca(data.atual, 'atual')}
          </>
        )}

        {/* Pagas */}
        {data.pagas.length > 0 && (
          <>
            <View style={styles.secaoHeader}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.credit} />
              <Text style={styles.secaoTitulo}>Histórico de pagamentos</Text>
            </View>
            {data.pagas.map((c) => renderCardCobranca(c, 'paga'))}
          </>
        )}
      </ScrollView>

      {renderModalPagamento()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingTop: 14, paddingBottom: 40 },
  headerWrap: {
    backgroundColor: colors.ink,
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  headerTitulo: { fontSize: 25, fontWeight: '800', color: colors.surface, paddingTop: 18, paddingBottom: 14 },
  
  // Resumo
  resumoContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 26,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
  },
  resumoItem: { alignItems: 'center', flex: 1 },
  resumoItemLabel: { fontSize: 15, color: colors.muted, marginBottom: 6, fontWeight: '700' },
  resumoItemValor: { fontSize: 21, fontWeight: '900', marginBottom: 4 },
  resumoItemQtd: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  divisorResumo: { width: 1, height: 48, backgroundColor: colors.border },
  
  // Seções
  secaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    marginTop: 16,
  },
  secaoTitulo: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.ink,
  },
  
  // Cards de cobrança
  cobrancaCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.025,
    shadowRadius: 6,
    elevation: 1,
  },
  cobrancaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  cobrancaIcone: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cobrancaInfo: { flex: 1, minWidth: 0 },
  cobrancaDescricao: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 5, lineHeight: 23 },
  cobrancaData: { fontSize: 15, color: colors.muted, fontWeight: '500' },
  cobrancaMeta: { alignItems: 'flex-end', marginLeft: 6 },
  cobrancaStatus: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },
  cobrancaValor: { fontSize: 20, fontWeight: '900' },
  
  // Ações/Botões de cobrança
  acoesBotoes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  botaoAcao: { paddingVertical: 12, paddingHorizontal: 15, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  botaoPagarPrimario: { backgroundColor: '#F97316', flex: 1, justifyContent: 'center' },
  botaoAcaoPrimario: { backgroundColor: colors.primary, flex: 1, justifyContent: 'center' },
  botaoAcaoSecundario: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  botaoAcaoTexto: { fontSize: 15, fontWeight: '800', color: colors.surface },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 22,
    maxHeight: '92%',
    minHeight: 420,
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8DEE9',
    alignSelf: 'center',
    marginBottom: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 16,
  },
  modalTituloWrap: {
    flex: 1,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingBottom: 16,
  },
  modalTitulo: {
    fontSize: 23,
    fontWeight: '900',
    color: colors.ink,
    marginBottom: 4,
  },
  modalFecharBotao: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  modalInfoCobranca: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalInfoTexto: {
    flex: 1,
    minWidth: 0,
  },
  modalInfoLabel: {
    fontSize: 16,
    color: colors.ink,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalInfoVencimento: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
  },
  modalInfoValor: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.primary,
  },
  modalBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalBotaoPrincipal: {
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalBotaoPrincipalTexto: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.surface,
  },
  modalBotaoIcone: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  modalBotaoIconeBoleto: {
    backgroundColor: '#EFF6FF',
  },
  modalBotaoIconePix: {
    backgroundColor: '#ECFDF5',
  },
  modalBotaoTexto: {
    flex: 1,
    minWidth: 0,
  },
  modalBotaoTitulo: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
    marginBottom: 3,
  },
  modalAcaoIcone: {
    marginRight: 10,
  },
  modalResultadoHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  modalResultadoTitulo: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.ink,
    marginTop: 10,
  },
  pixQrWrap: {
    alignSelf: 'center',
    width: 188,
    height: 188,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  pixQrImage: {
    width: 168,
    height: 168,
  },
  pixCodeBox: {
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 12,
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  pixCodeLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '700',
    marginBottom: 2,
  },
  pixCodeValue: {
    fontSize: 11,
    color: colors.ink,
    fontWeight: '600',
    lineHeight: 14,
  },
  modalErro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    backgroundColor: '#FEF2F2',
  },
  modalErroTexto: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.debit,
  },
  modalLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  modalLoadingTexto: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.muted,
    marginTop: 12,
  },
  modalBotaoCancelar: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
    backgroundColor: '#F8FAFC',
  },
  modalBotaoCancelarTexto: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  boletoLinhaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  boletoLinhaTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  boletoLinhaLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '700',
    marginBottom: 4,
  },
  boletoLinhaValor: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '700',
    lineHeight: 17,
  },
  boletoCopiarBotao: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  boletoCopiarBotaoTexto: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '800',
  },
  
  // Telas vazias/erro/loading
  telaVaziaContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  telaVaziaTexto: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 16, textAlign: 'center' },
  telaVaziaSubtexto: { fontSize: 14, color: colors.muted, marginTop: 8, textAlign: 'center' },
  botaoTentarNovamente: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
  },
  botaoTentarNovamenteTexto: { color: colors.surface, fontWeight: '800', textAlign: 'center' },
});
