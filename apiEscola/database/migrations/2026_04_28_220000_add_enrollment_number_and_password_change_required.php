<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->string('enrollment_number', 20)->nullable()->unique()->after('user_id');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->boolean('password_change_required')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->dropColumn('enrollment_number');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('password_change_required');
        });
    }
};
