<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('course_bundles', function (Blueprint $table) {
            $table->string('billing_cycle')->default('monthly')->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('course_bundles', function (Blueprint $table) {
            $table->dropColumn('billing_cycle');
        });
    }
};
