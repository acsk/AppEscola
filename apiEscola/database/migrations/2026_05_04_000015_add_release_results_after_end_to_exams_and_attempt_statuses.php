<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->boolean('release_results_after_end')->default(false)->after('ends_at');
        });

        DB::table('exam_attempt_statuses')->insert([
            'slug' => 'awaiting_release',
            'label' => 'Aguardando liberação',
            'order' => 3,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('exam_attempt_statuses')
            ->where('slug', 'completed')
            ->update(['order' => 4, 'updated_at' => now()]);

        DB::table('exam_attempt_statuses')
            ->where('slug', 'abandoned')
            ->update(['order' => 5, 'updated_at' => now()]);
    }

    public function down(): void
    {
        $completedId = DB::table('exam_attempt_statuses')->where('slug', 'completed')->value('id');
        $awaitingReleaseId = DB::table('exam_attempt_statuses')->where('slug', 'awaiting_release')->value('id');

        if ($completedId && $awaitingReleaseId) {
            DB::table('exam_attempts')
                ->where('attempt_status_id', $awaitingReleaseId)
                ->update(['attempt_status_id' => $completedId]);
        }

        DB::table('exam_attempt_statuses')->where('slug', 'awaiting_release')->delete();

        DB::table('exam_attempt_statuses')
            ->where('slug', 'completed')
            ->update(['order' => 3, 'updated_at' => now()]);

        DB::table('exam_attempt_statuses')
            ->where('slug', 'abandoned')
            ->update(['order' => 4, 'updated_at' => now()]);

        Schema::table('exams', function (Blueprint $table) {
            $table->dropColumn('release_results_after_end');
        });
    }
};