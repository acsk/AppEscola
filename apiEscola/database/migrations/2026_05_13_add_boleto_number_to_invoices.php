<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('boleto_number')->nullable()->after('cora_pix_copy_paste')->comment('Número/código de barras do boleto');
            $table->string('boleto_digitable')->nullable()->after('boleto_number')->comment('Linha digitável do boleto');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn(['boleto_number', 'boleto_digitable']);
        });
    }
};
