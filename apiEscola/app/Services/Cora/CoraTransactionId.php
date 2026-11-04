<?php

namespace App\Services\Cora;

/**
 * IDs do extrato Cora (trx_..., ent_...) parecem ser UUIDs em base64 com um escape próprio ("9x").
 * A Cora não documenta isso: o comando cora:check-payment-link existe para confirmar, em produção,
 * se o UUID do trx_ é o mesmo de payments[].id da cobrança. Até lá, nada concilia por aqui.
 */
final class CoraTransactionId
{
    /** Caracteres que o "9x" pode representar (inclui o próprio 9). */
    private const ESCAPE_TARGETS = ['9', '_', '-', '/', '+'];

    private const MAX_VARIANTS = 256;

    /**
     * Todos os UUIDs possíveis para o ID (o escape é ambíguo, então devolve cada leitura válida).
     *
     * @return array<int, string> UUIDs em minúsculas, com hífens
     */
    public static function uuidCandidates(?string $id): array
    {
        $body = preg_replace('/^[a-z]+_/', '', trim((string) $id));
        if ($body === '' || $body === null) {
            return [];
        }

        $uuids = [];
        foreach (self::unescapeVariants($body, 22) as $variant) {
            $bytes = base64_decode(strtr($variant, '-_', '+/') . '==', true);
            if ($bytes === false || strlen($bytes) !== 16) {
                continue;
            }
            $hex = bin2hex($bytes);
            // Os IDs observados são UUID v4: versão 4 e variante 8, 9, a ou b.
            if ($hex[12] !== '4' || ! in_array($hex[16], ['8', '9', 'a', 'b'], true)) {
                continue;
            }
            $uuids[] = sprintf('%s-%s-%s-%s-%s', substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4), substr($hex, 16, 4), substr($hex, 20));
        }

        return array_values(array_unique($uuids));
    }

    public static function normalizeUuid(?string $value): ?string
    {
        $value = strtolower(trim((string) $value));

        return preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $value) ? $value : null;
    }

    /**
     * Leituras possíveis do texto com exatamente $length caracteres: cada "9x" pode ser "9x" literal
     * ou o escape de um caractere.
     *
     * @param  array<string, array<int, string>>  $memo
     * @return array<int, string>
     */
    private static function unescapeVariants(string $value, int $length, array &$memo = []): array
    {
        if ($value === '' || $length <= 0) {
            return $value === '' && $length === 0 ? [''] : [];
        }
        $key = $length . '|' . $value;
        if (isset($memo[$key])) {
            return $memo[$key];
        }

        $results = [];
        foreach (self::unescapeVariants(substr($value, 1), $length - 1, $memo) as $rest) {
            $results[] = $value[0] . $rest;
        }
        if ($value[0] === '9' && strlen($value) >= 2) {
            foreach (self::unescapeVariants(substr($value, 2), $length - 1, $memo) as $rest) {
                foreach (self::ESCAPE_TARGETS as $target) {
                    $results[] = $target . $rest;
                }
            }
        }

        return $memo[$key] = array_slice(array_values(array_unique($results)), 0, self::MAX_VARIANTS);
    }
}
