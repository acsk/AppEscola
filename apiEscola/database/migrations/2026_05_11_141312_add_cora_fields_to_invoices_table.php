<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('cora_charge_id')->nullable()->after('notes')->index();
            $table->string('cora_status')->nullable()->after('cora_charge_id');
            $table->text('cora_payment_url')->nullable()->after('cora_status');
            $table->text('cora_pix_copy_paste')->nullable()->after('cora_payment_url');
            $table->json('cora_payload')->nullable()->after('cora_pix_copy_paste');
            $table->timestamp('cora_last_synced_at')->nullable()->after('cora_payload');
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropColumn([
                'cora_charge_id',
                'cora_status',
                'cora_payment_url',
                'cora_pix_copy_paste',
                'cora_payload',
                'cora_last_synced_at',
            ]);
        });
    }
};
