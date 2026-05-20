<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exam_attempt_statuses', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 50)->unique();
            $table->string('label', 100);
            $table->unsignedTinyInteger('order')->default(0);
            $table->timestamps();
        });

        DB::table('exam_attempt_statuses')->insert([
            ['slug' => 'in_progress', 'label' => 'Em andamento', 'order' => 1, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'pending_review', 'label' => 'Aguardando correção', 'order' => 2, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'completed', 'label' => 'Concluído', 'order' => 3, 'created_at' => now(), 'updated_at' => now()],
            ['slug' => 'abandoned', 'label' => 'Abandonado', 'order' => 4, 'created_at' => now(), 'updated_at' => now()],
        ]);

        Schema::table('exam_attempts', function (Blueprint $table) {
            $table->unsignedBigInteger('attempt_status_id')->nullable()->after('percentage');
            $table->foreign('attempt_status_id')->references('id')->on('exam_attempt_statuses')->restrictOnDelete();
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('
                UPDATE exam_attempts ea
                JOIN exam_attempt_statuses eas ON eas.slug = ea.status
                SET ea.attempt_status_id = eas.id
                WHERE ea.attempt_status_id IS NULL
            ');
        } else {
            DB::statement('
                UPDATE exam_attempts
                SET attempt_status_id = (
                    SELECT id FROM exam_attempt_statuses WHERE slug = exam_attempts.status
                )
                WHERE attempt_status_id IS NULL AND status IS NOT NULL
            ');
        }

        DB::statement("
            UPDATE exam_attempts
            SET attempt_status_id = (SELECT id FROM exam_attempt_statuses WHERE slug = 'in_progress')
            WHERE attempt_status_id IS NULL
        ");

        Schema::table('exam_attempts', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }

    public function down(): void
    {
        Schema::table('exam_attempts', function (Blueprint $table) {
            $table->string('status')->default('in_progress')->after('percentage');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('
                UPDATE exam_attempts ea
                JOIN exam_attempt_statuses eas ON eas.id = ea.attempt_status_id
                SET ea.status = eas.slug
            ');
        } else {
            DB::statement('
                UPDATE exam_attempts
                SET status = (
                    SELECT slug FROM exam_attempt_statuses WHERE id = exam_attempts.attempt_status_id
                )
                WHERE attempt_status_id IS NOT NULL
            ');
        }

        Schema::table('exam_attempts', function (Blueprint $table) {
            $table->dropForeign(['attempt_status_id']);
            $table->dropColumn('attempt_status_id');
        });

        Schema::dropIfExists('exam_attempt_statuses');
    }
};
