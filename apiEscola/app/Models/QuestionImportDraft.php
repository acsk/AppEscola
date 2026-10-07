<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class QuestionImportDraft extends Model
{
    use HasUuids;

    protected $fillable = [
        'tenant_id', 'user_id', 'source_exam_name', 'questions', 'no_text_pages', 'active_question_key', 'settings', 'revision',
    ];

    protected function casts(): array
    {
        return ['questions' => 'array', 'no_text_pages' => 'array', 'settings' => 'array', 'revision' => 'integer'];
    }
}
