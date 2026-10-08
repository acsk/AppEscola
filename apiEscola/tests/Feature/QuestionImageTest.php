<?php

namespace Tests\Feature;

use App\Exceptions\AiException;
use App\Models\ExamQuestion;
use App\Models\QuestionImageGeneration;
use App\Models\Tenant;
use App\Models\TenantAiCredential;
use App\Models\User;
use App\Services\Ai\QuestionImageStorage;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\ResponseSequence;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class QuestionImageTest extends TestCase
{
    use RefreshDatabase;

    protected bool $dropViews = true;

    private Tenant $tenant;

    private User $admin;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DomainSeeder::class);
        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->admin()->create(['tenant_id' => $this->tenant->id, 'status' => 'active']);
        Sanctum::actingAs($this->admin);
        TenantAiCredential::create(['tenant_id' => $this->tenant->id, 'provider' => 'openrouter', 'api_key' => 'fake-image-key', 'key_hint' => '-key', 'active' => true]);
        Storage::fake('public');
        Cache::flush();
        Http::preventStrayRequests();
        config([
            'services.ai.images.vision_model' => 'test/vision',
            'services.ai.images.model' => 'test/image',
            'services.ai.images.vision_free_fallbacks' => [],
            'services.ai.images.free_fallbacks' => [],
            'services.ai.images.validate' => true,
            'services.ai.images.max_retries' => 2,
        ]);
    }

    public function test_generation_stores_metadata_without_changing_question_image_contract(): void
    {
        $generation = QuestionImageGeneration::create([
            'tenant_id' => $this->tenant->id,
            'image_spec' => ['tipo' => 'FIGURA_GEOMETRICA', 'labels' => [['texto' => '6 cm']]],
            'metadata' => ['usage' => ['cost' => 0.04]],
        ])->fresh();

        $this->assertSame('6 cm', $generation->image_spec['labels'][0]['texto']);
        $this->assertSame(0.04, $generation->metadata['usage']['cost']);
        $this->assertSame('PENDING', $generation->reviewPayload()['image_generation']['status']);
        $this->assertNull($generation->question_id);
        $this->assertNull($generation->image_url);
    }

    public function test_multimodal_recreation_stores_image_and_new_numbers(): void
    {
        $this->fakePipeline();
        $response = $this->similar($this->source())->assertOk()
            ->assertJsonPath('body.questions.0.image_generation.status', 'READY')
            ->assertJsonPath('body.questions.0.image_generation.validation.confidence', 0.94);
        $generation = QuestionImageGeneration::findOrFail($response->json('body.questions.0.generation_id'));

        Storage::disk('public')->assertExists($generation->path);
        $this->assertSame('image/png', $generation->mime_type);
        $this->assertNull($generation->question_id);
        $this->assertSame(0.04, $generation->metadata['history'][0]['usage']['cost']);
        Http::assertSent(function (Request $request) {
            if (! str_ends_with($request->url(), '/images')) {
                return false;
            }
            foreach (['6 cm', '8 cm', '10 cm'] as $number) {
                $this->assertStringContainsString($number, $request['prompt']);
            }
            foreach (['3 cm', '4 cm', '5 cm', 'Resposta secreta'] as $number) {
                $this->assertStringNotContainsString($number, $request['prompt']);
            }

            return isset($request['input_references'][0]['image_url']['url'])
                && $request['provider']['allow_fallbacks'] === false;
        });
    }

    public function test_question_without_image_keeps_original_flow(): void
    {
        Http::fake(['*/chat/completions' => Http::response($this->chat(['questions' => [[
            'question_text' => 'Pergunta nova', 'explanation' => 'Resposta', 'options' => [],
        ]]]))]);
        $source = $this->source(['image_url' => null]);
        $this->similar($source)->assertOk()->assertJsonMissingPath('body.questions.0.generation_id');
        Http::assertSentCount(1);
        $this->assertDatabaseCount('question_image_generations', 0);
    }

    public function test_missing_image_and_external_url_need_review_without_http(): void
    {
        $source = $this->source();
        Storage::disk('public')->delete('uploads/question-bank/'.$this->tenant->id.'/draft/source.png');
        $this->similar($source)->assertStatus(422)->assertJsonPath('body.status', 'NEEDS_REVIEW');
        $source->update(['image_url' => 'http://127.0.0.1/private.png']);
        $this->similar($source)->assertStatus(422)->assertJsonPath('body.status', 'NEEDS_REVIEW');
        Http::assertNothingSent();
    }

    public function test_model_can_decide_new_question_does_not_need_image(): void
    {
        $this->fakePipeline(false);
        $this->similar($this->source())->assertOk()->assertJsonPath('body.questions.0.possui_imagem', false);
        Http::assertNotSent(fn (Request $request) => str_ends_with($request->url(), '/images'));
        $this->assertDatabaseCount('question_image_generations', 1);
    }

    public function test_recreation_prompt_includes_visual_fields_inside_question_format(): void
    {
        $this->fakePipeline(false);
        $this->similar($this->source())->assertOk();
        Http::assertSent(function (Request $request) {
            $prompt = $request['messages'][1]['content'][0]['text'] ?? '';
            if (! str_contains($prompt, 'Formato da resposta:')) {
                return false;
            }
            $format = explode("\n\nANÁLISE VISUAL", explode("Formato da resposta:\n", $prompt, 2)[1], 2)[0];
            $template = json_decode($format, true, 512, JSON_THROW_ON_ERROR);
            $this->assertTrue($template['questions'][0]['possui_imagem']);
            $this->assertArrayHasKey('labels', $template['questions'][0]['image_spec']);
            $this->assertStringContainsString('nunca texto, número, null nem campo omitido', $prompt);

            return true;
        });
    }

    #[DataProvider('invalidImageDecisions')]
    public function test_missing_or_non_boolean_image_decision_needs_review_without_generating_image(mixed $decision): void
    {
        $this->fakePipeline(true, null, 200, [], self::PNG, ['possui_imagem' => $decision]);
        $response = $this->similar($this->source())->assertStatus(422)
            ->assertJsonPath('body.code', 'image_needs_review')
            ->assertJsonPath('body.status', 'NEEDS_REVIEW');
        $this->assertStringContainsString('possui_imagem', $response->json('message'));
        $this->assertDatabaseHas('question_image_generations', [
            'tenant_id' => $this->tenant->id, 'status' => 'NEEDS_REVIEW', 'error' => $response->json('message'),
        ]);
        Http::assertNotSent(fn (Request $request) => str_ends_with($request->url(), '/images'));
    }

    public static function invalidImageDecisions(): array
    {
        return [[null], ['true'], ['false'], [1], [0]];
    }

    public function test_inconsistent_numbers_retry_then_succeed(): void
    {
        $invalid = ['valida' => false, 'confidence' => 0.97, 'problemas' => ['A questão pede 8 cm, mas a imagem mostra 4 cm.'], 'recomendacao' => 'Use 8 cm.'];
        $this->fakePipeline(true, [$invalid, $this->valid()]);
        $this->similar($this->source())->assertOk()
            ->assertJsonPath('body.questions.0.image_generation.status', 'READY')
            ->assertJsonPath('body.questions.0.image_generation.attempts', 2);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/images')
            && str_contains($request['prompt'], 'Corrija as inconsistências'));
    }

    public function test_retry_is_bounded_and_failed_validation_blocks_approval_state(): void
    {
        $invalid = ['valida' => false, 'confidence' => 0.97, 'problemas' => ['Número incorreto'], 'recomendacao' => null];
        $this->fakePipeline(true, [$invalid, $invalid, $invalid]);
        $this->similar($this->source())->assertOk()
            ->assertJsonPath('body.questions.0.image_generation.status', 'NEEDS_REVIEW')
            ->assertJsonPath('body.questions.0.image_generation.attempts', 3);
    }

    public function test_generation_failure_is_returned_as_needs_review_not_ready(): void
    {
        $this->fakePipeline(true, null, 503);
        $this->similar($this->source())->assertOk()
            ->assertJsonPath('body.questions.0.image_generation.status', 'NEEDS_REVIEW');
    }

    public function test_unsuitable_analysis_does_not_generate_question_or_image(): void
    {
        $this->fakePipeline(true, null, 200, ['status' => 'NEEDS_REVIEW', 'motivo' => 'Imagem ilegível.']);
        $this->similar($this->source())->assertStatus(422)->assertJsonPath('body.motivo', 'Imagem ilegível.');
        Http::assertNotSent(fn (Request $request) => str_ends_with($request->url(), '/images'));
    }

    public function test_manual_regeneration_changes_only_image_and_keeps_question(): void
    {
        $this->fakePipeline(true, [$this->valid(), $this->valid()]);
        $draft = $this->similar($this->source())->assertOk()->json('body.questions.0');
        $oldUrl = $draft['image_url'];
        $this->postJson('/api/question-bank/ai/image-generations/'.$draft['generation_id'].'/regenerate', [
            'content' => ['type' => $draft['type'], 'question_text' => $draft['question_text'], 'explanation' => $draft['explanation'], 'options' => []],
            'instructions' => 'Labels maiores, fundo simples.',
        ])->assertOk()->assertJsonPath('body.image_generation.status', 'READY');

        $generation = QuestionImageGeneration::findOrFail($draft['generation_id']);
        $this->assertNotSame($oldUrl, $generation->image_url);
        $this->assertSame($draft['question_text'], $generation->content['question_text']);
        $this->assertSame(2, $generation->attempts);
        $this->assertDatabaseCount('exam_questions', 1);
    }

    public function test_edited_question_refreshes_spec_before_manual_regeneration(): void
    {
        $newSpec = $this->spec();
        $newSpec['labels'] = [['elemento' => 'AB', 'texto' => '12 cm'], ['elemento' => 'BC', 'texto' => '16 cm'], ['elemento' => 'AC', 'texto' => '20 cm']];
        $this->fakePipeline(true, [$this->valid(), $newSpec, $this->valid()]);
        $draft = $this->similar($this->source())->assertOk()->json('body.questions.0');
        $text = 'Triângulo com 12 cm, 16 cm e 20 cm.';
        $this->postJson('/api/question-bank/ai/image-generations/'.$draft['generation_id'].'/regenerate', [
            'content' => ['type' => 'essay', 'question_text' => $text, 'options' => []],
        ])->assertOk()->assertJsonPath('body.image_generation.status', 'READY');
        $generation = QuestionImageGeneration::findOrFail($draft['generation_id']);
        $this->assertSame($text, $generation->content['question_text']);
        $this->assertStringContainsString('12 cm', $generation->prompt);
        $this->assertDoesNotMatchRegularExpression('/\b6 cm\b/', $generation->prompt);
    }

    public function test_approval_binds_generation_once_and_preserves_image_url(): void
    {
        $this->fakePipeline();
        $draft = $this->similar($this->source())->assertOk()->json('body.questions.0');
        $payload = [
            'type' => $draft['type'], 'question_text' => $draft['question_text'],
            'image_url' => $draft['image_url'], 'generation_id' => $draft['generation_id'],
        ];
        $response = $this->postJson('/api/question-bank/questions', $payload)
            ->assertCreated()->assertJsonPath('body.image_url', $draft['image_url']);
        $generation = QuestionImageGeneration::findOrFail($draft['generation_id']);
        $this->assertSame('APPROVED', $generation->status);
        $this->assertSame($response->json('body.id'), $generation->question_id);
        $this->postJson('/api/question-bank/questions', $payload)->assertStatus(422)->assertJsonValidationErrors('generation_id');
    }

    public function test_approval_rejects_edited_content_or_missing_generation(): void
    {
        $this->fakePipeline();
        $draft = $this->similar($this->source())->assertOk()->json('body.questions.0');
        $this->postJson('/api/question-bank/questions', [
            'type' => 'essay', 'question_text' => 'Troquei 8 cm por 4 cm.',
            'image_url' => $draft['image_url'], 'generation_id' => $draft['generation_id'],
        ])->assertStatus(422)->assertJsonValidationErrors('generation_id');
        $this->postJson('/api/question-bank/questions', [
            'type' => 'essay', 'question_text' => $draft['question_text'], 'image_url' => $draft['image_url'],
        ])->assertStatus(422)->assertJsonValidationErrors('generation_id');
        $this->assertDatabaseCount('exam_questions', 1);
    }

    public function test_editor_redraw_uses_form_state_and_saving_the_image_links_the_generation(): void
    {
        $source = $this->source();
        $sameData = $this->spec();
        $sameData['labels'] = [['elemento' => 'AB', 'texto' => '3 cm'], ['elemento' => 'BC', 'texto' => '4 cm'], ['elemento' => 'AC', 'texto' => '5 cm']];
        $this->fakeProvider(Http::sequence()
            ->push($this->chat($this->analysis()))
            ->push($this->chat($sameData))
            ->push($this->chat($this->valid())));

        $response = $this->postJson('/api/question-bank/ai/redraw-image', [
            'question_id' => $source->id, 'image_url' => $source->image_url, 'type' => 'essay',
            'question_text' => 'Triângulo retângulo (editado) com 3 cm, 4 cm e 5 cm.', 'instructions' => 'Labels maiores.',
        ])->assertOk()->assertJsonPath('body.image_generation.status', 'READY');

        $generation = QuestionImageGeneration::findOrFail($response->json('body.generation_id'));
        $this->assertSame(QuestionImageGeneration::ORIGIN_EDITOR_REDRAW, $generation->origin);
        $this->assertSame($source->id, $generation->source_question_id);
        $this->assertStringContainsString('REDESENHO DA MESMA QUESTÃO', $generation->prompt);
        $this->assertStringContainsString('3 cm', $generation->prompt);
        $this->assertStringContainsString('Labels maiores.', $generation->prompt);
        Storage::disk('public')->assertExists($generation->path);
        Http::assertSent(fn (Request $request) => str_contains((string) json_encode($request->data()), '(editado)'));
        $this->assertSame('Triângulo com 3 cm, 4 cm e 5 cm.', $source->fresh()->question_text);

        // A imagem redesenhada foi conferida no editor: salvar não exige o fluxo de aprovação de similares.
        $created = $this->postJson('/api/question-bank/questions', [
            'type' => 'essay', 'question_text' => 'Nova questão com a figura.', 'image_url' => $generation->image_url,
        ])->assertCreated();
        $this->assertSame($created->json('body.id'), $generation->fresh()->question_id);
        $this->assertSame('APPROVED', $generation->fresh()->status);
    }

    public function test_editor_redraw_rejects_image_outside_school_storage_without_calling_ai(): void
    {
        $this->postJson('/api/question-bank/ai/redraw-image', ['image_url' => 'http://127.0.0.1/private.png', 'question_text' => 'Figura'])
            ->assertStatus(422)->assertJsonPath('body.status', 'NEEDS_REVIEW');
        $this->postJson('/api/question-bank/ai/redraw-image', ['question_text' => 'Sem imagem'])
            ->assertStatus(422)->assertJsonValidationErrors('image_url');
        Http::assertNothingSent();
    }

    public function test_approval_rejects_missing_generated_file(): void
    {
        $this->fakePipeline();
        $draft = $this->similar($this->source())->assertOk()->json('body.questions.0');
        $generation = QuestionImageGeneration::findOrFail($draft['generation_id']);
        Storage::disk($generation->disk)->delete($generation->path);
        $this->postJson('/api/question-bank/questions', [
            'type' => 'essay', 'question_text' => $draft['question_text'],
            'image_url' => $draft['image_url'], 'generation_id' => $draft['generation_id'],
        ])->assertStatus(422)->assertJsonValidationErrors('generation_id');
    }

    public function test_tenant_and_staff_authorization_apply_to_regeneration(): void
    {
        $this->fakePipeline();
        $draft = $this->similar($this->source())->assertOk()->json('body.questions.0');
        $url = '/api/question-bank/ai/image-generations/'.$draft['generation_id'].'/regenerate';
        $payload = ['content' => ['type' => 'essay', 'question_text' => $draft['question_text']]];
        $otherTenant = Tenant::factory()->create();
        Sanctum::actingAs(User::factory()->admin()->create(['tenant_id' => $otherTenant->id, 'status' => 'active']));
        $this->postJson($url, $payload)->assertNotFound();
        Sanctum::actingAs(User::factory()->create(['tenant_id' => $this->tenant->id, 'role' => 'aluno', 'status' => 'active']));
        $this->postJson($url, $payload)->assertForbidden();
    }

    public function test_validation_can_be_disabled_but_human_review_is_still_required(): void
    {
        config(['services.ai.images.validate' => false]);
        $this->fakePipeline();
        $this->similar($this->source())->assertOk()
            ->assertJsonPath('body.questions.0.image_generation.status', 'READY')
            ->assertJsonPath('body.questions.0.image_generation.validation', null);
        $this->assertDatabaseCount('exam_questions', 1);
    }

    public function test_invalid_generated_mime_is_needs_review(): void
    {
        $this->fakePipeline(true, null, 200, [], base64_encode('<svg onload="alert(1)"></svg>'));
        $this->similar($this->source())->assertOk()
            ->assertJsonPath('body.questions.0.image_generation.status', 'NEEDS_REVIEW')
            ->assertJsonPath('body.questions.0.image_url', null);
    }

    public function test_generated_image_larger_than_five_megabytes_is_rejected(): void
    {
        $this->expectException(AiException::class);
        app(QuestionImageStorage::class)->store($this->tenant->id, 'test',
            base64_encode(str_repeat('A', 5 * 1024 * 1024 + 1)));
    }

    public function test_generated_image_larger_than_4096_pixels_is_rejected(): void
    {
        $this->expectException(AiException::class);
        $bytes = substr_replace(base64_decode(self::PNG), pack('N', 4097), 16, 4);
        app(QuestionImageStorage::class)->store($this->tenant->id, 'test', base64_encode($bytes));
    }

    private function source(array $attributes = []): ExamQuestion
    {
        $path = 'uploads/question-bank/'.$this->tenant->id.'/draft/source.png';
        Storage::disk('public')->put($path, base64_decode(self::PNG));

        return ExamQuestion::create(array_replace([
            'tenant_id' => $this->tenant->id, 'type' => 'essay', 'points' => 1, 'order' => 1,
            'question_text' => 'Triângulo com 3 cm, 4 cm e 5 cm.',
            'image_url' => asset('storage/'.$path),
        ], $attributes));
    }

    private function similar(ExamQuestion $source)
    {
        return $this->postJson("/api/question-bank/questions/{$source->id}/ai/similar", ['quantity' => 1]);
    }

    private function fakePipeline(bool $needsImage = true, ?array $validations = null, int $imageStatus = 200, array $analysisOverrides = [], string $image = self::PNG, array $questionOverrides = []): void
    {
        $sequence = Http::sequence()
            ->push($this->chat(array_replace($this->analysis(), $analysisOverrides)))
            ->push($this->chat(['questions' => [array_filter(array_replace([
                'question_text' => 'Triângulo com 6 cm, 8 cm e 10 cm.',
                'explanation' => 'Resposta secreta', 'possui_imagem' => $needsImage, 'image_spec' => $this->spec(),
            ], $questionOverrides), fn ($value) => $value !== null)]]));
        foreach ($validations ?? [$this->valid()] as $validation) {
            $sequence->push($this->chat($validation));
        }
        $this->fakeProvider($sequence, $imageStatus, $image);
    }

    private function fakeProvider(ResponseSequence $sequence, int $imageStatus = 200, string $image = self::PNG): void
    {
        Http::fake([
            '*/models/test/vision/endpoints' => Http::response(['data' => [
                'architecture' => ['input_modalities' => ['text', 'image']],
                'endpoints' => [['tag' => 'test-provider', 'status' => 0, 'supported_parameters' => ['response_format'], 'pricing' => ['prompt' => '0.01']]],
            ]]),
            '*/images/models/test/image/endpoints' => Http::response(['endpoints' => [[
                'provider_tag' => 'test-provider', 'supported_parameters' => ['input_references' => ['max' => 1]],
                'pricing' => [['cost_usd' => 0.04]],
            ]]]),
            '*/chat/completions' => $sequence,
            '*/images' => Http::response(['data' => [['b64_json' => $image]], 'usage' => ['cost' => 0.04]], $imageStatus),
        ]);
    }

    private function chat(array $data): array
    {
        return ['choices' => [['message' => ['content' => json_encode($data)]]], 'usage' => ['cost' => 0.01]];
    }

    private function valid(): array
    {
        return ['valida' => true, 'confidence' => 0.94, 'problemas' => [], 'recomendacao' => null];
    }

    private function analysis(): array
    {
        return [
            'status' => 'READY', 'motivo' => null, 'tipo' => 'FIGURA_GEOMETRICA', 'descricao' => 'Triângulo',
            'funcao_na_questao' => 'Apresentar medidas', 'elementos_obrigatorios' => ['triângulo'],
            'elementos_que_podem_mudar' => ['medidas'], 'restricoes' => ['não revelar resposta'],
        ];
    }

    private function spec(): array
    {
        return [
            'tipo' => 'FIGURA_GEOMETRICA', 'descricao' => 'Triângulo com novas medidas', 'objetivo' => 'Apresentar os dados',
            'elementos' => [['tipo' => 'triangulo', 'id' => 'ABC']],
            'labels' => [['elemento' => 'AB', 'texto' => '6 cm'], ['elemento' => 'BC', 'texto' => '8 cm'], ['elemento' => 'AC', 'texto' => '10 cm']],
            'dados_visuais' => [], 'restricoes' => ['não revelar resposta'],
        ];
    }
}
