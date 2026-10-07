<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamQuestion;
use App\Models\QuestionImageGeneration;
use App\Models\Subject;
use App\Models\SubjectTopic;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QuestionTextImportTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    private const TEXT = "[PÁGINA 1]\n7. Observe a figura e informe a medida.\nA) 6 cm\nB) 8 cm\n8. Explique a soma de dois e dois.\nGABARITO 7-A";

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
        Cache::flush();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']));
        TenantAiCredential::create([
            'tenant_id' => $this->tenant->id, 'provider' => 'openrouter',
            'api_key' => 'test-text-key', 'key_hint' => '-key', 'active' => true,
        ]);
    }

    private function questions(): array
    {
        return [[
            'source_number' => '7', 'type' => 'multiple_choice', 'question_text' => 'Observe a figura e informe a medida.',
            'explanation' => 'Gabarito informado no documento.', 'needs_image' => true, 'answer_from_pdf' => true,
            'options' => [['option_text' => '6 cm', 'is_correct' => true], ['option_text' => '8 cm', 'is_correct' => false]],
        ], [
            'source_number' => '8', 'type' => 'essay', 'question_text' => 'Explique a soma de dois e dois.',
            'explanation' => 'A soma é quatro.', 'needs_image' => false, 'answer_from_pdf' => false, 'options' => [],
        ]];
    }

    private function fake(array $questions, bool $complete = true, ?int $total = null, string $finish = 'stop', ?string $content = null): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake([
            '*/models/*/endpoints' => Http::response(['data' => [
                'architecture' => ['input_modalities' => ['text']],
                'endpoints' => [[
                    'status' => 0, 'tag' => 'test-provider', 'pricing' => ['prompt' => '0.01'],
                    'supported_parameters' => ['response_format', 'structured_outputs'], 'max_completion_tokens' => 16384,
                ]],
            ]]),
            '*/chat/completions' => Http::response(['choices' => [[
                'finish_reason' => $finish, 'message' => ['content' => $content ?? json_encode([
                    'complete' => $complete, 'total_questions' => $total ?? count($questions), 'questions' => $questions,
                ])],
            ]]]),
        ]);
    }

    private function separate(array $overrides = []): TestResponse
    {
        return $this->postJson('/api/question-bank/ai/separate-text', array_replace([
            'text' => self::TEXT, 'source_exam_name' => '  Simulado de outubro 2026  ',
        ], $overrides));
    }

    public function test_sends_integral_text_for_ai_separation_and_marks_images_without_generating_or_saving(): void
    {
        $subject = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $topic = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $subject->id, 'name' => 'Medidas']);
        $questions = $this->questions();
        $questions[0]['subject_id'] = $subject->id;
        $questions[0]['topic_ids'] = [$topic->id];
        $this->fake($questions);
        $this->separate()->assertOk()->assertJsonCount(2, 'body.questions')
            ->assertJsonPath('body.questions.0.needs_image', true)
            ->assertJsonPath('body.questions.1.needs_image', false)
            ->assertJsonPath('body.questions.0.source_exam_name', 'Simulado de outubro 2026')
            ->assertJsonPath('body.questions.0.subject_id', $subject->id)
            ->assertJsonPath('body.questions.0.topic_ids.0', $topic->id)
            ->assertJsonPath('body.questions.0.answer_from_pdf', false)
            ->assertJsonPath('body.questions.0.options.0.is_correct', false)
            ->assertJsonMissingPath('body.questions.0.generation_id');
        Http::assertSent(function (Request $request) {
            if (! str_ends_with($request->url(), '/chat/completions')) {
                return false;
            }
            $prompt = $request['messages'][1]['content'];

            return is_string($prompt) && str_contains($prompt, self::TEXT)
                && str_contains($prompt, 'A separação é sua responsabilidade')
                && str_contains($prompt, 'Ignore o gabarito mesmo quando disponível')
                && ! isset($request['plugins'])
                && $request['response_format']['type'] === 'json_schema'
                && $request['response_format']['json_schema']['strict'] === true
                && $request['max_tokens'] === 16000
                && $request['provider']['allow_fallbacks'] === false;
        });
        Http::assertSentCount(2);
        $this->assertSame(0, ExamQuestion::count());
        $this->assertSame(0, QuestionImageGeneration::count());
        $this->assertSame(0, Exam::count());
    }

    public function test_unknown_answer_remains_unmarked_for_human_review(): void
    {
        $questions = $this->questions();
        $questions[0]['answer_from_pdf'] = false;
        $questions[0]['options'][0]['is_correct'] = false;
        $this->fake($questions);
        $this->separate()->assertOk()->assertJsonPath('body.questions.0.options.0.is_correct', false)
            ->assertJsonPath('body.questions.0.options.1.is_correct', false);
    }

    public function test_answer_keys_are_discarded_even_when_inconsistent_or_malformed(): void
    {
        foreach (['multiple', 'none', 'malformed', 'missing'] as $answerCase) {
            $questions = $this->questions();
            $questions[0]['options'][0]['is_correct'] = $answerCase !== 'none';
            $questions[0]['options'][1]['is_correct'] = $answerCase === 'multiple';
            if ($answerCase === 'malformed') {
                $questions[0]['answer_from_pdf'] = 'yes';
                $questions[0]['options'][0]['is_correct'] = 'yes';
            } elseif ($answerCase === 'missing') {
                unset($questions[0]['answer_from_pdf'], $questions[0]['options'][0]['is_correct']);
            }
            $this->fake($questions);
            $this->separate()->assertOk()
                ->assertJsonPath('body.questions.0.answer_from_pdf', false)
                ->assertJsonPath('body.questions.0.options.0.is_correct', false)
                ->assertJsonPath('body.questions.0.options.1.is_correct', false)
                ->assertJsonPath('body.questions.0.options.0.option_text', '6 cm')
                ->assertJsonPath('body.questions.0.options.1.option_text', '8 cm');
        }
        $this->assertSame(0, ExamQuestion::count());
    }

    public function test_incomplete_truncated_and_invalid_visual_decisions_are_rejected(): void
    {
        $this->fake($this->questions(), false);
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'pdf_incomplete');
        $this->fake($this->questions(), true, 3);
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'pdf_incomplete');
        $this->fake($this->questions(), true, null, 'length');
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'pdf_incomplete');
        $invalid = $this->questions();
        unset($invalid[1]['needs_image']);
        $this->fake($invalid);
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'pdf_invalid_question')
            ->assertJsonPath('message', 'A IA devolveu a questão de posição 2 inválida: needs_image e answer_from_pdf devem ser booleanos. Nenhuma questão foi incluída.');
        $this->assertSame(0, ExamQuestion::count());
    }

    public function test_visual_alternatives_are_preserved_as_manual_placeholders_without_inventing_answer(): void
    {
        $question = $this->questions()[0];
        $question['answer_from_pdf'] = false;
        $question['options'] = [
            ['option_text' => '[Imagem da alternativa A — anexar manualmente]', 'is_correct' => false],
            ['option_text' => '[Imagem da alternativa B — anexar manualmente]', 'is_correct' => false],
        ];
        $this->fake([$question]);
        $this->separate()->assertOk()->assertJsonPath('body.questions.0.needs_image', true)
            ->assertJsonPath('body.questions.0.options.0.option_text', $question['options'][0]['option_text'])
            ->assertJsonPath('body.questions.0.options.0.is_correct', false);
    }

    public function test_truncated_invalid_json_is_reported_before_decoding(): void
    {
        $this->fake([], true, null, 'length', '{"questions":[{"question_text":"');
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'pdf_incomplete');
        $this->assertSame(0, ExamQuestion::count());
    }

    public function test_malformed_import_fields_report_the_position_and_reason_without_saving(): void
    {
        $questions = $this->questions();
        $questions[0]['explanation'] = null;
        $this->fake($questions);
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'pdf_invalid_question')
            ->assertJsonFragment(['message' => 'A IA devolveu a questão de posição 1 inválida: explanation deve ser texto de até 20 mil caracteres. Nenhuma questão foi incluída.']);
        $questions[0]['explanation'] = '';
        $questions[0]['options'][1]['option_text'] = '';
        $this->fake($questions);
        $response = $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'pdf_invalid_question');
        $this->assertStringContainsString('alternativas visuais precisam de marcador', $response->json('message'));
        $this->assertSame(0, ExamQuestion::count());
    }

    public function test_provider_without_structured_output_is_rejected_without_completion_or_fallback(): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['*/models/*/endpoints' => Http::response(['data' => [
            'architecture' => ['input_modalities' => ['text']],
            'endpoints' => [[
                'status' => 0, 'tag' => 'incompatible-provider', 'pricing' => ['prompt' => '0'],
                'supported_parameters' => ['response_format'],
            ]],
        ]])]);
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'ai_model_unavailable');
        Http::assertSentCount(1);
        $this->assertSame(0, ExamQuestion::count());
    }

    public function test_invalid_input_is_rejected_before_any_provider_call(): void
    {
        Http::fake();
        $this->separate(['text' => str_repeat('a', 120001)])->assertStatus(422);
        $this->separate(['source_exam_name' => '   '])->assertStatus(422);
        $this->separate(['source_exam_name' => str_repeat('a', 256)])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_student_and_tenant_without_key_cannot_import(): void
    {
        Http::fake();
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'aluno', 'status' => 'active']));
        $this->separate()->assertStatus(403);
        $other = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $other->id, 'status' => 'active']));
        $this->separate()->assertStatus(422)->assertJsonPath('body.code', 'ai_not_configured');
        Http::assertNothingSent();
    }

    public function test_source_name_persists_without_exam_link_and_is_searchable_editable_and_tenant_scoped(): void
    {
        $payload = $this->questions()[0] + ['source_exam_name' => 'Simulado de outubro 2026', 'image_url' => 'https://example.test/storage/manual.png'];
        $created = $this->postJson('/api/question-bank/questions', $payload)->assertCreated()
            ->assertJsonPath('body.source_exam_name', 'Simulado de outubro 2026')->assertJsonPath('body.exam', null);
        $id = $created->json('body.id');
        $this->getJson('/api/question-bank/questions/'.$id)->assertOk()->assertJsonPath('body.source_exam_name', 'Simulado de outubro 2026');
        $this->getJson('/api/question-bank/questions?search=outubro')->assertOk()->assertJsonPath('data.0.id', $id);
        $this->putJson('/api/question-bank/questions/'.$id, ['source_exam_name' => 'Prova revisada'])->assertOk()
            ->assertJsonPath('body.source_exam_name', 'Prova revisada');
        $this->putJson('/api/question-bank/questions/'.$id, ['explanation' => 'Revisada'])->assertOk()
            ->assertJsonPath('body.source_exam_name', 'Prova revisada');
        $this->assertSame(0, Exam::count());
        $other = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $other->id, 'status' => 'active']));
        $this->getJson('/api/question-bank/questions?search=Prova')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/question-bank/questions/'.$id)->assertNotFound();
    }

    public function test_missing_manual_image_and_unknown_answer_block_final_inclusion(): void
    {
        $this->postJson('/api/question-bank/questions', $this->questions()[0])->assertStatus(422)
            ->assertJsonValidationErrors('image_url');
        $unknown = $this->questions()[0];
        $unknown['options'][0]['is_correct'] = false;
        $unknown['image_url'] = 'https://example.test/storage/manual.png';
        $this->postJson('/api/question-bank/questions', $unknown)->assertStatus(422)
            ->assertJsonValidationErrors('options');
        $this->assertSame(0, ExamQuestion::count());
    }
    public function test_shared_support_text_is_prepended_to_each_question_and_is_not_an_image(): void
    {
        $poem = "Minha terra tem palmeiras,\nOnde canta o Sabiá.\n(Gonçalves Dias, Canção do exílio)";
        $q = fn (string $n, string $cmd) => [
            'source_number' => $n, 'support_text_id' => 't1', 'type' => 'essay', 'question_text' => $cmd, 'explanation' => '',
            'options' => [], 'needs_image' => false, 'answer_from_pdf' => false,
            'subject_id' => null, 'topic_ids' => [], 'difficulty_id' => null, 'board_id' => null, 'year' => null, 'tags' => [],
        ];
        $this->fake([], content: json_encode([
            'complete' => true, 'total_questions' => 2,
            'support_texts' => [['id' => 't1', 'title' => 'Texto I', 'text' => $poem]],
            'questions' => [$q('3', 'Qual é o tema central do poema?'), $q('4', 'Identifique uma figura de linguagem.')],
        ]));

        $response = $this->separate()->assertOk()->assertJsonCount(2, 'body.questions');
        foreach ([0, 1] as $i) {
            $this->assertStringStartsWith("<b>Texto I</b>\n".$poem."\n\n", $response->json("body.questions.{$i}.question_text"));
            $response->assertJsonPath("body.questions.{$i}.needs_image", false);
        }
        $this->assertStringEndsWith('Qual é o tema central do poema?', $response->json('body.questions.0.question_text'));

        // O prompt pede o texto de apoio estruturado e diz que ele nunca é imagem.
        Http::assertSent(fn (Request $r) => str_contains((string) $r->body(), 'nunca imagem') && str_contains((string) $r->body(), 'support_text_id'));
    }

    public function test_classification_is_restricted_to_chosen_subjects(): void
    {
        $portuguese = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Português']);
        $math = Subject::factory()->create(['tenant_id' => $this->tenant->id, 'name' => 'Matemática']);
        $grammar = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $portuguese->id, 'name' => 'Gramática']);
        $algebra = SubjectTopic::create(['tenant_id' => $this->tenant->id, 'subject_id' => $math->id, 'name' => 'Álgebra']);
        $questions = $this->questions();
        $questions[1]['subject_id'] = $math->id;         // IA tenta outra disciplina
        $questions[1]['topic_ids'] = [$algebra->id];
        $questions[0]['topic_ids'] = [$grammar->id];
        $this->fake($questions);

        $response = $this->separate(['subject_ids' => [$portuguese->id]])->assertOk();
        // Só Português foi escolhido: todas ficam em Português e assunto de outra disciplina é descartado.
        $response->assertJsonPath('body.questions.0.subject_id', $portuguese->id)
            ->assertJsonPath('body.questions.0.topic_ids', [$grammar->id])
            ->assertJsonPath('body.questions.1.subject_id', $portuguese->id);
        $this->assertNotContains($algebra->id, $response->json('body.questions.1.topic_ids') ?? []);

        // O catálogo enviado à IA não lista disciplinas não escolhidas.
        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'chat/completions')
            && str_contains((string) $r->body(), 'Gram') && ! str_contains((string) $r->body(), 'lgebra'));

        $other = Subject::factory()->create();
        $this->separate(['subject_ids' => [$other->id]])->assertStatus(422);
    }
}
