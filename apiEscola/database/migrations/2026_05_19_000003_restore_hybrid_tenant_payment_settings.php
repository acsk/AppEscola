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

                if ($row->key === 'default_method' && $value === 'bank_slip') {
                    $value = 'hybrid';
                }

                if ($row->key === 'enabled_methods' && is_array($value)) {
                    $hadBankSlip = in_array('bank_slip', $value, true);
                    $value = array_values(array_unique(array_map(
                        static fn ($method): string => (string) $method === 'bank_slip' ? 'boleto' : (string) $method,
                        $value
                    )));
                    if ($hadBankSlip && ! in_array('hybrid', $value, true)) {
                        $value[] = 'hybrid';
                    }
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

                if ($row->key === 'default_method' && $value === 'hybrid') {
                    $value = 'bank_slip';
                }

                if ($row->key === 'enabled_methods' && is_array($value)) {
                    $value = array_values(array_unique(array_map(
                        static fn ($method): string => (string) $method === 'hybrid' ? 'bank_slip' : (string) $method,
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
};
