<?php

namespace Tests\Feature;

use App\Models\ExamQuestion;
use App\Models\QuestionImageGeneration;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\User;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QuestionPdfTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private const PDF = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF";

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        Cache::flush();
        Http::preventStrayRequests();
        config(['services.ai.pdf.model_openrouter' => 'google/gemini-2.5-flash']);
        $this->tenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']));
        TenantAiCredential::create([
            'tenant_id' => $this->tenant->id, 'provider' => 'openrouter',
            'api_key' => 'test-pdf-key', 'key_hint' => '-key', 'active' => true,
        ]);
    }

    private function question(bool $image = false): array
    {
        return [
            'source_number' => '7', 'type' => 'multiple_choice',
            'question_text' => 'Qual a medida do lado AB no triângulo?', 'explanation' => 'O lado mede 6 cm.',
            'options' => [
                ['option_text' => '6 cm', 'is_correct' => true],
                ['option_text' => '8 cm', 'is_correct' => false],
            ],
            'answer_from_pdf' => true, 'possui_imagem' => $image,
            'image_spec' => $image ? [
                'tipo' => 'FIGURA_GEOMETRICA', 'descricao' => 'Triângulo com lado AB medindo 6 cm.',
                'objetivo' => 'Identificar medidas', 'elementos' => [['tipo' => 'triangulo', 'id' => 'ABC']],
                'labels' => [['elemento' => 'AB', 'texto' => '6 cm']], 'dados_visuais' => [],
                'restricoes' => ['Não revelar gabarito'],
            ] : null,
        ];
    }

    private function fakePdf(array $payload, string $finish = 'stop', array $modalities = ['file', 'image', 'text'], int $chatStatus = 200): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake([
            '*/models/*/endpoints' => Http::response(['data' => [
                'architecture' => ['input_modalities' => $modalities],
                'endpoints' => [[
                    'status' => 0, 'tag' => 'google-vertex', 'pricing' => ['prompt' => '0.0000003'],
                    'supported_parameters' => ['response_format'],
                ]],
            ]]),
            '*/chat/completions' => Http::response(['choices' => [[
                'finish_reason' => $finish, 'message' => ['content' => json_encode($payload)],
            ]]], $chatStatus),
        ]);
    }

    private function upload(): TestResponse
    {
        return $this->withHeader('Accept', 'application/json')->post('/api/question-bank/ai/extract-pdf', [
            'pdf' => UploadedFile::fake()->createWithContent('scan.pdf', self::PDF),
        ]);
    }

    public function test_sends_original_pdf_natively_without_local_text_extraction_and_does_not_save_questions(): void
    {
        $this->fakePdf(['complete' => true, 'total_questions' => 2, 'questions' => [$this->question(), $this->question()]]);
        $this->upload()->assertOk()->assertJsonCount(2, 'body.questions')
            ->assertJsonPath('body.questions.0.source_number', '7')
            ->assertJsonPath('body.questions.0.possui_imagem', false);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/chat/completions')
            && $request['messages'][1]['content'][1]['file']['file_data'] === 'data:application/pdf;base64,'.base64_encode(self::PDF)
            && $request['plugins'][0]['pdf']['engine'] === 'native'
            && $request['provider'] === ['only' => ['google-vertex'], 'allow_fallbacks' => false]
            && $request['model'] === 'google/gemini-2.5-flash');
        $this->assertSame(0, ExamQuestion::count());
    }

    public function test_image_question_creates_tenant_owned_pending_draft_with_original_spec_and_hash_not_pdf_bytes(): void
    {
        $this->fakePdf(['complete' => true, 'total_questions' => 1, 'questions' => [$this->question(true)]]);
        $response = $this->upload()->assertOk()->assertJsonPath('body.questions.0.possui_imagem', true)
            ->assertJsonPath('body.questions.0.image_generation.status', 'PENDING');
        $draft = QuestionImageGeneration::findOrFail($response->json('body.questions.0.generation_id'));
        $this->assertSame((int) $this->tenant->id, (int) $draft->tenant_id);
        $this->assertNull($draft->source_question_id);
        $this->assertSame('6 cm', $draft->image_spec['labels'][0]['texto']);
        $this->assertSame(hash('sha256', self::PDF), $draft->metadata['document_sha256']);
        $this->assertStringNotContainsString(base64_encode(self::PDF), $draft->toJson());
        $this->assertSame(0, ExamQuestion::count());
    }

    public function test_incomplete_and_truncated_responses_are_rejected_without_partial_drafts(): void
    {
        foreach ([
            [['complete' => false, 'total_questions' => 2, 'questions' => [$this->question(true)]], 'stop'],
            [['complete' => true, 'total_questions' => 2, 'questions' => [$this->question(true)]], 'stop'],
            [['complete' => true, 'total_questions' => 1, 'questions' => [$this->question(true)]], 'length'],
            [['complete' => true, 'total_questions' => 51, 'questions' => array_fill(0, 51, $this->question())], 'stop'],
        ] as [$payload, $finish]) {
            $this->fakePdf($payload, $finish);
            $this->upload()->assertStatus(422)->assertJsonPath('body.code', 'pdf_incomplete');
            $this->assertSame(0, QuestionImageGeneration::count());
        }

    }

    public function test_pdf_image_can_be_generated_validated_and_approved_without_a_saved_source_question(): void
    {
        $this->fakePdf(['complete' => true, 'total_questions' => 1, 'questions' => [$this->question(true)]]);
        $draft = $this->upload()->assertOk()->json('body.questions.0');
        $this->postJson('/api/question-bank/questions', $draft)->assertStatus(422);
        Storage::fake('public');
        config(['services.ai.images.model' => 'test/image', 'services.ai.images.vision_model' => 'test/vision']);
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake([
            '*/models/test/vision/endpoints' => Http::response(['data' => [
                'architecture' => ['input_modalities' => ['text', 'image']],
                'endpoints' => [['tag' => 'test-provider', 'status' => 0, 'supported_parameters' => ['response_format'], 'pricing' => ['prompt' => '0.01']]],
            ]]),
            '*/images/models/test/image/endpoints' => Http::response(['endpoints' => [[
                'provider_tag' => 'test-provider', 'supported_parameters' => [], 'pricing' => [['cost_usd' => 0.04]],
            ]]]),
            '*/images' => Http::response(['data' => [['b64_json' => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=']]]),
            '*/chat/completions' => Http::response(['choices' => [['message' => ['content' => json_encode([
                'valida' => true, 'confidence' => 0.94, 'problemas' => [], 'recomendacao' => null,
            ])]]]]),
        ]);
        $image = $this->postJson('/api/question-bank/ai/image-generations/'.$draft['generation_id'].'/regenerate', [
            'content' => array_intersect_key($draft, array_flip(['type', 'question_text', 'options', 'explanation'])),
        ])->assertOk()->assertJsonPath('body.image_generation.status', 'READY')->json('body');
        $generation = QuestionImageGeneration::findOrFail($draft['generation_id']);
        Storage::disk('public')->assertExists($generation->path);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/images')
            && str_contains($request['prompt'], 'dados originais')
            && str_contains($request['prompt'], '6 cm')
            && ! isset($request['input_references']));
        $this->postJson('/api/question-bank/questions', array_replace($draft, ['image_url' => $image['image_url']]))
            ->assertCreated();
        $this->assertNotNull($generation->fresh()->question_id);
    }

    public function test_invalid_image_decision_and_multiple_correct_answers_do_not_become_silent_defaults(): void
    {
        $question = $this->question();
        foreach (['missing_image', 'multiple_correct'] as $case) {
            $invalid = $question;
            if ($case === 'missing_image') {
                unset($invalid['possui_imagem']);
            } else {
                $invalid['options'][1]['is_correct'] = true;
            }
            $this->fakePdf(['complete' => true, 'total_questions' => 2, 'questions' => [$this->question(true), $invalid]]);
            $this->upload()->assertStatus(502)->assertJsonPath('body.code', 'ai_invalid_response');
            $this->assertSame(0, QuestionImageGeneration::count());
        }
    }

    public function test_text_only_model_is_rejected_without_calling_paid_completion(): void
    {
        $this->fakePdf([], 'stop', ['text', 'image']);
        $this->upload()->assertStatus(422)->assertJsonPath('body.code', 'ai_model_capability');
        Http::assertNotSent(fn (Request $request) => str_ends_with($request->url(), '/chat/completions'));
    }

    public function test_provider_failure_does_not_trigger_paid_retry_or_fallback(): void
    {
        $this->fakePdf([], 'stop', ['file', 'image', 'text'], 500);
        $this->upload()->assertStatus(502)->assertJsonPath('body.code', 'ai_provider_error');
        Http::assertSentCount(2);
        $this->assertSame(0, QuestionImageGeneration::count());
    }

    public function test_invalid_file_and_excessive_size_are_rejected_before_ai(): void
    {
        Http::fake();
        $this->post('/api/question-bank/ai/extract-pdf', [
            'pdf' => UploadedFile::fake()->create('prova.pdf', 20481, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
        $this->post('/api/question-bank/ai/extract-pdf', [
            'pdf' => UploadedFile::fake()->createWithContent('prova.txt', 'not a pdf'),
        ], ['Accept' => 'application/json'])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_student_cannot_import_pdf(): void
    {
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'aluno', 'status' => 'active']));
        Http::fake();
        $this->upload()->assertStatus(403);
        Http::assertNothingSent();
    }
}
