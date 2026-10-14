<?php

namespace App\Contracts\Embeddings;

interface ProvedorEmbeddings
{
    /**
     * @param  array{provider: string, api_key: string, base_url: string, model: string}  $credencial
     * @param  list<string>  $textos
     * @return array{vetores: list<list<float>>, tokens: int, modelo: string}
     */
    public function gerar(array $credencial, array $textos): array;
}
