<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('course_bundles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 10, 2);
            $table->string('status')->default('active');
            $table->foreign('status')->references('slug')->on('domain_statuses');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('course_bundle_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bundle_id')->constrained('course_bundles')->cascadeOnDelete();
            $table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['bundle_id', 'course_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('course_bundle_items');
        Schema::dropIfExists('course_bundles');
    }
};
