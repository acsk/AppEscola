<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_gateway_customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 32)->default('asaas');
            $table->string('payer_type', 32);
            $table->unsignedBigInteger('payer_id');
            $table->string('external_customer_id', 64);
            $table->json('raw_response')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'provider', 'payer_type', 'payer_id'], 'pgw_customer_unique');
            $table->index(['tenant_id', 'provider', 'external_customer_id'], 'pgw_customer_external_idx');
        });

        Schema::create('payment_webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 32)->default('asaas');
            $table->string('idempotency_key', 128)->unique();
            $table->string('event_type', 64);
            $table->string('external_payment_id', 64)->nullable()->index();
            $table->foreignId('invoice_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 24)->default('pending');
            $table->json('payload');
            $table->text('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['provider', 'status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_webhook_events');
        Schema::dropIfExists('payment_gateway_customers');
    }
};
