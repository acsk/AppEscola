<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const BACKUP_TABLE = 'calendar_events_invoice_backup';

    public function up(): void
    {
        if (! Schema::hasTable('calendar_events')) {
            return;
        }

        $this->ensureBackupTableExists();

        $rows = DB::table('calendar_events')
            ->where('source_type', 'invoice')
            ->orderBy('id')
            ->get();

        if ($rows->isNotEmpty()) {
            $this->storeBackupRows($rows);
        }

        DB::table('calendar_events')
            ->where('source_type', 'invoice')
            ->delete();
    }

    public function down(): void
    {
        if (! Schema::hasTable('calendar_events') || ! Schema::hasTable(self::BACKUP_TABLE)) {
            return;
        }

        DB::table(self::BACKUP_TABLE)
            ->orderBy('id')
            ->chunkById(200, function (Collection $rows): void {
                foreach ($rows as $row) {
                    $data = (array) $row;

                    $alreadyRestored = $this->invoiceCalendarEventExists($data['source_id'] ?? null);

                    if ($alreadyRestored) {
                        continue;
                    }

                    if (DB::table('calendar_events')->where('id', $data['id'])->exists()) {
                        // ID ocupado por outro registro: não inserir com ID novo (evita duplicata lógica).
                        continue;
                    }

                    DB::table('calendar_events')->insert($data);
                }
            });

        Schema::dropIfExists(self::BACKUP_TABLE);
    }

    private function ensureBackupTableExists(): void
    {
        if (Schema::hasTable(self::BACKUP_TABLE)) {
            return;
        }

        Schema::create(self::BACKUP_TABLE, function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedBigInteger('tenant_id');
            $table->string('source_type', 30)->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('type', 50);
            $table->string('title');
            $table->text('description')->nullable();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->boolean('all_day')->default(false);
            $table->unsignedBigInteger('course_id')->nullable();
            $table->unsignedBigInteger('school_class_id')->nullable();
            $table->unsignedBigInteger('student_id')->nullable();
            $table->string('location')->nullable();
            $table->string('audience_type', 30);
            $table->json('audience_params')->nullable();
            $table->boolean('is_published')->default(true);
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();
            $table->timestamps();
        });
    }

    private function invoiceCalendarEventExists(mixed $sourceId): bool
    {
        $query = DB::table('calendar_events')->where('source_type', 'invoice');

        if ($sourceId === null) {
            $query->whereNull('source_id');
        } else {
            $query->where('source_id', $sourceId);
        }

        return $query->exists();
    }

    private function storeBackupRows(Collection $rows): void
    {
        $existingIds = DB::table(self::BACKUP_TABLE)->pluck('id')->all();

        $rows
            ->reject(fn ($row) => in_array((int) $row->id, $existingIds, true))
            ->map(fn ($row) => (array) $row)
            ->chunk(100)
            ->each(function (Collection $chunk): void {
                DB::table(self::BACKUP_TABLE)->insert($chunk->all());
            });
    }
};
