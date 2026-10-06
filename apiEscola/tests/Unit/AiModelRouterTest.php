<?php

namespace Tests\Unit;

use App\Exceptions\AiException;
use App\Services\Ai\AiModelRouter;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiModelRouterTest extends TestCase
{
    private array $credential = ['provider' => 'openrouter', 'api_key' => 'test-key', 'base_url' => 'https://openrouter.ai/api/v1', 'model' => 'unused'];

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['services.ai.images.vision_model' => 'test/vision', 'services.ai.images.vision_free_fallbacks' => []]);
        Http::preventStrayRequests();
    }

    public function test_vision_uses_multimodal_input_and_pins_provider(): void
    {
        Http::fake([
            '*/models/test/vision/endpoints' => Http::response($this->visionInfo()),
            '*/chat/completions' => Http::response(['choices' => [['message' => ['content' => '{"tipo":"DIAGRAMA"}']]], 'usage' => ['cost' => 0.01]]),
        ]);
        $result = app(AiModelRouter::class)->vision($this->credential, 'System', 'Question', ['data:image/png;base64,test']);

        $this->assertSame('DIAGRAMA', $result['data']['tipo']);
        $this->assertSame(0.01, $result['usage']['cost']);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), '/chat/completions')
            && $request['messages'][1]['content'][1]['image_url']['url'] === 'data:image/png;base64,test'
            && $request['provider'] === ['only' => ['test-provider'], 'allow_fallbacks' => false]);
    }

    public function test_model_without_vision_is_rejected_before_chat_request(): void
    {
        Http::fake(['*/endpoints' => Http::response($this->visionInfo(['text']))]);
        try {
            app(AiModelRouter::class)->vision($this->credential, 'System', 'Question', []);
            $this->fail('Expected capability rejection');
        } catch (AiException $e) {
            $this->assertSame('ai_model_capability', $e->errorCode);
        }
        Http::assertSentCount(1);
    }

    public function test_paid_fallback_is_never_called(): void
    {
        config(['services.ai.images.vision_free_fallbacks' => ['test/paid']]);
        Http::fake([
            '*/endpoints' => Http::response($this->visionInfo()),
            '*/chat/completions' => Http::response([], 503),
        ]);
        try {
            app(AiModelRouter::class)->vision($this->credential, 'System', 'Question', []);
            $this->fail('Expected fallback rejection');
        } catch (AiException $e) {
            $this->assertSame('ai_model_unavailable', $e->errorCode);
        }
        Http::assertSentCount(3);
    }

    public function test_verified_free_fallback_can_be_used(): void
    {
        config(['services.ai.images.vision_free_fallbacks' => ['test/free']]);
        $free = $this->visionInfo();
        $free['data']['endpoints'][0]['pricing'] = ['prompt' => '0', 'completion' => '0'];
        Http::fake([
            '*/models/test/vision/endpoints' => Http::response($this->visionInfo()),
            '*/models/test/free/endpoints' => Http::response($free),
            '*/chat/completions' => fn (Request $r) => $r['model'] === 'test/free'
                ? Http::response(['choices' => [['message' => ['content' => '{"ok":true}']]]])
                : Http::response([], 503),
        ]);
        $result = app(AiModelRouter::class)->vision($this->credential, 'System', 'Question', []);
        $this->assertTrue($result['data']['ok']);
        $this->assertSame('test/free', $result['model']);
    }

    public function test_model_without_image_endpoint_cannot_generate(): void
    {
        config(['services.ai.images.model' => 'test/not-image', 'services.ai.images.free_fallbacks' => []]);
        Http::fake(['*/images/models/test/not-image/endpoints' => Http::response(['endpoints' => []])]);
        try {
            app(AiModelRouter::class)->image($this->credential, 'Prompt', null);
            $this->fail('Expected image capability rejection');
        } catch (AiException $e) {
            $this->assertSame('ai_model_unavailable', $e->errorCode);
        }
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/images'));
    }

    public function test_paid_primary_requires_configuration_permission(): void
    {
        config(['services.ai.images.allow_paid_primary' => false]);
        Http::fake(['*/endpoints' => Http::response($this->visionInfo())]);
        try {
            app(AiModelRouter::class)->vision($this->credential, 'System', 'Question', []);
            $this->fail('Expected payment policy rejection');
        } catch (AiException $e) {
            $this->assertSame('ai_model_unavailable', $e->errorCode);
        }
        Http::assertSentCount(1);
    }

    private function visionInfo(array $modalities = ['text', 'image']): array
    {
        return ['data' => [
            'architecture' => ['input_modalities' => $modalities],
            'endpoints' => [[
                'tag' => 'test-provider', 'status' => 0, 'supported_parameters' => ['response_format'],
                'pricing' => ['prompt' => '0.01', 'completion' => '0.02'],
            ]],
        ]];
    }
}
