<?php

namespace App\Services;

use App\Models\Enrollment;
use App\Models\Invoice;
use App\Models\Tenant;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class InvoiceLifecycleService
{
    private const ACTIVE_CORA_STATUSES = ['OPEN', 'PENDING', 'PROCESSING', 'CREATED'];

    private const TERMINAL_CORA_STATUSES = ['PAID', 'IN_PAYMENT', 'COMPLETED', 'RECEIVED', 'CANCELLED', 'CANCELED', 'VOIDED', 'EXPIRED'];

    public function __construct(private readonly PaymentGatewayFactory $gatewayFactory)
    {
    }

    /**
     * @return array{
     *   can_edit: bool,
     *   can_cancel: bool,
     *   can_delete: bool,
     *   requires_cora_cancel_before_delete: bool,
     *   cancel_block_reason: ?string,
     *   delete_block_reason: ?string,
     *   lifecycle_hint: ?string
     * }
     */
    public function permissions(Invoice $invoice): array
    {
        $status = strtolower((string) $invoice->status);
        $hasActiveGatewayCharge = $this->hasActiveGatewayCharge($invoice);
        $isPixOnlyActive = $this->isPixOnlyActiveCharge($invoice);

        $canEdit = ! in_array($status, ['paid', 'cancelled'], true);

        $canCancel = false;
        $cancelBlockReason = null;

        if ($status === 'paid') {
            $cancelBlockReason = 'Cobrança já está paga.';
        } elseif ($status === 'cancelled') {
            $cancelBlockReason = 'Cobrança já está cancelada.';
        } elseif ($isPixOnlyActive) {
            $cancelBlockReason = 'Cobranças PIX ativas expiram automaticamente na Cora. Aguarde a expiração ou marque como paga.';
        } else {
            $canCancel = true;
        }

        $requiresCoraCancelBeforeDelete = $hasActiveGatewayCharge && $status !== 'cancelled';

        $canDelete = false;
        $deleteBlockReason = null;

        if ($status === 'paid') {
            $deleteBlockReason = 'Não é possível excluir uma cobrança paga.';
        } elseif ($requiresCoraCancelBeforeDelete) {
            $deleteBlockReason = 'Cancele a cobrança no provedor antes de excluir do sistema.';
        } elseif ($isPixOnlyActive) {
            $deleteBlockReason = 'Cobrança PIX ativa na Cora. Aguarde expirar ou cancele/marque como paga antes de excluir.';
        } else {
            $canDelete = true;
        }

        $lifecycleHint = match (true) {
            $status === 'cancelled' => 'Cancelada no sistema. Pode ser excluída para remover da listagem.',
            $hasActiveGatewayCharge && $canCancel => 'Cancelar invalida o boleto/PIX no provedor e mantém o histórico.',
            ! $hasActiveGatewayCharge && $status === 'pending' => 'Excluir remove apenas o registro local (cobrança não foi enviada ao banco).',
            default => null,
        };

        return [
            'can_edit' => $canEdit,
            'can_cancel' => $canCancel,
            'can_delete' => $canDelete,
            'requires_cora_cancel_before_delete' => $requiresCoraCancelBeforeDelete,
            'cancel_block_reason' => $cancelBlockReason,
            'delete_block_reason' => $deleteBlockReason,
            'lifecycle_hint' => $lifecycleHint,
        ];
    }

    public function assertCanCancel(Invoice $invoice): void
    {
        $permissions = $this->permissions($invoice);

        if (! $permissions['can_cancel']) {
            throw new RuntimeException(
                (string) ($permissions['cancel_block_reason'] ?? 'Não é possível cancelar esta cobrança.')
            );
        }
    }

    public function assertCanDelete(Invoice $invoice): void
    {
        $permissions = $this->permissions($invoice);

        if (! $permissions['can_delete']) {
            throw new RuntimeException(
                (string) ($permissions['delete_block_reason'] ?? 'Não é possível excluir esta cobrança.')
            );
        }
    }

    public function resolveCoraEnvironment(Request $request): string
    {
        $requestedEnv = (string) $request->input('environment', 'stage');
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        if (! app()->environment('production')) {
            return 'stage';
        }

        $user = $request->user();
        if ($user && method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return $requestedEnv ?: 'prod';
        }

        return 'prod';
    }

    /**
     * Cancela no gateway (quando aplicável) e atualiza a invoice localmente.
     *
     * @return array{cancelled_on_gateway: bool, environment: string}
     */
    public function cancelInvoice(Invoice $invoice, Request $request): array
    {
        $this->assertCanCancel($invoice);

        $environment = $this->resolveCoraEnvironment($request);
        $cancelledOnGateway = false;

        if ($this->shouldCancelOnGateway($invoice)) {
            $invoice->loadMissing('tenant');
            $tenant = $invoice->tenant;

            if (! $tenant instanceof Tenant) {
                throw new RuntimeException('Tenant da cobrança não encontrado.');
            }

            $this->cancelChargeOnGateway($tenant, (string) $invoice->cora_charge_id, $environment);
            $cancelledOnGateway = true;
        }

        $invoice->update([
            'status' => 'cancelled',
            'cora_status' => $cancelledOnGateway ? 'CANCELLED' : $invoice->cora_status,
            'cora_last_synced_at' => now(),
        ]);

        return [
            'cancelled_on_gateway' => $cancelledOnGateway,
            'environment' => $environment,
        ];
    }

    /**
     * Cancela cobranças ativas no gateway antes de remover matrícula/invoices.
     *
     * @return array{
     *   cancelled_gateway: int,
     *   cancelled_local_only: int,
     *   skipped: int,
     *   failures: array<int, array{invoice_id: int, message: string}>
     * }
     */
    public function cancelEnrollmentInvoicesBeforeRemoval(Enrollment $enrollment, Request $request): array
    {
        $summary = [
            'cancelled_gateway' => 0,
            'cancelled_local_only' => 0,
            'skipped' => 0,
            'failures' => [],
        ];

        $invoices = $enrollment->invoices()
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->get();

        foreach ($invoices as $invoice) {
            $permissions = $this->permissions($invoice);

            if (! $permissions['can_cancel'] && ! $permissions['can_delete']) {
                $summary['skipped']++;
                $summary['failures'][] = [
                    'invoice_id' => $invoice->id,
                    'message' => (string) ($permissions['cancel_block_reason'] ?? $permissions['delete_block_reason'] ?? 'Cobrança não pode ser encerrada automaticamente.'),
                ];
                continue;
            }

            try {
                if ($permissions['can_cancel']) {
                    $result = $this->cancelInvoice($invoice, $request);
                    if ($result['cancelled_on_gateway']) {
                        $summary['cancelled_gateway']++;
                    } else {
                        $summary['cancelled_local_only']++;
                    }
                    continue;
                }

                if ($permissions['can_delete']) {
                    $invoice->update(['status' => 'cancelled']);
                    $summary['cancelled_local_only']++;
                    continue;
                }

                $summary['skipped']++;
            } catch (RuntimeException|ConnectionException|RequestException $e) {
                $summary['failures'][] = [
                    'invoice_id' => $invoice->id,
                    'message' => $e->getMessage(),
                ];
            }
        }

        if ($summary['failures'] !== []) {
            Log::warning('InvoiceLifecycleService enrollment cancel had failures', [
                'enrollment_id' => $enrollment->id,
                'tenant_id' => $enrollment->tenant_id,
                'summary' => $summary,
            ]);
        }

        return $summary;
    }

    public function hasActiveGatewayCharge(Invoice $invoice): bool
    {
        if (! $invoice->cora_charge_id) {
            return false;
        }

        if (strtolower((string) $invoice->status) === 'cancelled') {
            return false;
        }

        $providerStatus = strtoupper(trim((string) $invoice->cora_status));

        if ($providerStatus === '') {
            return true;
        }

        if (in_array($providerStatus, self::TERMINAL_CORA_STATUSES, true)) {
            return false;
        }

        return in_array($providerStatus, self::ACTIVE_CORA_STATUSES, true);
    }

    public function isPixOnlyActiveCharge(Invoice $invoice): bool
    {
        if (! $this->hasActiveGatewayCharge($invoice)) {
            return false;
        }

        return strtolower((string) $invoice->payment_method) === 'pix';
    }

    private function shouldCancelOnGateway(Invoice $invoice): bool
    {
        return $this->hasActiveGatewayCharge($invoice)
            && ! $this->isPixOnlyActiveCharge($invoice);
    }

    private function cancelChargeOnGateway(Tenant $tenant, string $chargeId, string $environment): void
    {
        $chargeId = trim($chargeId);

        if ($chargeId === '') {
            throw new RuntimeException('ID da cobrança no provedor é obrigatório para cancelamento.');
        }

        $this->gatewayFactory->resolve('cora')->cancelCharge($tenant, $chargeId, $environment);
    }
}
