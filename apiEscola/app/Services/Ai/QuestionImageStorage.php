<?php

namespace App\Services\Ai;

use App\Exceptions\AiException;
use App\Models\ExamQuestion;
use App\Models\Tenant;
use App\Services\TenantUploadSettingsService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class QuestionImageStorage
{
    public function __construct(private readonly TenantUploadSettingsService $uploads) {}

    /** Read only files owned by this tenant on its configured disk, never arbitrary URLs. */
    public function source(ExamQuestion $question): string
    {
        $tenant = Tenant::findOrFail($question->tenant_id);
        $settings = $this->uploads->getForTenant($tenant);
        $prefix = rtrim($this->uploads->url($settings['disk'], ''), '/').'/';
        $url = (string) $question->image_url;
        if (! str_starts_with($url, $prefix)) {
            throw $this->unreadable('Envie a imagem original pelo upload da plataforma antes de recriá-la.');
        }
        $path = substr($url, strlen($prefix));
        $bank = $settings['base_path'].'/question-bank/'.$tenant->id.'/';
        $exam = $settings['base_path'].'/exams/'.$tenant->id.'/';
        if ((! str_starts_with($path, $bank) && ! str_starts_with($path, $exam))
            || preg_match('~(?:^|/)\.\.?(?:/|$)|[%\\\\?#]~', $path)) {
            throw $this->unreadable('A imagem original não pertence ao armazenamento desta escola.');
        }
        $disk = Storage::disk($settings['disk']);
        if (! $disk->exists($path) || $disk->size($path) > config('services.ai.images.max_bytes')) {
            throw $this->unreadable('Imagem original ausente ou maior que 5 MB.');
        }
        $bytes = $disk->get($path);
        if (! is_string($bytes)) {
            throw $this->unreadable('Não foi possível ler o arquivo da imagem original.');
        }
        $info = $this->inspect($bytes);
        if (! in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
            throw $this->unreadable('Extensão da imagem original não permitida.');
        }

        return 'data:'.$info['mime'].';base64,'.base64_encode($bytes);
    }

    public function store(int $tenantId, string $generationId, string $encoded): array
    {
        if (strlen($encoded) > (int) ceil(config('services.ai.images.max_bytes') * 4 / 3) + 4) {
            throw $this->unreadable('A imagem gerada excede 5 MB.');
        }
        $bytes = base64_decode($encoded, true);
        if ($bytes === false) {
            throw AiException::invalidResponse();
        }
        $info = $this->inspect($bytes);
        $directory = $this->uploads->buildQuestionBankDirectory(Tenant::findOrFail($tenantId), 'ai/'.$generationId);
        $extensions = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
        $path = $directory['directory'].'/'.Str::uuid().'.'.$extensions[$info['mime']];
        if (! Storage::disk($directory['disk'])->put($path, $bytes)) {
            throw AiException::provider('Não foi possível armazenar a imagem gerada.');
        }

        return [
            'disk' => $directory['disk'],
            'path' => $path,
            'image_url' => $this->uploads->url($directory['disk'], $path),
            'mime_type' => $info['mime'],
        ];
    }

    public function dataUrl(array $file): string
    {
        $bytes = Storage::disk($file['disk'])->get($file['path']);
        if (! is_string($bytes)) {
            throw AiException::provider('Não foi possível ler a imagem gerada para validação.');
        }
        $info = $this->inspect($bytes);

        return 'data:'.$info['mime'].';base64,'.base64_encode($bytes);
    }

    private function inspect(string $bytes): array
    {
        if ($bytes === '' || strlen($bytes) > config('services.ai.images.max_bytes')) {
            throw $this->unreadable('Imagem vazia ou maior que 5 MB.');
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        if (! in_array($mime, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], true)) {
            throw $this->unreadable('Formato de imagem não permitido. Use PNG, JPEG, WebP ou GIF.');
        }
        $info = @getimagesizefromstring($bytes);
        if ($info === false || $info[0] < 1 || $info[1] < 1
            || max($info[0], $info[1]) > config('services.ai.images.max_dimension')) {
            throw $this->unreadable('Imagem inválida ou com dimensão maior que 4096 pixels.');
        }

        return ['mime' => $mime, 'width' => $info[0], 'height' => $info[1]];
    }

    private function unreadable(string $message): AiException
    {
        return new AiException($message, 422, 'image_needs_review');
    }
}
