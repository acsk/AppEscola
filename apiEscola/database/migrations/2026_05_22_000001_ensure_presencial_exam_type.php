<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('exam_types')) {
            return;
        }

        if (! DB::table('exam_types')->where('slug', 'presencial')->exists()) {
            DB::table('exam_types')->insert([
                'slug'       => 'presencial',
                'label'      => 'Presencial',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('exam_types')) {
            return;
        }

        DB::table('exam_types')->where('slug', 'presencial')->delete();
    }
};
