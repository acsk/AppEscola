<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('enrollment_school_classes')) {
            return;
        }

        $rows = DB::table('enrollments')
            ->whereNotNull('bundle_id')
            ->whereNotNull('school_class_id')
            ->whereNull('deleted_at')
            ->select(['id', 'school_class_id'])
            ->get();

        $now = now();

        foreach ($rows as $row) {
            DB::table('enrollment_school_classes')->insertOrIgnore([
                'enrollment_id' => $row->id,
                'school_class_id' => $row->school_class_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Dados derivados; não remove linhas no rollback.
    }
};
