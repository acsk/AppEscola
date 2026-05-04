<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreExamQuestionRequest;
use App\Http\Requests\UpdateExamQuestionRequest;
use App\Http\Resources\ExamQuestionResource;
use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\ExamQuestionOption;
use App\Traits\ScopedByTenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExamQuestionController extends Controller
{
    use ScopedByTenant;

    /** Lista todas as questões de um simulado */
    public function index(Request $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $questions = $exam->questions()->with(['subject', 'options'])->get();

        return $this->success(ExamQuestionResource::collection($questions));
    }

    /** Adiciona uma questão ao simulado */
    public function store(StoreExamQuestionRequest $request, Exam $exam): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $tenantId = $this->getTenantId($request) ?? $exam->tenant_id;

        $question = DB::transaction(function () use ($request, $exam, $tenantId) {
            $nextOrder = $exam->questions()->max('order') + 1;

            $question = ExamQuestion::create([
                'tenant_id'         => $tenantId,
                'exam_id'           => $exam->id,
                'subject_id'        => $request->subject_id,
                'type'              => $request->type,
                'question_text'     => $request->question_text,
                'image_url'         => $request->image_url,
                'video_url'         => $request->video_url,
                'points'            => $request->points ?? 1.00,
                'order'             => $request->order ?? $nextOrder,
                'explanation'       => $request->explanation,
                'allow_text_answer' => $request->allow_text_answer ?? false,
            ]);

            if ($request->type === 'multiple_choice' && $request->options) {
                foreach ($request->options as $i => $opt) {
                    ExamQuestionOption::create([
                        'question_id'        => $question->id,
                        'option_text'        => $opt['option_text'],
                        'is_correct'         => $opt['is_correct'],
                        'order'              => $opt['order'] ?? ($i + 1),
                        'triggers_text_input' => $opt['triggers_text_input'] ?? false,
                    ]);
                }
            }

            return $question;
        });

        $question->load(['subject', 'options']);

        return $this->created(new ExamQuestionResource($question));
    }

    public function show(Request $request, Exam $exam, ExamQuestion $question): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $question->load(['subject', 'options']);

        return $this->success(new ExamQuestionResource($question));
    }

    /** Atualiza questão e recria as opções se enviadas */
    public function update(UpdateExamQuestionRequest $request, Exam $exam, ExamQuestion $question): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        DB::transaction(function () use ($request, $question) {
            $question->update($request->except('options'));

            if ($request->has('options') && $request->options !== null) {
                // Remove as antigas e recria
                $question->options()->delete();
                foreach ($request->options as $i => $opt) {
                    ExamQuestionOption::create([
                        'question_id'        => $question->id,
                        'option_text'        => $opt['option_text'],
                        'is_correct'         => $opt['is_correct'],
                        'order'              => $opt['order'] ?? ($i + 1),
                        'triggers_text_input' => $opt['triggers_text_input'] ?? false,
                    ]);
                }
            }
        });

        $question->load(['subject', 'options']);

        return $this->success(new ExamQuestionResource($question));
    }

    public function destroy(Request $request, Exam $exam, ExamQuestion $question): JsonResponse
    {
        $this->authorizeTenant($request, $exam->tenant_id);

        $question->options()->delete();
        $question->delete();

        return response()->json(['message' => 'Questão removida com sucesso.']);
    }

    private function authorizeTenant(Request $request, int $resourceTenantId): void
    {
        $tenantId = $this->getTenantId($request);
        if ($tenantId !== null && $tenantId !== $resourceTenantId) {
            abort(403, 'Acesso negado.');
        }
    }
}
