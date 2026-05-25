<?php

use App\Models\Invoice;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Deve rodar antes das migrations 2026_05_19_* que gravam "hybrid" em tenant_settings.
     */
    public function up(): void
    {
        if (! Schema::hasTable('domain_payment_methods')) {
            return;
        }

        if (DB::table('domain_payment_methods')->where('slug', 'hybrid')->exists()) {
            return;
        }

        DB::table('domain_payment_methods')->insert([
            'slug' => 'hybrid',
            'name' => 'Boleto + PIX',
        ]);
    }

    public function down(): void
    {
        if (! Schema::hasTable('domain_payment_methods')) {
            return;
        }

        if (! DB::table('domain_payment_methods')->where('slug', 'hybrid')->exists()) {
            return;
        }

        if ($this->hybridIsReferencedByInvoices()) {
            throw new RuntimeException(
                'Rollback bloqueado: existem cobranças (inclusive excluídas) com payment_method = hybrid. '
                . 'Altere ou remova essas referências antes de reverter esta migration.'
            );
        }

        DB::table('domain_payment_methods')->where('slug', 'hybrid')->delete();
    }

    private function hybridIsReferencedByInvoices(): bool
    {
        if (! Schema::hasTable('invoices')) {
            return false;
        }

        return Invoice::withTrashed()
            ->where('payment_method', 'hybrid')
            ->exists();
    }
};
