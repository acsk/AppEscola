<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('official_assessment_subject', function (Blueprint $table) {
            $table->id();
            $table->foreignId('official_assessment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['official_assessment_id', 'subject_id'], 'official_assessment_subject_unique');
        });

        DB::table('official_assessment_subject')->insertUsing(
            ['official_assessment_id', 'subject_id', 'created_at', 'updated_at'],
            DB::table('official_assessments')
                ->whereNotNull('subject_id')
                ->select([
                    'id as official_assessment_id',
                    'subject_id',
                    DB::raw('CURRENT_TIMESTAMP as created_at'),
                    DB::raw('CURRENT_TIMESTAMP as updated_at'),
                ])
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('official_assessment_subject');
    }
};
