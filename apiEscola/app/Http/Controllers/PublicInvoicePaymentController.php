<?php

namespace App\Http\Controllers;

use App\Services\Cora\InvoiceCoraChargeAssetsService;
use App\Services\InvoicePublicLinkService;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class PublicInvoicePaymentController extends Controller
{
    public function __invoke(
        int $invoice,
        string $signature,
        InvoicePublicLinkService $links,
        InvoiceCoraChargeAssetsService $chargeAssets,
    ): Response {
        $model = $links->resolve($invoice, $signature);
        abort_if(! $model, 404);

        $assets = $chargeAssets->paymentAssetsFromInvoice($model);
        $chargeStatus = strtoupper((string) $model->cora_status);
        $isPaid = $model->status === 'paid' || $chargeStatus === 'PAID';
        $isCancelled = $model->status === 'cancelled' || $chargeStatus === 'CANCELLED';

        return response()
            ->view('payment.public-invoice', [
                'schoolName' => $model->tenant?->name,
                'studentFirstName' => $model->student ? Str::before(trim($model->student->name), ' ') : null,
                'description' => $model->description,
                'amount' => 'R$ '.number_format((float) $model->amount, 2, ',', '.'),
                'dueDate' => $model->due_date?->format('d/m/Y'),
                'isPaid' => $isPaid,
                'isCancelled' => $isCancelled,
                'boletoDigitable' => $assets['boleto_digitable'] ?: $assets['boleto_number'],
                'boletoUrl' => $chargeAssets->hasBoletoAssets($assets) ? $assets['boleto_url'] : null,
                'pixCopyPaste' => $assets['pix_copy_paste'],
                'pixQrImageUrl' => $assets['pix_qr_image_url'],
            ])
            ->header('X-Robots-Tag', 'noindex, nofollow')
            ->header('Cache-Control', 'no-store');
    }
}
