<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            $table->foreignId('student_id')
                ->nullable()
                ->after('school_class_id')
                ->constrained()
                ->nullOnDelete();

            $table->index(['tenant_id', 'student_id', 'starts_at']);
        });
    }

    public function down(): void
    {
        Schema::table('calendar_events', function (Blueprint $table) {
            $table->dropForeign(['student_id']);
            $table->dropIndex(['tenant_id', 'student_id', 'starts_at']);
            $table->dropColumn('student_id');
        });
    }
};
