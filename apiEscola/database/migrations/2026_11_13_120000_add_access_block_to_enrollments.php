<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->timestamp('blocked_at')->nullable()->after('status');
            $table->string('blocked_reason', 255)->nullable()->after('blocked_at');
            $table->foreignId('blocked_by')->nullable()->after('blocked_reason')->constrained('users')->nullOnDelete();
            $table->index(['student_id', 'blocked_at']);
        });
    }

    public function down(): void
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->dropIndex(['student_id', 'blocked_at']);
            $table->dropConstrainedForeignId('blocked_by');
            $table->dropColumn(['blocked_at', 'blocked_reason']);
        });
    }
};
