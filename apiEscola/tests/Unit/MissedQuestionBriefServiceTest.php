<?php

namespace Tests\Unit;

use App\Services\MissedQuestionBriefService;
use PHPUnit\Framework\TestCase;

class MissedQuestionBriefServiceTest extends TestCase
{
    public function test_summary_groups_by_subject_and_keeps_a_short_generation_note(): void
    {
        $presented = MissedQuestionBriefService::present([
            $this->question(318, 'Português', ['Tipologia e Gêneros Textuais'], 8, 10, 6),
            $this->question(12, 'Português', ['Tipologia e Gêneros Textuais'], 4, 10, 3),
            $this->question(7, 'Matemática', ['Frações'], 5, 6, 4),
        ], 'collective', null, 3);

        $this->assertStringContainsString('Conjunto da escola', $presented['summary']);
        $this->assertStringContainsString('Pelo menos 3 respostas', $presented['summary']);
        $this->assertStringContainsString('Português — Tipologia e Gêneros Textuais', $presented['summary']);
        $this->assertStringContainsString('#318', $presented['summary']);
        $this->assertStringContainsString('Matemática — Frações', $presented['summary']);
        $this->assertLessThan(
            strpos($presented['summary'], 'Matemática — Frações'),
            strpos($presented['summary'], 'Português — Tipologia e Gêneros Textuais')
        );

        $note = $presented['questions'][0]['generation_note'];
        $this->assertLessThanOrEqual(500, mb_strlen($note));
        $this->assertStringContainsString('Tipologia e Gêneros Textuais', $note);
        $this->assertStringContainsString('80%', $note);
        $this->assertStringContainsString('6 alunos', $presented['summary']);
    }

    public function test_empty_student_summary_names_the_student(): void
    {
        $presented = MissedQuestionBriefService::present([], 'student', 'MARIA SILVA', null);

        $this->assertStringContainsString('Aluno MARIA SILVA', $presented['summary']);
        $this->assertStringContainsString('ainda não tem erro contabilizado', $presented['summary']);
        $this->assertSame([], $presented['questions']);
    }

    /** @return array<string, mixed> */
    private function question(int $id, string $subject, array $topics, int $wrong, int $total, int $students): array
    {
        return [
            'id' => $id,
            'type' => 'multiple_choice',
            'options_count' => 4,
            'difficulty_id' => 1,
            'difficulty' => 'Fácil',
            'subject' => $subject,
            'topics' => $topics,
            'snippet' => 'Enunciado '.$id,
            'image_url' => null,
            'wrong_count' => $wrong,
            'answer_count' => $total,
            'error_rate' => round($wrong / $total * 100, 1),
            'students_wrong' => $students,
        ];
    }
}
