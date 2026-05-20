import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Cobranca, GenerateChargeResponse } from '../../../services/financeiro.service';
import { resolvePixQrImageUrl } from '../../../services/financeiro.service';
import { useThemeColors } from '../../../context/TenantThemeContext';
import { formatarMoeda } from '../utils/formatters';
import { useFinanceiroStyles } from '../FinanceiroStylesContext';

interface PaymentResultViewProps {
  paymentResult: GenerateChargeResponse;
  cobranca: Cobranca | null;
  activePaymentTab: 'boleto' | 'pix';
  onChangeTab: (tab: 'boleto' | 'pix') => void;
  onCopy: (texto: string, label: string) => void;
  onDownloadBoleto: (url: string) => void;
}

export function PaymentResultView({
  paymentResult,
  cobranca,
  activePaymentTab,
  onChangeTab,
  onCopy,
  onDownloadBoleto,
}: PaymentResultViewProps) {
  const colors = useThemeColors();
  const styles = useFinanceiroStyles();
  const { payment_assets: assets, actions } = paymentResult;

  const temBoleto = Boolean(assets.boleto_digitable || assets.boleto_number || assets.boleto_url);
  const temPix = Boolean(assets.pix_copy_paste || assets.pix_qr_image_url);
  const temAmbos = temBoleto && temPix;

  const abaAtiva: 'boleto' | 'pix' =
    activePaymentTab === 'pix' && temPix
      ? 'pix'
      : activePaymentTab === 'boleto' && temBoleto
        ? 'boleto'
        : temBoleto
          ? 'boleto'
          : 'pix';

  const pixQrUrl = temPix ? resolvePixQrImageUrl(assets, 320) : null;

  return (
    <View>
      <View style={styles.modalResultadoHeaderRow}>
        <View style={[styles.modalResultadoIcone, styles.modalBotaoIconeBoleto]}>
          <MaterialCommunityIcons name="barcode-scan" size={26} color="#2563EB" />
        </View>
        <View style={styles.modalResultadoHeaderTexto}>
          <Text style={styles.modalResultadoTitulo}>Boleto gerado</Text>
          {cobranca && (
            <Text style={styles.modalResultadoValor}>{formatarMoeda(cobranca.amount)}</Text>
          )}
        </View>
      </View>

      {temAmbos && (
        <View style={styles.paymentTabRow}>
          <TouchableOpacity
            style={[
              styles.paymentTab,
              abaAtiva === 'boleto' && styles.paymentTabAtiva,
              abaAtiva === 'boleto' && styles.paymentTabAtivaBoleto,
            ]}
            onPress={() => onChangeTab('boleto')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="barcode-scan"
              size={16}
              color={abaAtiva === 'boleto' ? colors.surface : colors.muted}
            />
            <Text style={[styles.paymentTabTexto, abaAtiva === 'boleto' && styles.paymentTabTextoAtivo]}>
              Boleto
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.paymentTab,
              abaAtiva === 'pix' && styles.paymentTabAtiva,
              abaAtiva === 'pix' && styles.paymentTabAtivaPix,
            ]}
            onPress={() => onChangeTab('pix')}
            activeOpacity={0.8}
          >
            <FontAwesome6
              name="pix"
              size={14}
              color={abaAtiva === 'pix' ? colors.surface : colors.muted}
            />
            <Text style={[styles.paymentTabTexto, abaAtiva === 'pix' && styles.paymentTabTextoAtivoPix]}>
              PIX
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {(abaAtiva === 'pix' || (!temAmbos && temPix)) && (
        <>
          {pixQrUrl && (
            <View style={styles.pixQrWrap}>
              <Image source={{ uri: pixQrUrl }} style={styles.pixQrImage} resizeMode="contain" />
            </View>
          )}
          {actions.can_copy_pix_code && assets.pix_copy_paste && (
            <TouchableOpacity
              style={[styles.modalBotao, styles.modalBotaoPrincipalPix]}
              onPress={() => onCopy(assets.pix_copy_paste!, 'Código PIX')}
              activeOpacity={0.8}
            >
              <Ionicons name="copy-outline" size={22} color={colors.surface} />
              <Text style={styles.modalBotaoPrincipalTexto}>Copiar código PIX</Text>
            </TouchableOpacity>
          )}
          {assets.pix_copy_paste && (
            <View style={styles.pixCodeBox}>
              <Text style={styles.pixCodeLabel}>PIX copia e cola</Text>
              <Text style={styles.pixCodeValue} numberOfLines={1} ellipsizeMode="middle">
                {assets.pix_copy_paste}
              </Text>
            </View>
          )}
        </>
      )}

      {(abaAtiva === 'boleto' || (!temAmbos && temBoleto)) && (
        <>
          {assets.boleto_digitable && (
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
                  onPress={() => onCopy(assets.boleto_digitable!, 'Linha digitável')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="copy-outline" size={20} color={colors.surface} />
                  <Text style={styles.boletoCopiarBotaoTexto}>Copiar</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {assets.boleto_url && (
            <TouchableOpacity
              style={styles.modalBotao}
              onPress={() => onDownloadBoleto(assets.boleto_url!)}
              activeOpacity={0.8}
            >
              <Ionicons style={styles.modalAcaoIcone} name="download-outline" size={22} color={colors.primary} />
              <Text style={[styles.modalBotaoTitulo, { color: colors.primary }]}>Baixar boleto</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {!temBoleto && !temPix && (
        <View style={styles.modalErro}>
          <Ionicons name="alert-circle-outline" size={22} color={colors.muted} />
          <Text style={styles.modalErroTexto}>
            Dados de pagamento ainda não disponíveis. Aguarde e consulte o status.
          </Text>
        </View>
      )}
    </View>
  );
}
