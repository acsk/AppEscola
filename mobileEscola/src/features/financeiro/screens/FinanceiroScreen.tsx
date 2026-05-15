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
  getPaymentOptionsWithMessageApi,
  resolvePixQrImageUrl,
  CobrancasResponse,
  Cobranca,
  GenerateChargeResponse,
  PaymentMethod,
  PaymentOptionsResponse,
} from '../../../services/financeiro.service';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

type ConsultaStatusModalData = {
  message: string;
  invoice: Cobranca;
  currentMethod: PaymentMethod | string | null;
  allowedMethods: PaymentMethod[];
};

function formatarMoeda(valor: string | number): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function HeaderFinanceiro({
  topInset,
  resumo,
}: {
  topInset: number;
  resumo?: CobrancasResponse['resumo'];
}) {
  return (
    <View style={[styles.headerWrap, { paddingTop: topInset }]}>
      <View style={styles.headerGlowPrimary} />
      <View style={styles.headerGlowSecondary} />
      <View style={styles.headerTituloRow}>
        <View style={styles.headerTituloIcone}>
          <Ionicons name="cash-outline" size={24} color={colors.surface} />
        </View>
        <Text style={styles.headerTitulo}>Financeiro</Text>
      </View>
      {resumo ? (
        <View style={styles.resumoGrid}>
          <View style={styles.resumoItem}>
            <View style={[styles.resumoIcone, styles.resumoIconeAtrasado]}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.debit} />
            </View>
            <Text style={styles.resumoItemLabel}>Atrasados</Text>
            <Text style={[styles.resumoItemValor, { color: colors.debit }]}>
              {formatarMoeda(resumo.valor_total_atrasados)}
            </Text>
            <Text style={styles.resumoItemQtd}>{resumo.quantidade_atrasados} cobranças</Text>
          </View>

          {resumo.possui_atual && (
            <>
              <View style={styles.divisorResumo} />
              <View style={styles.resumoItem}>
                <View style={[styles.resumoIcone, styles.resumoIconeAtual]}>
                  <Ionicons name="calendar-outline" size={16} color="#F97316" />
                </View>
                <Text style={styles.resumoItemLabel}>Atual</Text>
                <Text style={[styles.resumoItemValor, { color: '#F97316' }]}>
                  {formatarMoeda(resumo.valor_atual || '0')}
                </Text>
                <Text style={styles.resumoItemQtd}>Maio/2026</Text>
              </View>
            </>
          )}

          <View style={styles.divisorResumo} />
          <View style={styles.resumoItem}>
            <View style={[styles.resumoIcone, styles.resumoIconePago]}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.credit} />
            </View>
            <Text style={styles.resumoItemLabel}>Pagas</Text>
            <Text style={[styles.resumoItemValor, { color: colors.credit }]}>
              {formatarMoeda(resumo.valor_total_pagas)}
            </Text>
            <Text style={styles.resumoItemQtd}>{resumo.quantidade_pagas} cobranças</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
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
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [consultaStatusModalVisivel, setConsultaStatusModalVisivel] = useState(false);
  const [consultaStatusData, setConsultaStatusData] = useState<ConsultaStatusModalData | null>(null);
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

  const normalizarMetodoPagamento = (method: string | null | undefined): PaymentMethod | null => {
    if (!method) return null;

    const normalized = method.toLowerCase();
    if (normalized === 'pix') return 'pix';
    if (normalized === 'boleto' || normalized === 'bank_slip') return 'boleto';

    return null;
  };

  const rotuloMetodoPagamento = (method: string | null | undefined): string => {
    const normalized = normalizarMetodoPagamento(method);
    if (normalized === 'pix') return 'PIX';
    if (normalized === 'boleto') return 'Boleto';

    return method ? String(method).toUpperCase() : 'Não definido';
  };

  const textoLockMetodo = (reason: string | null | undefined): string => {
    if (!reason) {
      return 'O método de pagamento desta cobrança não pode ser alterado.';
    }

    if (reason === 'synced_charge_method_lock') {
      return 'O método de pagamento desta cobrança está bloqueado.';
    }

    return reason;
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

  const criarResultadoDeOpcoes = (options: PaymentOptionsResponse): GenerateChargeResponse | null => {
    if (options.actions.can_generate_charge !== false) return null;

    const metodo = normalizarMetodoPagamento(options.method_lock?.method ?? options.current_method);
    if (!metodo) return null;

    return {
      invoice_id: options.invoice.id,
      method: metodo,
      status: options.invoice.status,
      charge_id: null,
      reused_existing_charge: true,
      payment_assets: options.payment_assets,
      actions: options.actions,
    };
  };

  const atualizarCobrancaNoEstado = (updatedInvoice: Cobranca) => {
    setCobrancaSelecionada(updatedInvoice);
    setData((prev) => {
      if (!prev) return prev;

      const atualizar = (cobranca: Cobranca): Cobranca =>
        cobranca.id === updatedInvoice.id ? updatedInvoice : cobranca;

      return {
        ...prev,
        atual:
          prev.atual && prev.atual.id === updatedInvoice.id
            ? updatedInvoice
            : prev.atual,
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
      const resultadoReaproveitado = criarResultadoDeOpcoes(options);
      if (resultadoReaproveitado) {
        setPaymentResult(resultadoReaproveitado);
      }
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

  const consultarStatusCobranca = async () => {
    if (!cobrancaSelecionada) return;

    try {
      setPaymentError(null);
      setCheckingStatus(true);

      const response = await getPaymentOptionsWithMessageApi(cobrancaSelecionada.id);
      const options = response.body!;
      setPaymentOptions(options);
      atualizarCobrancaNoEstado(options.invoice);
      const resultadoReaproveitado = criarResultadoDeOpcoes(options);
      if (resultadoReaproveitado) {
        setPaymentResult(resultadoReaproveitado);
      }

      setConsultaStatusData({
        message: response.message,
        invoice: options.invoice,
        currentMethod: options.current_method,
        allowedMethods: options.allowed_methods,
      });
      setConsultaStatusModalVisivel(true);

      setPaymentResult((prev) => {
        if (!prev) return prev;

        const methodFromOptions =
          options.current_method === 'pix' || options.current_method === 'boleto'
            ? options.current_method
            : prev.method;

        return {
          ...prev,
          method: methodFromOptions,
          status: options.invoice.status,
          payment_assets: options.payment_assets,
          actions: options.actions,
        };
      });
    } catch (err: any) {
      setPaymentError(err.response?.data?.message ?? err.message ?? 'Não foi possível consultar o status da cobrança.');
    } finally {
      setCheckingStatus(false);
    }
  };

  const statusEhPago = (status: string) => status.toLowerCase() === 'paid';

  const obterTemaModalStatus = (status: string) => {
    if (statusEhPago(status)) {
      return {
        indicadorIcone: 'checkmark-circle',
        indicadorTexto: 'Pagamento confirmado',
      };
    }

    return {
      indicadorIcone: 'alert-circle',
      indicadorTexto: 'Pagamento pendente',
    };
  };

  const fecharModalConsultaStatus = async () => {
    const deveAtualizarPagamentos =
      Boolean(consultaStatusData) && statusEhPago(consultaStatusData!.invoice.status);

    setConsultaStatusModalVisivel(false);
    setConsultaStatusData(null);

    if (deveAtualizarPagamentos) {
      fecharModalPagamento();
      await carregarCobrancas();
    }
  };

  const metodoBloqueado = paymentOptions?.method_lock?.locked ?? false;
  const metodoBloqueadoSelecionado = normalizarMetodoPagamento(paymentOptions?.method_lock?.method ?? null);
  const podeAlterarMetodo = paymentOptions?.actions.can_change_method ?? true;
  const mostrarBloqueioMetodo = Boolean(paymentOptions && (metodoBloqueado || !podeAlterarMetodo));

  const metodoPermitido = (method: PaymentMethod) => {
    if (!paymentOptions) return true;

    if (!paymentOptions.allowed_methods.includes(method)) return false;

    if (metodoBloqueado || !podeAlterarMetodo) {
      const metodoAtivo = metodoBloqueadoSelecionado ?? normalizarMetodoPagamento(paymentOptions.current_method);
      return !metodoAtivo || metodoAtivo === method;
    }

    return true;
  };

  const formatarStatusCobranca = (status: string): string => {
    const normalized = status.toLowerCase();
    if (normalized === 'pending') return 'Pendente';
    if (normalized === 'paid') return 'Paga';
    if (normalized === 'overdue') return 'Atrasada';
    if (normalized === 'canceled' || normalized === 'cancelled') return 'Cancelada';
    return status;
  };

  const obterEstiloBadgeStatus = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'pending') {
      return {
        container: styles.consultaStatusBadgePendente,
        texto: styles.consultaStatusBadgeTextoPendente,
      };
    }
    if (normalized === 'paid') {
      return {
        container: styles.consultaStatusBadgePaga,
        texto: styles.consultaStatusBadgeTextoPaga,
      };
    }
    if (normalized === 'overdue') {
      return {
        container: styles.consultaStatusBadgeAtrasada,
        texto: styles.consultaStatusBadgeTextoAtrasada,
      };
    }
    if (normalized === 'canceled' || normalized === 'cancelled') {
      return {
        container: styles.consultaStatusBadgeCancelada,
        texto: styles.consultaStatusBadgeTextoCancelada,
      };
    }

    return {
      container: styles.consultaStatusBadgeDefault,
      texto: styles.consultaStatusBadgeTextoDefault,
    };
  };

  const renderResultadoPagamento = () => {
    if (!paymentResult) return null;

    const { method, payment_assets: assets, actions, reused_existing_charge } = paymentResult;
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

        {reused_existing_charge && (
          <View style={styles.modalReusedChargeNotice}>
            <Ionicons name="information-circle-outline" size={20} color="#92400E" />
            <Text style={styles.modalReusedChargeNoticeText}>
              A cobrança já existia no provedor e foi reaproveitada.
            </Text>
          </View>
        )}

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
    const corFundo = tipo === 'atrasada' ? '#FEF2F2' : tipo === 'atual' ? '#FFF7ED' : '#ECFDF5';
    const corBorda = tipo === 'atrasada' ? '#FECACA' : tipo === 'atual' ? '#FED7AA' : '#BBF7D0';
    const corIcone = tipo === 'atrasada' ? colors.debit : tipo === 'atual' ? '#F97316' : colors.credit;
    const icone = tipo === 'atrasada' ? 'alert-circle-outline' : tipo === 'atual' ? 'time-outline' : 'checkmark-circle-outline';
    const statusLabel = tipo === 'atrasada' ? 'Atrasado' : tipo === 'atual' ? 'Aberto' : 'Pago';

    return (
      <View
        key={cobranca.id}
        style={[
          styles.cobrancaCard,
          {
            backgroundColor: colors.surface,
            borderColor: corBorda,
            borderLeftColor: corIcone,
          },
        ]}
      >
        <View style={styles.cobrancaHeader}>
          <View style={[styles.cobrancaIcone, { backgroundColor: corFundo }]}>
            <Ionicons name={icone as any} size={21} color={corIcone} />
          </View>
          <View style={styles.cobrancaInfo}>
            <Text style={styles.cobrancaDescricao}>{cobranca.description}</Text>
            <Text style={styles.cobrancaData}>Vencimento: {formatarData(cobranca.due_date)}</Text>
          </View>
          <View style={styles.cobrancaMeta}>
            <Text
              style={[
                styles.cobrancaStatus,
                { backgroundColor: corFundo, color: corIcone },
                tipo === 'paga' && styles.cobrancaStatusPago,
              ]}
            >
              {statusLabel}
            </Text>
            <Text style={styles.cobrancaValor}>{formatarMoeda(cobranca.amount)}</Text>
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
        <HeaderFinanceiro topInset={insets.top} />
        {renderCarregando()}
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.container}>
        <HeaderFinanceiro topInset={insets.top} />
        {renderErro()}
      </View>
    );
  }

  if (!data || (!data.atrasados.length && !data.atual && !data.pagas.length)) {
    return (
      <View style={styles.container}>
        <HeaderFinanceiro topInset={insets.top} />
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
            ) : paymentOptions && paymentOptions.actions.can_generate_charge === false ? (
              <View style={styles.modalBloqueioContainer}>
                <Ionicons name="lock-closed-outline" size={22} color="#92400E" />
                <View style={styles.modalBloqueioTextoWrap}>
                  <Text style={styles.modalBloqueioTexto}>
                    {textoLockMetodo(paymentOptions.method_lock?.reason)}
                  </Text>
                </View>
              </View>
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

            <View style={styles.modalAcoesFooter}>
              <TouchableOpacity
                style={[styles.modalBotaoCancelar, styles.modalBotaoConsultar]}
                onPress={consultarStatusCobranca}
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
                onPress={fecharModalPagamento}
              >
                <Text style={styles.modalBotaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );

  const renderModalConsultaStatus = () => {
    const isPago = Boolean(consultaStatusData && statusEhPago(consultaStatusData.invoice.status));
    const tema = consultaStatusData ? obterTemaModalStatus(consultaStatusData.invoice.status) : null;
    const badgeStyle = consultaStatusData ? obterEstiloBadgeStatus(consultaStatusData.invoice.status) : null;

    return (
      <Modal
        visible={consultaStatusModalVisivel}
        transparent
        animationType="fade"
        onRequestClose={fecharModalConsultaStatus}
      >
        <View style={styles.consultaStatusOverlay}>
          <View style={styles.consultaStatusCard}>

            {/* Faixa colorida no topo */}
            <View style={[styles.consultaStatusTopBar, isPago ? styles.consultaStatusTopBarSucesso : styles.consultaStatusTopBarWarning]} />

            {/* Botão fechar */}
            <TouchableOpacity style={styles.consultaStatusFecharBtn} onPress={fecharModalConsultaStatus} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={colors.muted} />
            </TouchableOpacity>

            {/* Ícone grande central */}
            {tema && (
              <View style={[styles.consultaStatusIconeWrap, isPago ? styles.consultaStatusIconeWrapSucesso : styles.consultaStatusIconeWrapWarning]}>
                <Ionicons name={tema.indicadorIcone as any} size={38} color={isPago ? '#16A34A' : '#D97706'} />
              </View>
            )}

            {/* Texto de status */}
            {tema && (
              <Text style={[styles.consultaStatusStatusTexto, { color: isPago ? '#16A34A' : '#D97706' }]}>
                {tema.indicadorTexto}
              </Text>
            )}

            {/* Descrição e valor */}
            {consultaStatusData && (
              <>
                <Text style={styles.consultaStatusDescricao} numberOfLines={2}>
                  {consultaStatusData.invoice.description}
                </Text>

                <Text style={styles.consultaStatusVencimento}>
                  <Ionicons name="calendar-outline" size={13} color={colors.muted} />{' '}
                  Vence em {formatarData(consultaStatusData.invoice.due_date)}
                </Text>

                <Text style={styles.consultaStatusValor}>
                  {formatarMoeda(consultaStatusData.invoice.amount)}
                </Text>

                {badgeStyle && (
                  <View style={[styles.consultaStatusBadge, badgeStyle.container]}>
                    <Text style={[styles.consultaStatusBadgeTexto, badgeStyle.texto]}>
                      {formatarStatusCobranca(consultaStatusData.invoice.status)}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Botão principal */}
            <TouchableOpacity
              style={[styles.consultaStatusBotaoFechar, isPago ? styles.consultaStatusBotaoFecharSucesso : styles.consultaStatusBotaoFecharWarning]}
              onPress={fecharModalConsultaStatus}
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
  };

  return (
    <View style={styles.container}>
      <HeaderFinanceiro topInset={insets.top} resumo={data.resumo} />

      <ScrollView contentContainerStyle={styles.content}>
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
      {renderModalConsultaStatus()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7FB' },
  content: { padding: 14, paddingTop: 16, paddingBottom: 32 },
  headerWrap: {
    backgroundColor: '#FBFAFF',
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  headerGlowPrimary: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    right: -104,
    top: -150,
    backgroundColor: '#F0E9FF',
    opacity: 0.92,
  },
  headerGlowSecondary: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    left: -76,
    top: 58,
    backgroundColor: '#F7F2FF',
    opacity: 0.98,
  },
  headerTituloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    paddingBottom: 14,
  },
  headerTituloIcone: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitulo: { fontSize: 22, fontWeight: '800', color: '#111827' },
  
  // Resumo
  resumoGrid: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#EEE8FF',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: 8,
  },
  resumoItem: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  resumoIcone: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  resumoIconeAtrasado: { backgroundColor: '#FEF2F2' },
  resumoIconeAtual: { backgroundColor: '#FFF7ED' },
  resumoIconePago: { backgroundColor: '#ECFDF5' },
  resumoItemLabel: { fontSize: 12, color: '#64748B', marginBottom: 3, fontWeight: '800' },
  resumoItemValor: { fontSize: 18, fontWeight: '900', marginBottom: 2 },
  resumoItemQtd: { fontSize: 11, color: '#64748B', fontWeight: '700', textAlign: 'center' },
  divisorResumo: { display: 'none' },
  
  // Seções
  secaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 12,
  },
  secaoTitulo: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  
  // Cards de cobrança
  cobrancaCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cobrancaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  cobrancaIcone: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  cobrancaInfo: { flex: 1, minWidth: 0 },
  cobrancaDescricao: { fontSize: 15, fontWeight: '800', color: colors.ink, marginBottom: 4, lineHeight: 19 },
  cobrancaData: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  cobrancaMeta: { alignItems: 'flex-end', marginLeft: 6 },
  cobrancaStatus: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
  },
  cobrancaStatusPago: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 13,
  },
  cobrancaValor: { fontSize: 16, fontWeight: '900', color: '#111827' },
  
  // Ações/Botões de cobrança
  acoesBotoes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  botaoAcao: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  botaoPagarPrimario: { backgroundColor: '#F97316', flex: 1, justifyContent: 'center' },
  botaoAcaoPrimario: { backgroundColor: colors.primary, flex: 1, justifyContent: 'center' },
  botaoAcaoSecundario: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  botaoAcaoTexto: { fontSize: 13, fontWeight: '800', color: colors.surface },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0ECFA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalInfoTexto: {
    flex: 1,
    minWidth: 0,
  },
  modalInfoLabel: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalInfoVencimento: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  modalInfoValor: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.primary,
  },
  modalBotao: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F0ECFA',
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
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
    fontSize: 15,
    fontWeight: '900',
    color: colors.ink,
    marginBottom: 3,
  },
  modalBloqueioContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    marginBottom: 10,
  },
  modalBloqueioTextoWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalBloqueioTexto: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    lineHeight: 19,
  },
  modalBloqueioSubtexto: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#A16207',
  },
  modalAcaoIcone: {
    marginRight: 10,
  },
  modalResultadoHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  modalReusedChargeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  modalReusedChargeNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 18,
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
    borderColor: '#F0ECFA',
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#F0ECFA',
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
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0ECFA',
    backgroundColor: colors.surface,
  },
  modalAcoesFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalBotaoConsultar: {
    flex: 1.45,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  modalBotaoConsultarTexto: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
  },
  modalBotaoCancelarSecundario: {
    flex: 1,
    marginTop: 0,
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#F0ECFA',
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
  consultaStatusOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  consultaStatusCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  consultaStatusTopBar: {
    height: 5,
    width: '100%',
    marginBottom: 16,
  },
  consultaStatusTopBarWarning: {
    backgroundColor: '#F59E0B',
  },
  consultaStatusTopBarSucesso: {
    backgroundColor: '#22C55E',
  },
  consultaStatusFecharBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  consultaStatusIconeWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  consultaStatusIconeWrapWarning: {
    backgroundColor: '#FEF3C7',
  },
  consultaStatusIconeWrapSucesso: {
    backgroundColor: '#DCFCE7',
  },
  consultaStatusStatusTexto: {
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 16,
    letterSpacing: 0.1,
  },
  consultaStatusDescricao: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 21,
  },
  consultaStatusVencimento: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 10,
  },
  consultaStatusValor: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 14,
  },
  consultaStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    marginBottom: 20,
  },
  consultaStatusBadgeTexto: {
    fontSize: 12,
    fontWeight: '900',
  },
  consultaStatusBadgePendente: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  consultaStatusBadgeTextoPendente: {
    color: '#92400E',
  },
  consultaStatusBadgePaga: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  consultaStatusBadgeTextoPaga: {
    color: '#166534',
  },
  consultaStatusBadgeAtrasada: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  consultaStatusBadgeTextoAtrasada: {
    color: '#991B1B',
  },
  consultaStatusBadgeCancelada: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  consultaStatusBadgeTextoCancelada: {
    color: '#374151',
  },
  consultaStatusBadgeDefault: {
    backgroundColor: '#EEF2FF',
    borderColor: '#E0E7FF',
  },
  consultaStatusBadgeTextoDefault: {
    color: '#3730A3',
  },
  consultaStatusBotaoFechar: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  consultaStatusBotaoFecharWarning: {
    backgroundColor: '#D97706',
  },
  consultaStatusBotaoFecharSucesso: {
    backgroundColor: '#16A34A',
  },
  consultaStatusBotaoFecharTexto: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.surface,
  },
  
  // Telas vazias/erro/loading
  telaVaziaContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: '#F6F7FB' },
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
