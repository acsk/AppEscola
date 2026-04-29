<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('school_classes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->string('name');
            $table->smallInteger('year')->nullable();
            $table->string('period')->nullable();
            $table->foreign('period')->references('slug')->on('domain_periods');
            $table->unsignedSmallInteger('capacity')->nullable();
            $table->string('status')->default('active');
            $table->foreign('status')->references('slug')->on('domain_statuses');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('school_classes');
    }
};
