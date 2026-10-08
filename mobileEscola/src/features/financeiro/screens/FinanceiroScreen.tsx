import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import type { Cobranca } from '../../../services/financeiro.service';
import { fetchStudentPerformance } from '../../../services/performance.service';
import { enrollmentHeadline, primaryActiveEnrollment, type StudentActiveEnrollment } from '../../../types/student-enrollment';
import { useCobrancas, usePaymentModal } from '../hooks';
import { getFinanceiroErrorMessage } from '../utils/errors';
import { formatarData, formatarMoeda } from '../utils/formatters';
import { PaymentModal } from '../components/PaymentModal';
import { ConsultaStatusModal } from '../components/ConsultaStatusModal';
import { FinanceiroStylesProvider } from '../FinanceiroStylesContext';
import { useOptionalAlunoDrawer } from '../../../context/AlunoDrawerContext';
import {
  AppBar, Button, Card, EmptyState, Icon, IconButton, InvoiceRow, Notice, Overline, PageBody, PageHeader, PlanCard, ScreenBody,
  SegmentedControl, StatTile, Txt, font, radius, space, useLayoutMode, usePalette, type InvoiceStatus,
} from '../../../ui';

type Filter = 'all' | 'open' | 'paid';

/** Turmas da matrícula para o PlanCard ("CPM 1 dia · Turma 2"). */
function planClasses(e: StudentActiveEnrollment): string[] {
  const list = e.school_classes.length ? e.school_classes.map((c) => [c.course?.name, c.name].filter(Boolean).join(' · '))
    : e.school_class ? [[e.course?.name, e.school_class.name].filter(Boolean).join(' · ')] : [];
  return [...new Set(list)];
}

/**
 * Financeiro (protótipos "TelaFinanceiro" e "DesktopFinanceiro"): a primeira linha responde "estou em dia?";
 * depois a próxima cobrança, o histórico e o pacote. O pagamento (Pix/boleto) segue no modal de sempre.
 */
