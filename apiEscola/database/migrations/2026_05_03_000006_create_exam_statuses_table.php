<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('label', 100);
            $table->unsignedTinyInteger('order')->default(0);
            $table->timestamps();
        });

        DB::table('exam_statuses')->insert([
            ['slug' => 'draft',     'label' => 'Rascunho',  'order' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'published', 'label' => 'Publicado', 'order' => 2, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'archived',  'label' => 'Arquivado', 'order' => 3, 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_statuses');
    }
};
