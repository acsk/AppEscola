<?php

namespace App\Models;

use App\Traits\TracksUserActivity;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class SupportMaterial extends Model
{
    use HasFactory, SoftDeletes, TracksUserActivity;

    protected $fillable = [
        'tenant_id',
        'exam_id',
        'title',
        'description',
        'type',
        'content',
        'file_type',
        'file_size',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'file_size' => 'integer',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function exam(): BelongsTo
    {
        return $this->belongsTo(Exam::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
