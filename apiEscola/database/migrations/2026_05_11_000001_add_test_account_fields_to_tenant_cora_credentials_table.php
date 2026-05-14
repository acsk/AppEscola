<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tenant_cora_credentials')) {
            return;
        }

        Schema::table('tenant_cora_credentials', function (Blueprint $table) {
            if (! Schema::hasColumn('tenant_cora_credentials', 'test_account_main_cpf')) {
                $table->string('test_account_main_cpf')->nullable()->after('private_key_path');
            }

            if (! Schema::hasColumn('tenant_cora_credentials', 'test_account_main_password')) {
                $table->string('test_account_main_password')->nullable()->after('test_account_main_cpf');
            }

            if (! Schema::hasColumn('tenant_cora_credentials', 'test_account_secondary_cpf')) {
                $table->string('test_account_secondary_cpf')->nullable()->after('test_account_main_password');
            }

            if (! Schema::hasColumn('tenant_cora_credentials', 'test_account_secondary_password')) {
                $table->string('test_account_secondary_password')->nullable()->after('test_account_secondary_cpf');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('tenant_cora_credentials')) {
            return;
        }

        Schema::table('tenant_cora_credentials', function (Blueprint $table) {
            $columns = array_values(array_filter([
                Schema::hasColumn('tenant_cora_credentials', 'test_account_main_cpf') ? 'test_account_main_cpf' : null,
                Schema::hasColumn('tenant_cora_credentials', 'test_account_main_password') ? 'test_account_main_password' : null,
                Schema::hasColumn('tenant_cora_credentials', 'test_account_secondary_cpf') ? 'test_account_secondary_cpf' : null,
                Schema::hasColumn('tenant_cora_credentials', 'test_account_secondary_password') ? 'test_account_secondary_password' : null,
            ]));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
