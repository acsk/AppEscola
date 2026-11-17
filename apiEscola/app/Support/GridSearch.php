<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use InvalidArgumentException;

/**
 * Pesquisa global de grades: ignora maiúsculas, minúsculas e acentuação.
 * Funciona em MySQL e SQLite (o LOWER do SQLite só converte A–Z).
 */
class GridSearch
{
    /** Acentos comuns do português, nos dois casos, para a letra ASCII minúscula. */
    private const ACCENTS = [
        'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a',
        'Á' => 'a', 'À' => 'a', 'Â' => 'a', 'Ã' => 'a', 'Ä' => 'a',
        'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'É' => 'e', 'È' => 'e', 'Ê' => 'e', 'Ë' => 'e',
        'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
        'Í' => 'i', 'Ì' => 'i', 'Î' => 'i', 'Ï' => 'i',
        'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
        'Ó' => 'o', 'Ò' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ö' => 'o',
        'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
        'Ú' => 'u', 'Ù' => 'u', 'Û' => 'u', 'Ü' => 'u',
        'ç' => 'c', 'Ç' => 'c',
        'ñ' => 'n', 'Ñ' => 'n',
    ];

    /**
     * @param  list<string>  $columns  Colunas da tabela da query
     * @param  array<string, list<string>>  $relations  Relação (aceita ponto) => colunas
     */
    public static function apply(Builder $query, ?string $term, array $columns, array $relations = []): void
    {
        $term = trim((string) $term);
        if ($term === '') {
            return;
        }

        $folded = self::fold($term);
        if ($folded === '') {
            return;
        }

        $like = self::likePattern($folded);
        $digits = preg_replace('/\D+/', '', $term) ?? '';
        $digitLike = strlen($digits) >= 3 ? self::likePattern($digits) : null;

        $query->where(function (Builder $inner) use ($columns, $relations, $like, $digitLike): void {
            $applied = false;

            foreach ($columns as $column) {
                self::addFolded($inner, $column, $like, $applied);
                if ($digitLike !== null && self::isDigitColumn($column)) {
                    self::addDigits($inner, $column, $digitLike, $applied);
                }
            }

            foreach ($relations as $relation => $relationColumns) {
                if (! is_string($relation) || $relationColumns === []) {
                    continue;
                }

                self::assertRelation($relation);
                $method = $applied ? 'orWhereHas' : 'whereHas';
                $applied = true;
                $inner->{$method}($relation, function (Builder $related) use ($relationColumns, $like, $digitLike): void {
                    $related->where(function (Builder $nested) use ($relationColumns, $like, $digitLike): void {
                        $nestedApplied = false;
                        foreach ($relationColumns as $column) {
                            self::addFolded($nested, $column, $like, $nestedApplied);
                            if ($digitLike !== null && self::isDigitColumn($column)) {
                                self::addDigits($nested, $column, $digitLike, $nestedApplied);
                            }
                        }
                    });
                });
            }
        });
    }

    public static function fold(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        return mb_strtolower(strtr($value, self::ACCENTS), 'UTF-8');
    }

    private static function addFolded(Builder $query, string $column, string $like, bool &$applied): void
    {
        $sql = self::foldedSql($column).' LIKE ?';
        if ($applied) {
            $query->orWhereRaw($sql, [$like]);
        } else {
            $query->whereRaw($sql, [$like]);
            $applied = true;
        }
    }

    private static function addDigits(Builder $query, string $column, string $like, bool &$applied): void
    {
        $sql = self::digitsSql($column).' LIKE ?';
        if ($applied) {
            $query->orWhereRaw($sql, [$like]);
        } else {
            $query->whereRaw($sql, [$like]);
            $applied = true;
        }
    }

    private static function foldedSql(string $column): string
    {
        self::assertColumn($column);
        $expr = $column;
        foreach (self::ACCENTS as $from => $to) {
            $expr = "REPLACE({$expr}, '{$from}', '{$to}')";
        }

        return "LOWER({$expr})";
    }

    private static function digitsSql(string $column): string
    {
        self::assertColumn($column);
        $expr = $column;
        foreach (['.', '-', '/', '(', ')', ' ', '+'] as $char) {
            $expr = "REPLACE({$expr}, '{$char}', '')";
        }

        return $expr;
    }

    private static function isDigitColumn(string $column): bool
    {
        $name = strtolower((string) strrchr($column, '.'));
        $name = $name === '' ? strtolower($column) : substr($name, 1);

        return in_array($name, ['document', 'phone'], true);
    }

    private static function likePattern(string $value): string
    {
        return '%'.str_replace(['%', '_'], ' ', $value).'%';
    }

    private static function assertColumn(string $column): void
    {
        if (! preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/', $column)) {
            throw new InvalidArgumentException('Coluna de busca inválida.');
        }
    }

    private static function assertRelation(string $relation): void
    {
        if (! preg_match('/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/', $relation)) {
            throw new InvalidArgumentException('Relação de busca inválida.');
        }
    }
}
