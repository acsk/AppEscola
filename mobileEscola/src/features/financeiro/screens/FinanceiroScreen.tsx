import React, { useCallback } from 'react';
import { View, Alert, Clipboard } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { useCobrancas, usePaymentModal } from '../hooks';
import { getFinanceiroErrorMessage } from '../utils/errors';
import { HeaderFinanceiro } from '../components/HeaderFinanceiro';
import { CobrancasList } from '../components/CobrancasList';
import { FinanceiroEmpty, FinanceiroError, FinanceiroLoading } from '../components/FinanceiroFeedback';
import { PaymentModal } from '../components/PaymentModal';
import { ConsultaStatusModal } from '../components/ConsultaStatusModal';
import {
  FinanceiroStylesProvider,
  useFinanceiroStyles,
} from '../FinanceiroStylesContext';

function FinanceiroScreenContent() {
  const insets = useSafeAreaInsets();
  const styles = useFinanceiroStyles();
  const { data, isLoading, isError, error, refetch } = useCobrancas();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const payment = usePaymentModal({
    onPaid: () => {
      void refetch();
    },
  });

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

  const erroMsg = isError
    ? getFinanceiroErrorMessage(error, 'Erro ao carregar cobranças')
    : '';

  if (isLoading) {
    return (
      <View style={styles.container}>
        <HeaderFinanceiro topInset={insets.top} />
        <FinanceiroLoading />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <HeaderFinanceiro topInset={insets.top} />
        <FinanceiroError message={erroMsg} onRetry={() => refetch()} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <HeaderFinanceiro topInset={insets.top} />
        <FinanceiroEmpty />
      </View>
    );
  }

  const cobrancasAbertas = data.abertas.length ? data.abertas : data.atual ? [data.atual] : [];
  const semCobrancas = !data.atrasados.length && !cobrancasAbertas.length && !data.pagas.length;

  if (semCobrancas) {
    return (
      <View style={styles.container}>
        <HeaderFinanceiro topInset={insets.top} resumo={data.resumo} referencia={data.referencia} />
        <FinanceiroEmpty />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderFinanceiro topInset={insets.top} resumo={data.resumo} referencia={data.referencia} />
      <CobrancasList data={data} onPagar={payment.abrir} />

      <PaymentModal
        visible={payment.visible}
        bottomInset={insets.bottom}
        modalTranslateY={payment.modalTranslateY}
        cobrancaSelecionada={payment.cobrancaSelecionada}
        paymentOptions={payment.paymentOptions}
        paymentResult={payment.paymentResult}
        paymentLoading={payment.paymentLoading}
        paymentError={payment.paymentError}
        generatingMethod={payment.generatingMethod}
        checkingStatus={payment.checkingStatus}
        activePaymentTab={payment.activePaymentTab}
        onChangeTab={payment.setActivePaymentTab}
        onClose={payment.fechar}
        onGenerate={payment.gerarCobranca}
        onCheckStatus={payment.consultarStatus}
        onRetry={() => {
          payment.setPaymentError(null);
          void payment.retryPaymentOptions();
        }}
        onCopy={copiarParaClipboard}
        onDownloadBoleto={baixarBoleto}
      />

      <ConsultaStatusModal
        visible={payment.consultaStatusModalVisivel}
        data={payment.consultaStatusData}
        onClose={payment.fecharConsultaStatus}
      />
    </View>
  );
}

export function FinanceiroScreen() {
  return (
    <FinanceiroStylesProvider>
      <FinanceiroScreenContent />
    </FinanceiroStylesProvider>
  );
}
