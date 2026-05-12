<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_cora_credentials', function (Blueprint $table) {
            $table->string('test_account_main_cpf')->nullable()->after('private_key_path');
            $table->string('test_account_main_password')->nullable()->after('test_account_main_cpf');
            $table->string('test_account_secondary_cpf')->nullable()->after('test_account_main_password');
            $table->string('test_account_secondary_password')->nullable()->after('test_account_secondary_cpf');
        });
    }

    public function down(): void
    {
        Schema::table('tenant_cora_credentials', function (Blueprint $table) {
            $table->dropColumn([
                'test_account_main_cpf',
                'test_account_main_password',
                'test_account_secondary_cpf',
                'test_account_secondary_password',
            ]);
        });
    }
};
