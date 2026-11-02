<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fatos do BI: a 1ª tentativa de cada resposta já resolvida (simulados online + banco de questões),
 * para as telas não recalcularem a regra sobre toda a história a cada acesso.
 * É derivada: pode ser apagada e regerada com `php artisan bi:refresh-facts --full`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bi_answer_facts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('source', 10); // online | practice
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            // 0 no banco; id do simulado no online (a mesma questão pode cair em simulados diferentes).
            $table->unsignedBigInteger('exam_key')->default(0);
            $table->unsignedBigInteger('exam_id')->nullable();
            $table->unsignedBigInteger('attempt_id')->nullable();
            $table->unsignedBigInteger('question_id');
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->unsignedBigInteger('exam_type_id')->nullable();
            $table->unsignedBigInteger('option_id')->nullable();
            $table->boolean('is_correct');
            $table->timestamp('answered_at');

            // Nenhum índice secundário começa por tenant_id (nem por disciplina): com eles o MySQL preferia buscar
            // linha a linha em vez da leitura contínua pela chave primária. Unicidade garantida pela regeração.
            $table->index(['student_id', 'answered_at'], 'bi_answer_facts_student_idx');
        });

        // As telas leem "tenant X, origem Z, período Y": com a chave primária nessa ordem o InnoDB guarda as linhas
        // juntas e o recorte vira leitura contínua (medido em 1,6 mi linhas: 17 s → 0,65 s na contagem do período).
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE bi_answer_facts ADD INDEX bi_answer_facts_id_idx (id), DROP PRIMARY KEY, ADD PRIMARY KEY (tenant_id, source, answered_at, id)');
        } else {
            Schema::table('bi_answer_facts', fn (Blueprint $table) => $table->index(['tenant_id', 'source', 'answered_at'], 'bi_answer_facts_period_idx'));
        }

        Schema::create('bi_fact_refreshes', function (Blueprint $table) {
            $table->foreignId('tenant_id')->primary()->constrained()->cascadeOnDelete();
            $table->timestamp('refreshed_at')->nullable();
            $table->timestamp('full_refreshed_at')->nullable();
            $table->unsignedInteger('last_students')->default(0);
            $table->unsignedInteger('last_rows')->default(0);
            $table->unsignedInteger('last_ms')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bi_fact_refreshes');
        Schema::dropIfExists('bi_answer_facts');
    }
};
