<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_providers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name'); // ex: "Banco do Brasil", "PIX InstantPay", "Dinheiro"
            $table->string('slug')->unique(); // ex: "banco_brasil", "pix_instantpay", "cash"
            $table->text('description')->nullable();
            $table->string('logo_url')->nullable(); // URL da logo/ícone do banco
            $table->boolean('is_active')->default(true);
            $table->integer('order')->default(0); // Para ordenação na UI
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_providers');
    }
};
