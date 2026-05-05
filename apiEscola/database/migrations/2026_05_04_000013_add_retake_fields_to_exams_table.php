<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            // false = simulado não pode ser refeito após entregue (padrão)
            // true  = admin habilitou retentativa até atingir a nota mínima
            $table->boolean('allow_retake')->default(false)->after('ends_at');

            // Máximo de tentativas permitidas (null = ilimitado, apenas quando allow_retake = true)
            $table->unsignedTinyInteger('max_attempts')->nullable()->after('allow_retake');

            // Nota mínima para poder refazer (0-100). Enquanto score < min_score_to_retake, pode refazer.
            // null = usa o passing_score do simulado como referência
            $table->decimal('min_score_to_retake', 5, 2)->nullable()->after('max_attempts');
        });
    }

    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->dropColumn(['allow_retake', 'max_attempts', 'min_score_to_retake']);
        });
    }
};
