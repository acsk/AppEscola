<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('enrollment_school_classes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('enrollment_id')->constrained('enrollments')->cascadeOnDelete();
            $table->foreignId('school_class_id')->constrained('school_classes')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['enrollment_id', 'school_class_id'], 'uq_enrollment_school_class');
            $table->index('school_class_id', 'enrollment_school_classes_class_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enrollment_school_classes');
    }
};
