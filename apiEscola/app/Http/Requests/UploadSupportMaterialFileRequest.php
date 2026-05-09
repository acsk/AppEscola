<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadSupportMaterialFileRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'title'       => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:1000'],
            'file'        => ['required', 'file', 'mimes:pdf,jpg,jpeg,png,webp,mp4,mov,avi,mkv', 'max:52428800'], // 50MB
        ];
    }

    public function messages(): array
    {
        return [
            'title.required'   => 'O título do material é obrigatório.',
            'file.required'    => 'O arquivo é obrigatório.',
            'file.mimes'       => 'O arquivo deve ser PDF, imagem (jpg, png, webp) ou vídeo (mp4, mov, avi, mkv).',
            'file.max'         => 'O arquivo não pode exceder 50 MB.',
        ];
    }
}
