<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SubjectTopicRequest;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Services\ExamAccessService;
use App\Services\QuestionBankQueryService;
use App\Services\QuestionTaxonomyImporter;
use App\Services\SubjectTopicService;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;

/** Assuntos de disciplina do banco de questões. */
class SubjectTopicController extends Controller
{
    use ScopedByTenant;

    public function __construct(
        private readonly ExamAccessService $examAccess,
        private readonly SubjectTopicService $topics,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $subjectIds = QuestionBankQueryService::idList($request->query('subject_id', []));
        $items = $this->topics->list($tenantId, $subjectIds ?: null, $request->query('search'));

        return $this->success($items->map(fn ($topic) => $this->present($topic))->values());
    }

    public function subjects(Request $request): JsonResponse
    {
        return $this->success($this->topics->subjectsWithCounts($this->authorizeStaff($request)));
    }

    /** GET /question-bank/taxonomy — disciplinas ativas com os assuntos aninhados. */
    public function taxonomy(Request $request): JsonResponse
    {
        return $this->success($this->topics->taxonomy($this->authorizeStaff($request)));
    }

    /**
     * POST /question-bank/taxonomy/import-default — importa a taxonomia padrão (disciplinas, assuntos e bancas).
     * Idempotente: só cria o que falta. Restrito a admin/super admin.
     */
    public function importDefault(Request $request, QuestionTaxonomyImporter $importer): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        if (! $this->isAdmin($request)) {
            return $this->forbidden('Apenas administradores podem importar a taxonomia padrão.');
        }

        $report = $importer->import($tenantId, $importer->defaultData(), $request->boolean('dry_run'));
        $created = $report['subjects_created'] + $report['topics_created'] + $report['boards_created'];

        return $this->success($report, $request->boolean('dry_run')
            ? 'Simulação concluída.'
            : ($created > 0
                ? "Taxonomia importada: {$report['subjects_created']} disciplina(s), {$report['topics_created']} assunto(s) e {$report['boards_created']} banca(s) criados."
                : 'A taxonomia padrão já estava completa. Nada foi criado.'));
    }

    /**
     * GET /question-bank/subjects/{subject}/default-topics — disciplinas padrão (com assuntos) para importar
     * na disciplina da escola, com a sugestão pelo nome ("PORTUGUÊS CPM" → Língua Portuguesa).
     */
    public function defaultTopics(Request $request, int $subject, QuestionTaxonomyImporter $importer): JsonResponse
    {
        $target = $this->subject($request, $subject);
        $data = $importer->defaultData();

        return $this->success([
            'suggested' => $importer->suggestSource($data, $target->name),
            'subjects'  => $importer->defaultSubjects($data),
        ]);
    }

    /** POST /question-bank/subjects/{subject}/topics/import-default — cria na disciplina os assuntos padrão que faltam. */
    public function importDefaultTopics(Request $request, int $subject, QuestionTaxonomyImporter $importer): JsonResponse
    {
        $target = $this->subject($request, $subject);
        if (! $this->isAdmin($request)) {
            return $this->forbidden('Apenas administradores podem importar assuntos padrão.');
        }
        $data = $request->validate(['source' => ['required', 'string', 'max:150']]);

        try {
            $report = $importer->importTopics($target, $importer->defaultData(), $data['source']);
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), null, 422);
        }

        return $this->success($report, $report['topics_created'] > 0
            ? "{$report['topics_created']} assunto(s) importado(s) para {$target->name}."
            : "{$target->name} já tinha todos os assuntos padrão. Nada foi criado.");
    }

    public function store(SubjectTopicRequest $request): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $topic = $this->topics->create($tenantId, $request->validated());

        return $this->created($this->present($topic), 'Assunto criado com sucesso.');
    }

    public function update(SubjectTopicRequest $request, int $id): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $topic = $this->topics->update($tenantId, $id, $request->validated());

        return $this->success($this->present($topic), 'Assunto atualizado com sucesso.');
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $tenantId = $this->authorizeStaff($request);
        $this->topics->delete($tenantId, $id);

        return $this->deleted('Assunto removido com sucesso.');
    }

    private function authorizeStaff(Request $request): int
    {
        $this->examAccess->assertCanManageExams($request->user());

        return $this->requireTenantId($request);
    }

    private function isAdmin(Request $request): bool
    {
        return in_array($request->user()->role, ['admin', 'super_admin'], true);
    }

    private function subject(Request $request, int $id): Subject
    {
        return Subject::query()->where('tenant_id', $this->authorizeStaff($request))->findOrFail($id);
    }

    private function present(SubjectTopic $topic): array
    {
        return [
            'id'              => $topic->id,
            'subject_id'      => $topic->subject_id,
            'name'            => $topic->name,
            'description'     => $topic->description,
            'questions_count' => (int) ($topic->questions_count ?? 0),
        ];
    }
}
