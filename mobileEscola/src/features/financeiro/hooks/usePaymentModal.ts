import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Cobranca,
  GenerateChargeResponse,
  PaymentMethod,
  PaymentOptionsResponse,
} from '../../../services/financeiro.service';
import { financeiroKeys } from '../queryKeys';
import { criarResultadoDeOpcoes } from '../utils/payment';
import { getFinanceiroErrorMessage } from '../utils/errors';
import { usePaymentOptions } from './usePaymentOptions';
import { useGenerateCharge } from './useGenerateCharge';
import { useCheckPaymentStatus } from './useCheckPaymentStatus';

export interface ConsultaStatusModalData {
  message: string;
  invoice: Cobranca;
  currentMethod: PaymentMethod | string | null;
  allowedMethods: PaymentMethod[];
}

interface UsePaymentModalOptions {
  onPaid?: () => void;
}

export function usePaymentModal({ onPaid }: UsePaymentModalOptions = {}) {
  const queryClient = useQueryClient();
  const modalTranslateY = useRef(new Animated.Value(520)).current;

  const [visible, setVisible] = useState(false);
  const [cobrancaSelecionada, setCobrancaSelecionada] = useState<Cobranca | null>(null);
  const [paymentResult, setPaymentResult] = useState<GenerateChargeResponse | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activePaymentTab, setActivePaymentTab] = useState<'boleto' | 'pix'>('boleto');
  const [consultaStatusModalVisivel, setConsultaStatusModalVisivel] = useState(false);
  const [consultaStatusData, setConsultaStatusData] = useState<ConsultaStatusModalData | null>(null);

  const invoiceId = cobrancaSelecionada?.id ?? 0;

  const paymentOptionsQuery = usePaymentOptions(invoiceId, visible);
  const generateCharge = useGenerateCharge();
  const checkStatus = useCheckPaymentStatus();

  const paymentOptions: PaymentOptionsResponse | null = paymentOptionsQuery.data ?? null;
  const paymentLoading = paymentOptionsQuery.isLoading;
  const generatingMethod = generateCharge.isPending ? ('boleto' as PaymentMethod) : null;

  useEffect(() => {
    if (!paymentOptions || paymentResult) return;
    const resultadoReaproveitado = criarResultadoDeOpcoes(paymentOptions);
    if (resultadoReaproveitado) {
      setPaymentResult(resultadoReaproveitado);
    }
  }, [paymentOptions, paymentResult]);

  useEffect(() => {
    if (paymentOptionsQuery.isError) {
      setPaymentError(
        getFinanceiroErrorMessage(
          paymentOptionsQuery.error,
          'Não foi possível carregar as formas de pagamento.',
        ),
      );
    }
  }, [paymentOptionsQuery.isError, paymentOptionsQuery.error]);

  const abrir = useCallback(
    (cobranca: Cobranca) => {
      setCobrancaSelecionada(cobranca);
      setVisible(true);
      setPaymentResult(null);
      setPaymentError(null);
      setActivePaymentTab('boleto');
      modalTranslateY.setValue(520);
      Animated.timing(modalTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      queryClient.invalidateQueries({ queryKey: financeiroKeys.paymentOptions(cobranca.id) });
    },
    [modalTranslateY, queryClient],
  );

  const fechar = useCallback(() => {
    Animated.timing(modalTranslateY, {
      toValue: 520,
      duration: 260,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setCobrancaSelecionada(null);
      setPaymentResult(null);
      setPaymentError(null);
      setActivePaymentTab('boleto');
    });
  }, [modalTranslateY]);

  const gerarCobranca = useCallback(
    async (method: PaymentMethod) => {
      if (!cobrancaSelecionada) return;

      try {
        setPaymentError(null);
        const finalResult = await generateCharge.mutateAsync({
          invoiceId: cobrancaSelecionada.id,
          method,
        });
        setPaymentResult(finalResult);
      } catch (err: unknown) {
        setPaymentError(
          getFinanceiroErrorMessage(err, 'Não foi possível gerar a cobrança.'),
        );
      }
    },
    [cobrancaSelecionada, generateCharge],
  );

  const consultarStatus = useCallback(async () => {
    if (!cobrancaSelecionada) return;

    try {
      setPaymentError(null);
      const response = await checkStatus.mutateAsync(cobrancaSelecionada.id);
      const options = response.body!;

      const resultadoReaproveitado = criarResultadoDeOpcoes(options);
      if (resultadoReaproveitado) {
        setPaymentResult(resultadoReaproveitado);
      } else {
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
      }

      setConsultaStatusData({
        message: response.message,
        invoice: options.invoice,
        currentMethod: options.current_method,
        allowedMethods: options.allowed_methods,
      });
      setConsultaStatusModalVisivel(true);
    } catch (err: unknown) {
      setPaymentError(
        getFinanceiroErrorMessage(err, 'Não foi possível consultar o status da cobrança.'),
      );
    }
  }, [checkStatus, cobrancaSelecionada]);

  const fecharConsultaStatus = useCallback(async () => {
    const deveAtualizarPagamentos =
      Boolean(consultaStatusData) &&
      consultaStatusData!.invoice.status.toLowerCase() === 'paid';

    setConsultaStatusModalVisivel(false);
    setConsultaStatusData(null);

    if (deveAtualizarPagamentos) {
      fechar();
      onPaid?.();
    }
  }, [consultaStatusData, fechar, onPaid]);

  return {
    visible,
    cobrancaSelecionada,
    paymentOptions,
    paymentResult,
    paymentLoading,
    paymentError,
    setPaymentError,
    generatingMethod,
    checkingStatus: checkStatus.isPending,
    activePaymentTab,
    setActivePaymentTab,
    modalTranslateY,
    consultaStatusModalVisivel,
    consultaStatusData,
    abrir,
    fechar,
    gerarCobranca,
    consultarStatus,
    fecharConsultaStatus,
    retryPaymentOptions: () => paymentOptionsQuery.refetch(),
  };
}
