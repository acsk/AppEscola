<?php

namespace App\Services\Email;

use App\Services\Email\Contracts\EmailProvider;
use InvalidArgumentException;

/** Resolve o provedor de e-mail pela chave gravada no tenant (config/email_providers.php). */
class EmailProviderRegistry
{
    /** @return list<string> */
    public function keys(): array
    {
        return array_keys(config('email_providers.providers', []));
    }

    public function get(string $key): EmailProvider
    {
        $class = config("email_providers.providers.{$key}");
        if (! $class) {
            throw new InvalidArgumentException("Provedor de e-mail não suportado: {$key}");
        }

        return app($class);
    }
}
