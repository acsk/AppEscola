<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Só altera o ENUM quando a coluna já existe (criada em migration anterior).
        if (Schema::hasTable('past_exams') && Schema::hasColumn('past_exams', 'material_kind')) {
            DB::statement(
                "ALTER TABLE past_exams MODIFY COLUMN material_kind ENUM('prova', 'exercicio', 'material') NOT NULL DEFAULT 'prova'"
            );
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('past_exams') && Schema::hasColumn('past_exams', 'material_kind')) {
            DB::table('past_exams')
                ->where('material_kind', 'material')
                ->update(['material_kind' => 'exercicio']);

            DB::statement(
                "ALTER TABLE past_exams MODIFY COLUMN material_kind ENUM('prova', 'exercicio') NOT NULL DEFAULT 'prova'"
            );
        }
    }
};
