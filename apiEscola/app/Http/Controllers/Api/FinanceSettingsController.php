<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankStatementSync;
use App\Models\Tenant;
use App\Services\Reconciliation\BankReconciliationService;
use App\Services\TenantBillingSettingsService;
use App\Support\FinancePermissions;
use App\Traits\AuthorizesFinance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Financeiro > Configurações financeiras: visão única do que já está configurado. Credenciais e regras de
 * cobrança continuam nas telas de origem; aqui nada de segredo é devolvido.
 */
class FinanceSettingsController extends Controller
{
    use AuthorizesFinance;

    /** Regras fixas de segurança da conciliação: exibidas, não editáveis. */
    private const RECONCILIATION_RULES = [
        ['key' => 'reliable_id', 'label' => 'Conciliar sozinho só com identificador confiável', 'description' => 'ID do pagamento no extrato ou ID da cobrança citado pela Cora.'],
        ['key' => 'exact_amount', 'label' => 'Valor precisa ser idêntico', 'description' => 'Igual ao da cobrança ou ao total pago informado pela Cora (juros/multa); diferenças vão para divergência.'],
        ['key' => 'suggest_only', 'label' => 'Valor e data só sugerem', 'description' => 'Valor igual e data próxima (±3 dias) aparecem como critérios; nunca conciliam sozinhos.'],
        ['key' => 'justification', 'label' => 'Justificativa obrigatória na conciliação manual', 'description' => 'Registrada no histórico da movimentação e na auditoria da cobrança ou despesa.'],
        ['key' => 'cora_confirms', 'label' => 'Cobrança Cora só é baixada com confirmação da Cora', 'description' => 'Aviso do webhook ou extrato disparam a consulta; a baixa vem da resposta da Cora.'],
    ];

    /** Rotinas automáticas agendadas (routes/console.php), em horário de Brasília. */
    private const ROUTINES = [
        ['key' => 'webhook', 'label' => 'Processar avisos do webhook Cora', 'schedule' => 'A cada minuto'],
        ['key' => 'statement', 'label' => 'Buscar extrato Cora e conciliar', 'schedule' => 'A cada 3 horas'],
        ['key' => 'paid_invoices', 'label' => 'Conferir cobranças pagas na Cora', 'schedule' => 'Diariamente às 03:15'],
        ['key' => 'recurring_expenses', 'label' => 'Gerar despesas recorrentes', 'schedule' => 'Diariamente às 05:30'],
    ];

    public function __construct(private readonly TenantBillingSettingsService $billing)
    {
    }

    public function show(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeFinance($request, FinancePermissions::VIEW);
        if ($tenantId instanceof JsonResponse) {
            return $tenantId;
        }

        $tenant = Tenant::query()->find($tenantId);
        if (! $tenant) {
            return $this->error('Instituição não encontrada.', null, 404);
        }

        $environment = app()->environment('production') ? 'prod' : 'stage';
        $lastSync = BankStatementSync::query()->where('tenant_id', $tenantId)->where('environment', $environment)->latest('id')->first();
        $balance = BankStatementSync::query()->where('tenant_id', $tenantId)->where('environment', $environment)
            ->where('status', 'success')->whereNotNull('balance_end')->orderByDesc('finished_at')->first();

        $settings = $this->billing->all($tenant);

        return $this->success([
            'environment' => $environment,
            'operating_since' => BankReconciliationService::operatingSince($tenantId)?->toDateString(),
            'statement' => [
                'last_sync' => $lastSync ? [
                    'status' => $lastSync->status,
                    'finished_at' => $lastSync->finished_at?->toISOString(),
                    'error' => $lastSync->error,
                ] : null,
                'bank_balance' => $balance ? [
                    'amount' => (string) $balance->balance_end,
                    'synced_at' => $balance->finished_at?->toISOString(),
                ] : null,
            ],
            'billing' => [
                'default_payment_due_day' => data_get($settings, 'billing.default_payment_due_day'),
                'default_provider' => data_get($settings, 'payment.default_provider'),
                'enabled_methods' => data_get($settings, 'payment.enabled_methods', []),
                'default_method' => data_get($settings, 'payment.default_method'),
                'auto_sync_charges' => (bool) data_get($settings, 'payment.auto_sync_charges'),
            ],
            // Hoje os boletos vão para a Cora sem multa/juros; ativar muda o valor das cobranças reais.
            'late_fees' => ['configured' => false],
            'reconciliation_rules' => self::RECONCILIATION_RULES,
            'routines' => self::ROUTINES,
            'permissions' => FinancePermissions::matrix(),
            'can_configure' => FinancePermissions::allows($request->user(), FinancePermissions::CONFIGURE),
        ], 'Configurações financeiras carregadas com sucesso.');
    }
}
