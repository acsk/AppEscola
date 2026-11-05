<?php

namespace App\Services\Email\Contracts;

use App\Services\Email\EmailCredentials;
use App\Services\Email\EmailMessage;
use App\Services\Email\EmailSendResult;
use App\Services\Email\EmailVerification;

/**
 * Provedor de envio de e-mail (Resend hoje; outros entram implementando esta interface e registrando
 * em config/email_providers.php). Não lança exceção por falha do provedor: devolve o resultado.
 */
interface EmailProvider
{
    /** Chave do provedor gravada na configuração do tenant (ex.: "resend"). */
    public function key(): string;

    public function label(): string;

    public function send(EmailMessage $message, EmailCredentials $credentials): EmailSendResult;

    public function verify(EmailCredentials $credentials): EmailVerification;
}
