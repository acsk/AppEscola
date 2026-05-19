<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('tenant_settings')) {
            return;
        }

        DB::table('tenant_settings')
            ->where('module', 'payment')
            ->whereIn('key', ['enabled_methods', 'default_method'])
            ->orderBy('id')
            ->each(function ($row): void {
                $decoded = json_decode((string) $row->value, true);
                if (! is_array($decoded) || ! array_key_exists('v', $decoded)) {
                    return;
                }

                $value = $decoded['v'];

                if ($row->key === 'default_method' && in_array($value, ['boleto', 'hybrid'], true)) {
                    $value = 'bank_slip';
                }

                if ($row->key === 'enabled_methods' && is_array($value)) {
                    $value = array_values(array_unique(array_map(
                        static fn ($method): string => in_array((string) $method, ['boleto', 'hybrid'], true)
                            ? 'bank_slip'
                            : (string) $method,
                        $value
                    )));
                }

                DB::table('tenant_settings')
                    ->where('id', $row->id)
                    ->update([
                        'value' => json_encode(['v' => $value], JSON_UNESCAPED_UNICODE),
                        'updated_at' => now(),
                    ]);
            });
    }

    public function down(): void
    {
        // Sem rollback: o contrato oficial de settings usa bank_slip.
    }
};
