<?php

namespace App\Support;

use App\Models\ExamQuestion;
use App\Models\SubjectTopic;
use Illuminate\Validation\Validator;

/**
 * Disciplina e assunto obrigatórios na questão salva (simulado e banco).
 *
 * Confere o estado final: o que veio no payload ou, na ausência, o valor atual da questão.
 * O assunto só é exigido quando a disciplina tem assuntos cadastrados.
 * A coerência disciplina/assuntos e o tenant continuam no QuestionClassificationService.
 */
final class QuestionClassificationRequirement
{
    public const SUBJECT_MESSAGE = 'Selecione a disciplina da questão.';
    public const TOPIC_MESSAGE = 'Selecione pelo menos um assunto da disciplina.';

    public static function validate(Validator $validator, array $input, ?ExamQuestion $current = null): void
    {
        if ($validator->errors()->hasAny(['subject_id', 'topic_ids', 'topic_ids.*'])) {
            return;
        }

        $topicsGiven = array_key_exists('topic_ids', $input);
        $givenTopicIds = $topicsGiven ? array_filter((array) ($input['topic_ids'] ?? []), fn ($id) => (int) $id > 0) : [];

        $subjectId = array_key_exists('subject_id', $input) ? $input['subject_id'] : $current?->subject_id;
        if ($subjectId === null || $subjectId === '' || (int) $subjectId <= 0) {
            // Sem disciplina, mas com assuntos: o serviço deduz a disciplina pelos assuntos.
            if ($givenTopicIds === []) {
                $validator->errors()->add('subject_id', self::SUBJECT_MESSAGE);
            }

            return;
        }
        $subjectId = (int) $subjectId;

        if ($topicsGiven) {
            $topicIds = $givenTopicIds;
        } elseif ($current !== null && (int) $current->subject_id === $subjectId) {
            $topicIds = $current->topics()->pluck('subject_topics.id')->all();
        } else {
            $topicIds = [];
        }

        if ($topicIds === [] && SubjectTopic::query()->where('subject_id', $subjectId)->exists()) {
            $validator->errors()->add('topic_ids', self::TOPIC_MESSAGE);
        }
    }
}
