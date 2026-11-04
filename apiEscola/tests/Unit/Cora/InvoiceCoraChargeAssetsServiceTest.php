<?php

namespace Tests\Unit;

use App\Services\InvoiceCoraChargeAssetsService;
use Tests\TestCase;

class InvoiceCoraChargeAssetsServiceTest extends TestCase
{
    private InvoiceCoraChargeAssetsService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new InvoiceCoraChargeAssetsService;
    }

    public function test_pix_qr_png_is_not_boleto_asset(): void
    {
        $pixQrUrl = 'https://storage.googleapis.com/download/storage/v1/b/cora_production_border_bankslip_storage/o/cobranca-qrcode-d5184ea0.png?alt=media';

        $this->assertTrue($this->service->isPixQrImageUrl($pixQrUrl));
        $this->assertFalse($this->service->isHybridBoletoUrl($pixQrUrl));
        $this->assertFalse($this->service->hasBoletoAssets([
            'boleto_url' => $pixQrUrl,
            'boleto_number' => null,
            'boleto_digitable' => null,
        ]));
        $this->assertTrue($this->service->hasPixAssets([
            'pix_copy_paste' => '00020101021226810014br.gov.bcb.pix',
            'pix_qr_image_url' => $pixQrUrl,
        ]));
    }

    public function test_real_boleto_pdf_is_boleto_asset(): void
    {
        $boletoUrl = 'https://storage.googleapis.com/download/storage/v1/b/cora_production_border_bankslip_storage/o/boleto-0e805af0.pdf?alt=media';

        $this->assertFalse($this->service->isPixQrImageUrl($boletoUrl));
        $this->assertTrue($this->service->hasBoletoAssets([
            'boleto_url' => $boletoUrl,
            'boleto_number' => null,
            'boleto_digitable' => null,
        ]));
    }

    public function test_hybrid_boleto_qrcode_pdf_detected(): void
    {
        $hybridUrl = 'https://storage.googleapis.com/x/boleto-qrcode-abc.pdf?alt=media';

        $this->assertTrue($this->service->isHybridBoletoUrl($hybridUrl));
        $this->assertFalse($this->service->isPixQrImageUrl($hybridUrl));
        $this->assertTrue($this->service->hasBoletoAssets([
            'boleto_url' => $hybridUrl,
        ]));
    }

    public function test_external_pix_only_payload_resolves_as_pix(): void
    {
        $external = [
            'payment_url' => 'https://storage.googleapis.com/x/cobranca-qrcode-abc.png?alt=media',
            'pix' => [
                'emv' => '00020101021226810014br.gov.bcb.pix2559qrcode.cora.com.br/v1/cobv/abc',
            ],
        ];

        $this->assertSame('pix', $this->service->resolveChargeMethodFromExternal($external));

        $assets = $this->service->paymentAssetsFromExternal($external);
        $this->assertNull($assets['boleto_url']);
        $this->assertNotNull($assets['pix_copy_paste']);
        $this->assertNotNull($assets['pix_qr_image_url']);
    }
}
