<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_types', function (Blueprint $table) {
            $table->unsignedSmallInteger('sort_order')->default(0)->after('label');
            $table->boolean('is_active')->default(true)->after('sort_order');
        });

        $order = 0;
        foreach (['enem', 'vestibular', 'fuvest', 'concurso', 'custom', 'presencial'] as $slug) {
            if (DB::table('exam_types')->where('slug', $slug)->exists()) {
                DB::table('exam_types')->where('slug', $slug)->update([
                    'sort_order' => $order,
                    'is_active'  => true,
                    'updated_at' => now(),
                ]);
                $order++;
            }
        }
    }

    public function down(): void
    {
        Schema::table('exam_types', function (Blueprint $table) {
            $table->dropColumn(['sort_order', 'is_active']);
        });
    }
};
