<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->unsignedBigInteger('desired_course_id')
                ->nullable()
                ->after('status')
                ->comment('Curso desejado informado no cadastro público (pré-matrícula)');

            $table->foreign('desired_course_id')
                ->references('id')
                ->on('courses')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('students', function (Blueprint $table) {
            $table->dropForeign(['desired_course_id']);
            $table->dropColumn('desired_course_id');
        });
    }
};
