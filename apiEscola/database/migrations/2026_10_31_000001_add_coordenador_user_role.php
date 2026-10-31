<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Papel de coordenação pedagógica (Inteligência Educacional). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('domain_user_roles')) {
            return;
        }

        DB::table('domain_user_roles')->insertOrIgnore([
            'slug' => 'coordenador',
            'name' => 'Coordenação',
        ]);
    }

    public function down(): void
    {
        if (! Schema::hasTable('domain_user_roles')) {
            return;
        }

        // users.role tem FK para o slug: só remove se ninguém usa o papel.
        if (DB::table('users')->where('role', 'coordenador')->exists()) {
            return;
        }

        DB::table('domain_user_roles')->where('slug', 'coordenador')->delete();
    }
};