function FinanceiroContent() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const drawer = useOptionalAlunoDrawer();
  const { isMobile, isDesktop } = useLayoutMode();
  const { data, isLoading, isError, error, refetch, isRefetching } = useCobrancas();
  const enrollmentQuery = useQuery({ queryKey: ['aluno', 'performance', 6], queryFn: () => fetchStudentPerformance(6), staleTime: 5 * 60 * 1000 });
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  const payment = usePaymentModal({ onPaid: () => { void refetch(); } });

  const copy = (texto: string, label: string) => { Clipboard.setString(texto); Alert.alert('Copiado', `${label} copiado com sucesso!`); };
  const openBoleto = async (url: string) => {
    try { await Linking.openURL(url); } catch { Alert.alert('Erro', 'Não foi possível baixar o boleto.'); }
  };

  const enrollment = primaryActiveEnrollment(enrollmentQuery.data?.student?.active_enrollments);
  const late = data?.atrasados ?? [];
  const open = data ? (data.abertas.length ? data.abertas : data.atual ? [data.atual] : []) : [];
  const paid = data?.pagas ?? [];
  const next: Cobranca | null = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  const year = new Date().getFullYear();
  const paidThisYear = paid.filter((c) => c.due_date.startsWith(String(year)));
  const sumOf = (list: Cobranca[]) => list.reduce((acc, c) => acc + parseFloat(c.amount || '0'), 0);
  const lateTotal = data?.resumo ? parseFloat(data.resumo.valor_total_atrasados || '0') : sumOf(late);

  const statusOf = (c: Cobranca): InvoiceStatus => (c.status === 'paid' || paid.includes(c) ? 'paid' : c.is_overdue || late.includes(c) ? 'late' : 'open');
  const invoices = [...late, ...open.filter((c) => !late.includes(c)), ...paid]
    .filter((c) => filter === 'all' || (filter === 'paid' ? statusOf(c) === 'paid' : statusOf(c) !== 'paid'));

  const statusBar = late.length ? (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.lg, backgroundColor: p.dangerSoft }}>
      <Icon name="alert" size={20} color={p.dangerInk} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: p.dangerInk, ...font.medium }}>
        <Text style={{ ...font.bold }}>Você tem {late.length} {late.length === 1 ? 'cobrança atrasada' : 'cobranças atrasadas'}.</Text> {formatarMoeda(lateTotal)} em aberto.
      </Text>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 14, paddingHorizontal: space[4], borderRadius: radius.lg, backgroundColor: p.successSoft }}>
      <Icon name="check" size={20} color={p.success} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: p.success, ...font.medium }}>
        <Text style={{ ...font.bold }}>Tudo em dia.</Text> Nenhuma cobrança atrasada.
      </Text>
    </View>
  );

  const row = (c: Cobranca, i: number) => {
    const status = statusOf(c);
    return (
      <InvoiceRow key={c.id} first={i === 0} wide={isDesktop} title={c.description} due={formatarData(c.due_date)} status={status} amount={formatarMoeda(c.amount)}
        onPay={status !== 'paid' ? () => payment.abrir(c) : undefined} />
    );
  };

  const plan = enrollment ? (
    <PlanCard kind={enrollment.bundle ? 'Pacote' : 'Plano'} code={enrollment.enrollment_number} name={enrollmentHeadline(enrollment)}
      billing={enrollment.bundle?.cycle_label ? `Cobrança ${enrollment.bundle.cycle_label.toLowerCase()}` : null} classes={planClasses(enrollment)} />
  ) : null;

  const modals = (
    <>
      <PaymentModal
        visible={payment.visible} bottomInset={insets.bottom} modalTranslateY={payment.modalTranslateY} cobrancaSelecionada={payment.cobrancaSelecionada}
        paymentOptions={payment.paymentOptions} paymentResult={payment.paymentResult} paymentLoading={payment.paymentLoading} paymentError={payment.paymentError}
        generatingMethod={payment.generatingMethod} checkingStatus={payment.checkingStatus} activePaymentTab={payment.activePaymentTab}
        onChangeTab={payment.setActivePaymentTab} onClose={payment.fechar} onGenerate={payment.gerarCobranca} onCheckStatus={payment.consultarStatus}
        onRetry={() => { payment.setPaymentError(null); void payment.retryPaymentOptions(); }} onCopy={copy} onDownloadBoleto={openBoleto} />
      <ConsultaStatusModal visible={payment.consultaStatusModalVisivel} data={payment.consultaStatusData} onClose={payment.fecharConsultaStatus} />
    </>
  );

  const refresh = <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={p.brand} colors={[p.brand]} />;
  const state = isLoading ? <ActivityIndicator color={p.brand} style={{ marginTop: space[6] }} />
    : isError ? (
      <View style={{ gap: space[3] }}>
        <Notice tone="danger" title="Não foi possível carregar as cobranças" text={getFinanceiroErrorMessage(error, 'Tente de novo.')} />
        <Button variant="secondary" icon="refresh" label="Tentar de novo" onPress={() => refetch()} />
      </View>
    ) : !data || (!late.length && !open.length && !paid.length) ? (
      <EmptyState icon="wallet" title="Nenhuma cobrança por enquanto" text="Mensalidades, taxas e pagamentos aparecem aqui." />
    ) : null;

  if (isDesktop) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: p.bg }} refreshControl={refresh}>
        <PageBody maxWidth="none">
          <PageHeader title="Financeiro" subtitle="Cobranças, pagamentos e o seu pacote" />
          {state ?? (
            <>
              {statusBar}
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                {[
                  ['Próxima cobrança', next ? formatarMoeda(next.amount) : '—', next ? `Vence ${formatarData(next.due_date)}` : 'Nada em aberto'],
                  ['Em atraso', formatarMoeda(lateTotal), late.length ? `${late.length} ${late.length === 1 ? 'cobrança' : 'cobranças'}` : 'Nenhuma cobrança'],
                  [`Pago em ${year}`, formatarMoeda(sumOf(paidThisYear)), `${paidThisYear.length} ${paidThisYear.length === 1 ? 'pagamento' : 'pagamentos'}`],
                ].map(([label, value, hint]) => (
                  <StatTile key={label} label={label} value={value} hint={hint} tone={label === 'Em atraso' && late.length ? 'danger' : undefined}
                    style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, padding: space[4] }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: space[6], alignItems: 'flex-start' }}>
                <Card padding="none" style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderBottomWidth: 1, borderBottomColor: p.line }}>
                    <Txt variant="titleSm" style={{ flex: 1 }}>Cobranças</Txt>
                    <View style={{ width: 300 }}>
                      <SegmentedControl label="Filtro" options={['Todas', 'Em aberto', 'Pagas']} value={['all', 'open', 'paid'].indexOf(filter)} onChange={(i) => setFilter((['all', 'open', 'paid'] as Filter[])[i])} />
                    </View>
                  </View>
                  <View style={{ padding: space[2] }}>{invoices.length ? invoices.map(row) : <Txt tone="subtle" style={{ padding: space[4] }}>Nenhuma cobrança neste filtro.</Txt>}</View>
                </Card>
                <View style={{ width: 360, gap: space[4] }}>
                  {plan}
                  <Card style={{ gap: 4 }}>
                    <Txt variant="titleSm">Como pagar</Txt>
                    <Txt tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>Pix ou boleto pelo botão "Pagar". O pagamento aparece aqui depois da confirmação do banco.</Txt>
                  </Card>
                </View>
              </View>
            </>
          )}
        </PageBody>
        {modals}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <AppBar large title="Financeiro" subtitle="Cobranças e pagamentos"
        leading={drawer && isMobile ? <IconButton icon="menu" label="Abrir menu" variant="outline" onPress={drawer.open} /> : undefined} />
      <ScrollView refreshControl={refresh}>
        <ScreenBody gap={20} style={{ paddingTop: space[2], width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          {state ?? (
            <>
              {statusBar}
              {next || late[0] ? (() => {
                const target = late[0] ?? (next as Cobranca);
                const isLate = !!late[0];
                return (
                  <Card padding="lg" style={{ gap: 6 }}>
                    <Overline>{isLate ? 'Cobrança atrasada' : 'Próxima cobrança'}</Overline>
                    <Text style={{ ...font.extrabold, fontSize: 32, lineHeight: 38, color: isLate ? p.dangerInk : p.ink, fontVariant: ['tabular-nums'] }}>{formatarMoeda(target.amount)}</Text>
                    <Txt variant="bodySm" tone="subtle" style={{ marginBottom: space[2] }}>{target.description} · {isLate ? 'venceu' : 'vence'} {formatarData(target.due_date)}</Txt>
                    <Button block variant={isLate ? 'danger' : 'primary'} label="Pagar com Pix" onPress={() => payment.abrir(target, 'pix')} />
                    <Button block variant="ghost" size="sm" label="Prefiro boleto" onPress={() => payment.abrir(target, 'boleto')} />
                  </Card>
                );
              })() : null}
              <View style={{ gap: 10 }}>
                <Txt variant="titleSm" style={{ fontSize: 15 }}>Histórico</Txt>
                <Card padding="none" style={{ paddingVertical: 4 }}>{invoices.map(row)}</Card>
              </View>
              {plan ? <View style={{ gap: 10 }}><Txt variant="titleSm" style={{ fontSize: 15 }}>Seu pacote</Txt>{plan}</View> : null}
            </>
          )}
        </ScreenBody>
      </ScrollView>
      {modals}
    </View>
  );
}

export function FinanceiroScreen() {
  return (
    <FinanceiroStylesProvider>
      <FinanceiroContent />
    </FinanceiroStylesProvider>
  );
}
