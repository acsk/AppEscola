<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/** Simulado do banco de questões (importado de PDF ou montado pelo admin), separado dos simulados oficiais. */
class QuestionSet extends Model
{
    use SoftDeletes, TracksUserActivity;

    public const ORIGIN_PDF_IMPORT = 'pdf_import';

    public const ORIGIN_ADMIN = 'admin';

    public const STATUS_DRAFT = 'draft';

    public const STATUS_PUBLISHED = 'published';

    protected $fillable = [
        'tenant_id',
        'title',
        'description',
        'origin',
        'status',
        'exam_type_id',
        'source_exam_name',
        'created_by',
        'updated_by',
        'deleted_by',
    ];

    public function examType(): BelongsTo
    {
        return $this->belongsTo(ExamType::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(QuestionSetItem::class)->orderBy('position');
    }

    public function questions(): BelongsToMany
    {
        return $this->belongsToMany(ExamQuestion::class, 'question_set_items', 'question_set_id', 'exam_question_id')
            ->withPivot('position')
            ->orderByPivot('position');
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(PracticeAttempt::class);
    }

    public function isPublished(): bool
    {
        return $this->status === self::STATUS_PUBLISHED;
    }
}
