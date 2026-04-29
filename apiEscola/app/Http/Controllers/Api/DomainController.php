<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use OpenApi\Attributes as OA;
use App\Models\DomainBillingCycle;
use App\Models\DomainEnrollmentStatus;
use App\Models\DomainGuardianRelationship;
use App\Models\DomainInvoiceStatus;
use App\Models\DomainInvoiceType;
use App\Models\DomainPaymentMethod;
use App\Models\DomainPeriod;
use App\Models\DomainStatus;
use App\Models\DomainUserRole;
use App\Models\DomainWeekday;
use Illuminate\Http\JsonResponse;

class DomainController extends Controller
{
    #[OA\Get(path: '/api/domains/statuses', tags: ['Domain'], summary: 'Status disponíveis',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function statuses(): JsonResponse
    {
        return response()->json(DomainStatus::orderBy('slug')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/user-roles', tags: ['Domain'], summary: 'Papéis de usuário',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function userRoles(): JsonResponse
    {
        return response()->json(DomainUserRole::orderBy('slug')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/periods', tags: ['Domain'], summary: 'Períodos (turno)',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function periods(): JsonResponse
    {
        return response()->json(DomainPeriod::orderBy('order')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/weekdays', tags: ['Domain'], summary: 'Dias da semana',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function weekdays(): JsonResponse
    {
        return response()->json(DomainWeekday::orderBy('order')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/guardian-relationships', tags: ['Domain'], summary: 'Graus de parentesco',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function guardianRelationships(): JsonResponse
    {
        return response()->json(DomainGuardianRelationship::orderBy('slug')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/payment-methods', tags: ['Domain'], summary: 'Formas de pagamento',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function paymentMethods(): JsonResponse
    {
        return response()->json(DomainPaymentMethod::orderBy('slug')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/enrollment-statuses', tags: ['Domain'], summary: 'Status de matrícula',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function enrollmentStatuses(): JsonResponse
    {
        return response()->json(DomainEnrollmentStatus::orderBy('slug')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/invoice-statuses', tags: ['Domain'], summary: 'Status de cobrança',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function invoiceStatuses(): JsonResponse
    {
        return response()->json(DomainInvoiceStatus::orderBy('slug')->get(['slug', 'name']));
    }

    #[OA\Get(path: '/api/domains/billing-cycles', tags: ['Domain'], summary: 'Ciclos de cobrança (mensal, semestral etc)',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function billingCycles(): JsonResponse
    {
        return response()->json(DomainBillingCycle::orderBy('order')->get(['slug', 'name', 'months']));
    }

    #[OA\Get(path: '/api/domains/invoice-types', tags: ['Domain'], summary: 'Tipos de cobrança (taxa de matrícula, mensalidade etc)',
        responses: [new OA\Response(response: 200, description: 'OK')])]
    public function invoiceTypes(): JsonResponse
    {
        return response()->json(DomainInvoiceType::orderBy('slug')->get(['slug', 'name']));
    }
}
