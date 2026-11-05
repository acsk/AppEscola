<?php

namespace App\Services\Email;

use RuntimeException;

class EmailNotConfiguredException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('O envio de e-mail não está configurado (ou está inativo) para esta instituição.');
    }
}
