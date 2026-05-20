<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notification_broadcasts', function (Blueprint $table) {
            $table->boolean('show_on_calendar')->default(false)->after('data');
            $table->dateTime('starts_at')->nullable()->after('show_on_calendar');
            $table->dateTime('ends_at')->nullable()->after('starts_at');
        });
    }

    public function down(): void
    {
        Schema::table('notification_broadcasts', function (Blueprint $table) {
            $table->dropColumn(['show_on_calendar', 'starts_at', 'ends_at']);
        });
    }
};
