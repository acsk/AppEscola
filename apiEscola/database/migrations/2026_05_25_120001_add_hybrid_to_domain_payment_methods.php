<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Conteúdo movido para 2026_05_18_120000_add_hybrid_to_domain_payment_methods.php
     * (antes das migrations 2026_05_19 que referenciam hybrid em tenant_settings).
     *
     * Mantida como no-op para ambientes que já registraram este arquivo na tabela migrations.
     */
    public function up(): void
    {
        // no-op
    }

    public function down(): void
    {
        // no-op
    }
};
