<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->string('name'); // "Plano Mensal", "Plano Anual", etc.
            $table->string('billing_cycle'); // monthly, bimonthly, quadrimestral, semiannual, annual
            $table->decimal('price', 10, 2); // valor cobrado por ciclo
            $table->string('status')->default('active');
            $table->foreign('status')->references('slug')->on('domain_statuses');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_plans');
    }
};
