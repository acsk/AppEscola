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

    private const PROVIDER_CANCELLED_STATUSES = [
        'CANCELLED', 'CANCELED', 'VOIDED', 'EXPIRED',
        'DELETED', 'REFUNDED',
    ];

    public function __construct(
        private readonly PaymentGatewayFactory $gatewayFactory,
        private readonly InvoicePaymentSettingsResolver $paymentSettingsResolver,
    ) {
    }

    /**
     * @return array{
     *   can_edit: bool,
     *   can_cancel: bool,
     *   can_delete: bool,
     *   requires_cora_cancel_before_delete: bool,
     *   edit_block_reason: ?string,
     *   cancel_block_reason: ?string,
     *   delete_block_reason: ?string,
     *   lifecycle_hint: ?string,
     *   is_local_invoice: bool
     * }
     */
    public function permissions(Invoice $invoice): array
    {
        $status = strtolower((string) $invoice->status);
        $hasActiveGatewayCharge = $this->hasActiveGatewayCharge($invoice);
        $hasGeneratedCharge = $this->hasGeneratedPaymentCharge($invoice);

        $canEdit = ! in_array($status, ['paid', 'cancelled'], true) && ! $hasGeneratedCharge;
        $editBlockReason = null;

        if (in_array($status, ['paid', 'cancelled'], true)) {
            $editBlockReason = 'Não é possível editar uma cobrança paga ou cancelada.';
        } elseif ($hasGeneratedCharge) {
            $editBlockReason = 'Não é possível editar uma cobrança com boleto ou PIX já gerado. Cancele a cobrança no provedor antes, se necessário.';
        }

        $canCancel = false;
        $cancelBlockReason = null;

        if ($status === 'paid') {
            $cancelBlockReason = 'Cobrança já está paga.';
        } elseif ($status === 'cancelled') {
            $cancelBlockReason = 'Cobrança já está cancelada.';
        } else {
            $canCancel = true;
        }

        $requiresCoraCancelBeforeDelete = $hasActiveGatewayCharge && $status !== 'cancelled';
        $isLocalInvoice = $this->isLocallyCreatedInvoice($invoice);

        $canDelete = false;
        $deleteBlockReason = null;

        if ($status === 'paid') {
            $deleteBlockReason = 'Não é possível excluir uma cobrança paga.';
        } elseif (! $isLocalInvoice) {
            if ($this->wasImportedFromCoraSync($invoice)) {
                $deleteBlockReason = 'Cobranças importadas da Cora não podem ser excluídas. Use cancelar para manter o histórico.';
            } elseif ($hasGeneratedCharge) {
                $deleteBlockReason = 'Só é possível excluir cobranças criadas no sistema sem boleto ou PIX gerado.';
            } elseif ($requiresCoraCancelBeforeDelete) {
                $deleteBlockReason = 'Cancele a cobrança no provedor antes de excluir do sistema.';
            } else {
                $deleteBlockReason = 'Esta cobrança não foi criada apenas no sistema e não pode ser excluída.';
            }
        } else {
            $canDelete = true;
        }

        $lifecycleHint = match (true) {
            $status === 'cancelled' && $isLocalInvoice => 'Cobrança local cancelada. Pode ser excluída para remover da listagem.',
            $status === 'cancelled' => 'Cancelada no sistema.',
            $hasActiveGatewayCharge && $canCancel => 'Cancelar invalida o boleto/PIX no provedor e mantém o histórico.',
            $isLocalInvoice && in_array($status, ['pending', 'overdue'], true) => 'Excluir remove o registro local (cobrança ainda não foi enviada ao banco).',
            default => null,
        };

        return [
            'can_edit' => $canEdit,
            'can_cancel' => $canCancel,
            'can_delete' => $canDelete,
            'requires_cora_cancel_before_delete' => $requiresCoraCancelBeforeDelete,
            'edit_block_reason' => $editBlockReason,
            'cancel_block_reason' => $cancelBlockReason,
            'delete_block_reason' => $deleteBlockReason,
            'lifecycle_hint' => $lifecycleHint,
            'is_local_invoice' => $isLocalInvoice,
        ];
    }

    /**
     * Cobrança criada no sistema (lote do contrato ou cadastro manual), sem importação Cora
     * e sem boleto/PIX já emitido.
     */
    public function isLocallyCreatedInvoice(Invoice $invoice): bool
    {
        if ($this->wasImportedFromCoraSync($invoice)) {
            return false;
        }

        return ! $this->hasGeneratedPaymentCharge($invoice);
    }

    public function wasImportedFromCoraSync(Invoice $invoice): bool
    {
        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $origin = strtolower(trim((string) data_get($payload, 'integration.origin', '')));

        return $origin === 'cora_sync';
    }

    public function hasGeneratedPaymentCharge(Invoice $invoice): bool
    {
        if (filled($invoice->cora_charge_id)) {
            return true;
        }

        return filled($invoice->boleto_number)
            || filled($invoice->boleto_digitable)
            || filled($invoice->cora_payment_url)
            || filled($invoice->cora_pix_copy_paste);
    }

    public function assertCanEdit(Invoice $invoice): void
    {
        $permissions = $this->permissions($invoice);

        if (! $permissions['can_edit']) {
            throw new RuntimeException(
                (string) ($permissions['edit_block_reason'] ?? 'Não é possível editar esta cobrança.')
            );
        }
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

    public function resolveCoraEnvironment(Request $request, ?Invoice $invoice = null): string
    {
        $fromInvoice = $this->environmentFromInvoicePayload($invoice);
        if ($fromInvoice !== null) {
            return $fromInvoice;
        }

        $requestedEnv = (string) $request->input('environment', '');
        if ($requestedEnv === '') {
            $requestedEnv = app()->environment('production') ? 'prod' : 'stage';
        }
        $requestedEnv = $requestedEnv === 'production' ? 'prod' : $requestedEnv;

        if (! app()->environment('production')) {
            return 'stage';
        }

        $user = $request->user();
        if ($user && method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return in_array($requestedEnv, ['prod', 'stage'], true) ? $requestedEnv : 'prod';
        }

        return 'prod';
    }

    private function environmentFromInvoicePayload(?Invoice $invoice): ?string
    {
        if ($invoice === null) {
            return null;
        }

        $payload = is_array($invoice->cora_payload) ? $invoice->cora_payload : [];
        $stored = strtolower(trim((string) data_get($payload, 'integration.environment', '')));

        if (in_array($stored, ['prod', 'production'], true)) {
            return 'prod';
        }

        if ($stored === 'stage') {
            return 'stage';
        }

        return null;
    }

    /**
     * Cancela no gateway (quando aplicável) e atualiza a invoice localmente.
     *
     * @return array{cancelled_on_gateway: bool, environment: string}
     */
    public function cancelInvoice(Invoice $invoice, Request $request): array
    {
        $this->assertCanCancel($invoice);

        $environment = $this->resolveCoraEnvironment($request, $invoice);
        $cancelledOnGateway = false;

        if ($this->shouldCancelOnGateway($invoice)) {
            $invoice->loadMissing('tenant');
            $tenant = $invoice->tenant;

            if (! $tenant instanceof Tenant) {
                throw new RuntimeException('Tenant da cobrança não encontrado.');
            }

            $chargeId = (string) $invoice->cora_charge_id;
            $this->cancelChargeOnGateway($tenant, $chargeId, $environment);
            $this->assertGatewayChargeCancelledOnProvider($tenant, $chargeId, $environment);
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

    public function shouldCancelOnGateway(Invoice $invoice): bool
    {
        return $this->hasActiveGatewayCharge($invoice);
    }

    /**
     * Cancela cobrança ativa na Cora e só retorna após confirmação no provedor.
     * A baixa manual (status paid) deve ocorrer somente depois deste passo.
     *
     * @return bool true quando cancelou no provedor
     */
    public function invalidateGatewayChargeBeforeSettlement(Invoice $invoice, Request $request): bool
    {
        if (! $this->shouldCancelOnGateway($invoice)) {
            return false;
        }

        $invoice->loadMissing('tenant');
        $tenant = $invoice->tenant;

        if (! $tenant instanceof Tenant) {
            throw new RuntimeException('Tenant da cobrança não encontrado.');
        }

        $environment = $this->resolveCoraEnvironment($request, $invoice);
        $chargeId = (string) $invoice->cora_charge_id;

        $this->cancelChargeOnGateway($tenant, $chargeId, $environment);
        $this->assertGatewayChargeCancelledOnProvider($tenant, $chargeId, $environment);

        $invoice->update([
            'cora_status' => 'CANCELLED',
            'cora_last_synced_at' => now(),
        ]);

        return true;
    }

    private function assertGatewayChargeCancelledOnProvider(Tenant $tenant, string $chargeId, string $environment): void
    {
        try {
            $provider = $this->resolveGatewayProviderForInvoice($tenant, $chargeId);
            $external = $this->gatewayFactory->resolve($provider)->getInvoiceById($tenant, $chargeId, $environment);
        } catch (RequestException $e) {
            if ($e->response?->status() === 404) {
                return;
            }

            throw new RuntimeException(
                'Não foi possível confirmar o cancelamento no provedor. A baixa não foi registrada.',
                0,
                $e
            );
        } catch (ConnectionException $e) {
            throw new RuntimeException(
                'Não foi possível confirmar o cancelamento no provedor. A baixa não foi registrada.',
                0,
                $e
            );
        }

        $localStatus = strtolower(trim((string) ($external['local_status'] ?? '')));

        if ($localStatus === 'cancelled') {
            return;
        }

        $status = strtoupper(trim((string) ($external['status'] ?? '')));

        if (in_array($status, self::PROVIDER_CANCELLED_STATUSES, true)) {
            return;
        }

        throw new RuntimeException(
            "Cancelamento no provedor ainda não confirmado (status: {$status}). A baixa não foi registrada."
        );
    }

    private function cancelChargeOnGateway(Tenant $tenant, string $chargeId, string $environment): void
    {
        $chargeId = trim($chargeId);

        if ($chargeId === '') {
            throw new RuntimeException('ID da cobrança no provedor é obrigatório para cancelamento.');
        }

        $provider = $this->resolveGatewayProviderForInvoice($tenant, $chargeId);
        $this->gatewayFactory->resolve($provider)->cancelCharge($tenant, $chargeId, $environment);
    }

    private function resolveGatewayProviderForInvoice(Tenant $tenant, string $chargeId): string
    {
        $invoice = Invoice::query()
            ->where('tenant_id', $tenant->id)
            ->where('cora_charge_id', $chargeId)
            ->first();

        if ($invoice) {
            $fromPayload = strtolower(trim((string) data_get($invoice->cora_payload, 'integration.provider', '')));

            if ($fromPayload !== '' && PaymentGatewayFactory::isSupported($fromPayload)) {
                return $fromPayload;
            }
        }

        return $this->paymentSettingsResolver->defaultProviderSlug($tenant->id);
    }
}
