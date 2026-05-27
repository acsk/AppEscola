<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ExamTypeSeeder extends Seeder
{
    /**
     * Classificações de prova/simulado (catálogo global — super admin).
     *
     * @return list<array{slug: string, label: string}>
     */
    public static function catalog(): array
    {
        return [
            ['slug' => 'enem', 'label' => 'ENEM'],
            ['slug' => 'sisu', 'label' => 'SISU'],
            ['slug' => 'prouni', 'label' => 'PROUNI'],
            ['slug' => 'fies', 'label' => 'FIES'],
            ['slug' => 'vestibular-tradicional', 'label' => 'Vestibular Tradicional'],
            ['slug' => 'vestibular-seriado', 'label' => 'Vestibular Seriado'],
            ['slug' => 'vestibular-agendado', 'label' => 'Vestibular Agendado'],
            ['slug' => 'vestibular-ead', 'label' => 'Vestibular EAD'],
            ['slug' => 'vestibular-medicina', 'label' => 'Vestibular de Medicina'],
            ['slug' => 'ifal', 'label' => 'IFAL'],
            ['slug' => 'ifpe', 'label' => 'IFPE'],
            ['slug' => 'ifrn', 'label' => 'IFRN'],
            ['slug' => 'ifpb', 'label' => 'IFPB'],
            ['slug' => 'ifba', 'label' => 'IFBA'],
            ['slug' => 'ifce', 'label' => 'IFCE'],
            ['slug' => 'if-sertao-pe', 'label' => 'IF Sertão-PE'],
            ['slug' => 'cpm', 'label' => 'CPM (Colégio da Polícia Militar)'],
            ['slug' => 'colegio-militar', 'label' => 'Colégio Militar'],
            ['slug' => 'etec-escolas-tecnicas', 'label' => 'ETEC/Escolas Técnicas'],
            ['slug' => 'concurso-prefeitura', 'label' => 'Concurso Prefeitura'],
            ['slug' => 'concurso-camara-municipal', 'label' => 'Concurso Câmara Municipal'],
            ['slug' => 'concurso-estadual', 'label' => 'Concurso Estadual'],
            ['slug' => 'concurso-federal', 'label' => 'Concurso Federal'],
            ['slug' => 'pm-policia-militar', 'label' => 'PM (Polícia Militar)'],
            ['slug' => 'bombeiros', 'label' => 'Bombeiros'],
            ['slug' => 'pc-policia-civil', 'label' => 'PC (Polícia Civil)'],
            ['slug' => 'prf', 'label' => 'PRF'],
            ['slug' => 'pf', 'label' => 'PF'],
            ['slug' => 'guarda-municipal', 'label' => 'Guarda Municipal'],
            ['slug' => 'banco-do-brasil', 'label' => 'Banco do Brasil'],
            ['slug' => 'caixa-economica', 'label' => 'Caixa Econômica'],
            ['slug' => 'banco-do-nordeste', 'label' => 'Banco do Nordeste'],
            ['slug' => 'correios', 'label' => 'Correios'],
            ['slug' => 'inss', 'label' => 'INSS'],
            ['slug' => 'receita-federal', 'label' => 'Receita Federal'],
            ['slug' => 'tribunal-de-justica', 'label' => 'Tribunal de Justiça'],
            ['slug' => 'ministerio-publico', 'label' => 'Ministério Público'],
            ['slug' => 'defensoria-publica', 'label' => 'Defensoria Pública'],
            ['slug' => 'esa', 'label' => 'ESA'],
            ['slug' => 'espcex', 'label' => 'EsPCEx'],
            ['slug' => 'epcar', 'label' => 'EPCAR'],
            ['slug' => 'marinha', 'label' => 'Marinha'],
            ['slug' => 'aeronautica', 'label' => 'Aeronáutica'],
            ['slug' => 'exercito', 'label' => 'Exército'],
            ['slug' => 'residencia-medica', 'label' => 'Residência Médica'],
            ['slug' => 'residencia-multiprofissional', 'label' => 'Residência Multiprofissional'],
            ['slug' => 'concurso-professor', 'label' => 'Concurso Professor'],
            ['slug' => 'concurso-saude', 'label' => 'Concurso Saúde'],
            ['slug' => 'concurso-administrativo', 'label' => 'Concurso Administrativo'],
            ['slug' => 'concurso-ti', 'label' => 'Concurso TI'],
            ['slug' => 'concurso-fiscal', 'label' => 'Concurso Fiscal'],
            ['slug' => 'concurso-juridico', 'label' => 'Concurso Jurídico'],
            ['slug' => 'concurso-legislativo', 'label' => 'Concurso Legislativo'],
            ['slug' => 'concurso-universidades-federais', 'label' => 'Concurso Universidades Federais'],
            ['slug' => 'concurso-institutos-federais', 'label' => 'Concurso Institutos Federais'],
        ];
    }

    /**
     * Tipos legados mantidos para registros antigos (não aparecem em novos cadastros).
     *
     * @return list<array{slug: string, label: string}>
     */
    public static function legacyCatalog(): array
    {
        return [
            ['slug' => 'vestibular', 'label' => 'Vestibular'],
            ['slug' => 'fuvest', 'label' => 'FUVEST'],
            ['slug' => 'concurso', 'label' => 'Concurso'],
        ];
    }

    /**
     * Tipos de uso interno do sistema.
     *
     * @return list<array{slug: string, label: string}>
     */
    public static function systemCatalog(): array
    {
        return [
            ['slug' => 'presencial', 'label' => 'Presencial'],
            ['slug' => 'custom', 'label' => 'Personalizado'],
        ];
    }

    public function run(): void
    {
        $now = now();
        $sortOrder = 0;

        foreach (self::catalog() as $type) {
            $this->upsertType($type['slug'], $type['label'], $sortOrder++, true, $now);
        }

        foreach (self::systemCatalog() as $type) {
            $this->upsertType($type['slug'], $type['label'], $sortOrder++, true, $now);
        }

        foreach (self::legacyCatalog() as $type) {
            $this->upsertType($type['slug'], $type['label'], $sortOrder++, false, $now);
        }
    }

    private function upsertType(string $slug, string $label, int $sortOrder, bool $isActive, $now): void
    {
        $exists = DB::table('exam_types')->where('slug', $slug)->exists();

        if ($exists) {
            DB::table('exam_types')->where('slug', $slug)->update([
                'label'      => $label,
                'sort_order' => $sortOrder,
                'is_active'  => $isActive,
                'updated_at' => $now,
            ]);

            return;
        }

        DB::table('exam_types')->insert([
            'slug'       => $slug,
            'label'      => $label,
            'sort_order' => $sortOrder,
            'is_active'  => $isActive,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
