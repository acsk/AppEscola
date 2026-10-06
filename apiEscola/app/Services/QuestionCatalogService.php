<?php

namespace App\Services;

use App\Exceptions\QuestionBankException;
use App\Models\QuestionBoard;
use App\Models\QuestionDifficulty;
use App\Models\QuestionTag;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Cadastros simples do banco de questões (id, nome único, descrição).
 * Uma implementação para todos: cada cadastro é só uma entrada em CATALOGS.
 */
class QuestionCatalogService
{
    /**
     * tenant: escopo por tenant (false = global);
     * editable: aceita criar/editar/excluir pela API;
     * column: FK em exam_questions; pivot: [tabela, coluna] para N:N.
     */
    public const CATALOGS = [
        'difficulties' => [
            'model'    => QuestionDifficulty::class,
            'label'    => 'Dificuldade',
            'tenant'   => false,
            'editable' => false,
            'column'   => 'difficulty_id',
            'order'    => 'sort_order',
        ],
        'boards' => [
            'model'    => QuestionBoard::class,
            'label'    => 'Banca',
            'tenant'   => true,
            'editable' => true,
            'column'   => 'board_id',
            'order'    => 'name',
        ],
        'tags' => [
            'model'    => QuestionTag::class,
            'label'    => 'Tag',
            'tenant'   => true,
            'editable' => true,
            'pivot'    => ['exam_question_tag', 'question_tag_id'],
            'order'    => 'name',
        ],
    ];

    public static function normalizeName(string $name): string
    {
        return trim(preg_replace('/\s+/u', ' ', $name) ?? '');
    }

    /** @return array<string, mixed> */
    public function definition(string $catalog): array
    {
        if (! isset(self::CATALOGS[$catalog])) {
            throw new NotFoundHttpException('Cadastro não encontrado.');
        }

        return self::CATALOGS[$catalog];
    }

    public function list(string $catalog, int $tenantId, ?string $search = null): Collection
    {
        $def = $this->definition($catalog);

        return $this->query($def, $tenantId)
            ->when($search, fn (Builder $q, string $v) => $q->where('name', 'like', '%'.$v.'%'))
            ->select('*')
            ->selectSub(
                $this->usageQuery($def, $tenantId)
                    ->whereColumn($this->usageKey($def), (new $def['model'])->getTable().'.id')
                    ->selectRaw('count(*)'),
                'questions_count'
            )
            ->orderBy($def['order'])
            ->orderBy('id')
            ->get();
    }

    public function find(string $catalog, int $tenantId, int $id): Model
    {
        $item = $this->query($this->definition($catalog), $tenantId)->whereKey($id)->first();

        if (! $item) {
            throw new NotFoundHttpException('Item não encontrado.');
        }

        return $item;
    }

    /** @param array{name: string, description?: ?string} $data */
    public function create(string $catalog, int $tenantId, array $data): Model
    {
        $def = $this->assertEditable($catalog);
        $name = self::normalizeName($data['name']);
        $this->assertNameAvailable($def, $tenantId, $name);

        $attributes = ['name' => $name, 'description' => $data['description'] ?? null];
        if ($def['tenant']) {
            $attributes['tenant_id'] = $tenantId;
        }

        return $this->guardUnique($def, fn () => $def['model']::create($attributes));
    }

    /** @param array{name?: string, description?: ?string} $data */
    public function update(string $catalog, int $tenantId, int $id, array $data): Model
    {
        $def = $this->assertEditable($catalog);
        $item = $this->find($catalog, $tenantId, $id);

        if (array_key_exists('name', $data)) {
            $name = self::normalizeName($data['name']);
            $this->assertNameAvailable($def, $tenantId, $name, $item->getKey());
            $item->name = $name;
        }
        if (array_key_exists('description', $data)) {
            $item->description = $data['description'];
        }

        return $this->guardUnique($def, function () use ($item) {
            $item->save();

            return $item;
        });
    }

    public function delete(string $catalog, int $tenantId, int $id): void
    {
        $def = $this->assertEditable($catalog);
        $item = $this->find($catalog, $tenantId, $id);

        $inUse = $this->usageQuery($def, $tenantId)->where($this->usageKey($def), $item->getKey())->count();

        if ($inUse > 0) {
            throw QuestionBankException::conflict(
                "{$def['label']} \"{$item->name}\" está em uso por {$inUse} questão(ões) e não pode ser excluída."
            );
        }

        $item->delete();
    }

    /** Busca itens de tags por nome no tenant, criando os que não existem. */
    public function resolveTagIds(int $tenantId, array $names): array
    {
        $ids = [];
        foreach ($names as $name) {
            $name = self::normalizeName((string) $name);
            if ($name === '') {
                continue;
            }
            $tag = QuestionTag::query()->where('tenant_id', $tenantId)->where('name', $name)->first()
                ?? $this->guardUnique(self::CATALOGS['tags'], fn () => QuestionTag::create([
                    'tenant_id' => $tenantId,
                    'name'      => $name,
                ]));
            $ids[$tag->id] = $tag->id;
        }

        return array_values($ids);
    }

    private function query(array $def, int $tenantId): Builder
    {
        return $def['model']::query()->when($def['tenant'], fn (Builder $q) => $q->where('tenant_id', $tenantId));
    }

    /** Vínculos com questões (não excluídas) do tenant. */
    private function usageQuery(array $def, int $tenantId): \Illuminate\Database\Query\Builder
    {
        $query = isset($def['pivot'])
            ? DB::table($def['pivot'][0])->join('exam_questions as eq', 'eq.id', '=', $def['pivot'][0].'.exam_question_id')
            : DB::table('exam_questions as eq');

        return $query->whereNull('eq.deleted_at')->where('eq.tenant_id', $tenantId);
    }

    private function usageKey(array $def): string
    {
        return isset($def['pivot']) ? $def['pivot'][0].'.'.$def['pivot'][1] : 'eq.'.$def['column'];
    }

    private function assertEditable(string $catalog): array
    {
        $def = $this->definition($catalog);

        if (! $def['editable']) {
            throw new QuestionBankException("O cadastro de {$def['label']} não pode ser alterado.", 403);
        }

        return $def;
    }

    private function assertNameAvailable(array $def, int $tenantId, string $name, ?int $ignoreId = null): void
    {
        $exists = $this->query($def, $tenantId)
            ->where('name', $name)
            ->when($ignoreId, fn (Builder $q, int $id) => $q->whereKeyNot($id))
            ->exists();

        if ($exists) {
            throw QuestionBankException::conflict("Já existe {$def['label']} com o nome \"{$name}\".");
        }
    }

    /** Converte violação do índice único (corrida entre requisições) em 409. */
    private function guardUnique(array $def, callable $callback): Model
    {
        try {
            return $callback();
        } catch (UniqueConstraintViolationException) {
            throw QuestionBankException::conflict("Já existe {$def['label']} com esse nome.");
        }
    }
}
