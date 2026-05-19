<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->timestamp('charges_generated_at')->nullable()->after('payment_due_day')
                ->comment('Preenchido quando as cobranças são geradas em lote. Impede nova geração em lote.');
        });
    }

    public function down(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->dropColumn('charges_generated_at');
        });
    }
};
