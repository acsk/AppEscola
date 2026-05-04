<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_types', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('label', 100);
            $table->timestamps();
        });

        DB::table('exam_types')->insert([
            ['slug' => 'custom',     'label' => 'Personalizado', 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'enem',       'label' => 'ENEM',          'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'vestibular', 'label' => 'Vestibular',    'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'fuvest',     'label' => 'FUVEST',        'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'concurso',   'label' => 'Concurso',      'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_types');
    }
};
