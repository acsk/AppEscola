<?php

namespace App\Exceptions;

use RuntimeException;

class CarneGenerationException extends RuntimeException
{
    /**
     * @param  array<int, array<string, mixed>>  $errors
     */
    public function __construct(
        string $message,
        public readonly array $errors = [],
        public readonly ?string $hint = null,
    ) {
        parent::__construct($message);
    }
}
