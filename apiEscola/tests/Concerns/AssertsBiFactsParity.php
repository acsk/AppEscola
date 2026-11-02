<?php

namespace Tests\Concerns;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/** As telas do BI devem dar os mesmos números calculando ao vivo e lendo de bi_answer_facts. */
trait AssertsBiFactsParity
{
    /** @param  list<string>  $urls */
    protected function assertFactsMatchLive(array $urls): void
    {
        $live = array_map(fn (string $url) => $this->comparableBody($url), $urls);

        $this->artisan('bi:refresh-facts', ['--full' => true])->assertSuccessful();
        Cache::flush();
        $this->assertGreaterThan(0, DB::table('bi_answer_facts')->count(), 'O cenário precisa gerar fatos.');
        $this->assertNotNull(DB::table('bi_fact_refreshes')->value('full_refreshed_at'));

        foreach ($urls as $i => $url) {
            $this->assertEquals($live[$i], $this->comparableBody($url), "Fatos divergem do cálculo ao vivo em {$url}");
        }
    }

    private function comparableBody(string $url): array
    {
        $strip = function (array $data) use (&$strip): array {
            unset($data['generated_at'], $data['answers_as_of']);

            return array_map(fn ($v) => is_array($v) ? $strip($v) : $v, $data);
        };

        return $strip($this->getJson($url)->assertOk()->json('body'));
    }
}
