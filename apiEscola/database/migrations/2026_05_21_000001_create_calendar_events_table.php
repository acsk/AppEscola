<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendar_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('source_type', 30)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('type', 50);
            $table->string('title');
            $table->text('description')->nullable();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->boolean('all_day')->default(false);
            $table->foreignId('course_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('school_class_id')->nullable()->constrained()->nullOnDelete();
            $table->string('location')->nullable();
            $table->string('audience_type', 30)->default('course');
            $table->json('audience_params')->nullable();
            $table->boolean('is_published')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['source_type', 'source_id']);
            $table->index(['tenant_id', 'starts_at']);
            $table->index(['tenant_id', 'course_id', 'starts_at']);
        });

        if (Schema::hasTable('exam_types') && ! DB::table('exam_types')->where('slug', 'presencial')->exists()) {
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
        Schema::dropIfExists('calendar_events');

        if (Schema::hasTable('exam_types')) {
            DB::table('exam_types')->where('slug', 'presencial')->delete();
        }
    }
};
