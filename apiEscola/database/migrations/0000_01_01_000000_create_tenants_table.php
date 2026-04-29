<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('corporate_name');          // Razão Social
            $table->string('trade_name')->nullable();   // Nome Fantasia
            $table->string('name');                     // Nome de exibição (curto)
            $table->string('slug')->unique();
            $table->string('cnpj', 20)->nullable()->unique(); // CNPJ formatado
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('whatsapp')->nullable();
            $table->string('zip_code', 10)->nullable(); // CEP
            $table->string('street')->nullable();       // Logradouro
            $table->string('number', 20)->nullable();   // Número
            $table->string('complement')->nullable();   // Complemento
            $table->string('neighborhood')->nullable(); // Bairro
            $table->string('city')->nullable();         // Cidade
            $table->string('state', 2)->nullable();     // UF
            $table->string('status')->default('active');
            $table->foreign('status')->references('slug')->on('domain_statuses');
            $table->json('settings')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
