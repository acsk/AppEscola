<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('invoices')
            ->whereNull('type')
            ->orWhere('type', '')
            ->update(['type' => 'other']);

        DB::table('invoices')
            ->whereNotIn('type', function ($query) {
                $query->select('slug')->from('domain_invoice_types');
            })
            ->update(['type' => 'other']);

        Schema::table('invoices', function (Blueprint $table) {
            $table->foreign('type')
                ->references('slug')
                ->on('domain_invoice_types')
                ->restrictOnDelete()
                ->cascadeOnUpdate();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropForeign(['type']);
        });
    }
};