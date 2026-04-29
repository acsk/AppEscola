<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->unique(['tenant_id', 'email'],    'students_tenant_email_unique');
            $table->unique(['tenant_id', 'document'], 'students_tenant_document_unique');
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->dropUnique('students_tenant_email_unique');
            $table->dropUnique('students_tenant_document_unique');
        });
    }
};
