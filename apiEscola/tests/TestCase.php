<?php

namespace Tests;

use App\Models\ExamQuestion;
use App\Models\QuestionReview;
use Database\Seeders\DomainSeeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Domínios de lookup (status, métodos de pagamento, etc.) exigidos por FKs nas migrations.
     * Testes com RefreshDatabase podem chamar este método em afterRefreshingDatabase().
     */
    protected function seedDomainLookups(): void
    {
        $this->seed(DomainSeeder::class);
    }

    /** A prática do aluno só inclui questão com revisão aprovada. */
    protected function approveQuestionForPractice(ExamQuestion $question): ExamQuestion
    {
        QuestionReview::query()->create([
            'tenant_id' => $question->tenant_id,
            'question_id' => $question->id,
            'content_hash' => hash('sha256', 'test:'.$question->id),
            'result' => QuestionReview::APROVADA,
            'status' => QuestionReview::APROVADA,
            'problems' => [],
            'recommendation' => 'aprovar',
            'attempts' => 1,
            'validated_at' => now(),
        ]);

        return $question;
    }
}
