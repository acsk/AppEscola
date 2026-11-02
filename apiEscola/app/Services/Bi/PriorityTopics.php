<?php

namespace App\Services\Bi;

use Illuminate\Support\Facades\DB;

/** Assuntos prioritários por concurso (bi_priority_topics), com peso de 1 a 5. */
class PriorityTopics
{
    public const MAX_WEIGHT = 5;

    /**
     * Disciplinas e assuntos do tenant com o peso no concurso (0 = não prioritário) e os cursos que o têm como alvo.
     *
     * @return array<string, mixed>
     */
    public function forExamType(int $tenantId, int $examTypeId): array
    {
        $weights = DB::table('bi_priority_topics')
            ->where('tenant_id', $tenantId)
            ->where('exam_type_id', $examTypeId)
            ->pluck('weight', 'subject_topic_id');

        $topics = DB::table('subject_topics as st')
            ->join('subjects as s', 's.id', '=', 'st.subject_id')
            ->where('st.tenant_id', $tenantId)
            ->whereNull('s.deleted_at')
            ->orderBy('s.name')
            ->orderBy('st.name')
            ->get(['st.id', 'st.name', 's.id as subject_id', 's.name as subject']);

        return [
            'exam_type_id' => $examTypeId,
            'configured' => $weights->isNotEmpty(),
            'courses' => DB::table('courses')
                ->where('tenant_id', $tenantId)
                ->where('target_exam_type_id', $examTypeId)
                ->whereNull('deleted_at')
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn ($c) => ['id' => (int) $c->id, 'name' => $c->name])
                ->all(),
            'subjects' => $topics->groupBy('subject_id')->map(fn ($list) => [
                'subject_id' => (int) $list->first()->subject_id,
                'name' => $list->first()->subject,
                'topics' => $list->map(fn ($t) => [
                    'topic_id' => (int) $t->id,
                    'name' => $t->name,
                    'weight' => (int) ($weights[$t->id] ?? 0),
                ])->values()->all(),
            ])->values()->all(),
        ];
    }

    /**
     * Substitui os prioritários do concurso. Peso 0 remove.
     *
     * @param  array<int, int>  $weights  subject_topic_id => peso
     */
    public function save(int $tenantId, int $examTypeId, array $weights): void
    {
        DB::transaction(function () use ($tenantId, $examTypeId, $weights) {
            DB::table('bi_priority_topics')->where('tenant_id', $tenantId)->where('exam_type_id', $examTypeId)->delete();
            $now = now();
            $rows = collect($weights)
                ->filter(fn ($w) => $w > 0)
                ->map(fn ($w, $topicId) => [
                    'tenant_id' => $tenantId,
                    'exam_type_id' => $examTypeId,
                    'subject_topic_id' => (int) $topicId,
                    'weight' => min(self::MAX_WEIGHT, (int) $w),
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
                ->values()
                ->all();
            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('bi_priority_topics')->insert($chunk);
            }
        });
    }

    /**
     * Pesos usados pelo índice de Preparação. Sem cadastro para o concurso, todos os assuntos das
     * disciplinas informadas valem 1 e `provisional` = true.
     *
     * @param  list<int>  $fallbackSubjectIds
     * @return array{weights: array<int, int>, provisional: bool}
     */
    public function resolve(int $tenantId, ?int $examTypeId, array $fallbackSubjectIds): array
    {
        $weights = $examTypeId === null ? collect() : DB::table('bi_priority_topics')
            ->where('tenant_id', $tenantId)
            ->where('exam_type_id', $examTypeId)
            ->pluck('weight', 'subject_topic_id');

        if ($weights->isNotEmpty()) {
            return ['weights' => $weights->map(fn ($w) => (int) $w)->all(), 'provisional' => false];
        }

        return [
            'weights' => DB::table('subject_topics')
                ->where('tenant_id', $tenantId)
                ->whereIn('subject_id', $fallbackSubjectIds ?: [0])
                ->pluck('id')
                ->mapWithKeys(fn ($id) => [(int) $id => 1])
                ->all(),
            'provisional' => true,
        ];
    }
}
