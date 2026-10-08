<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Questão salva pelo aluno no banco de questões. */
class PracticeSavedQuestion extends Model
{
    protected $fillable = ['tenant_id', 'student_id', 'exam_question_id'];
}
