<?php

namespace App\Providers;

use App\Contracts\Embeddings\ProvedorEmbeddings;
use App\Contracts\Embeddings\RegistroUsoEmbeddings;
use App\Contracts\Embeddings\RepositorioEmbeddings;
use App\Services\Embeddings\ProvedorEmbeddingsOpenRouter;
use App\Services\Embeddings\RegistroUsoEmbeddingsMysql;
use App\Services\Embeddings\RepositorioEmbeddingsMysql;
use App\Services\EmailMarketing\EmailMarketingService;
use App\Services\EmailMarketing\ResendMarketingEmailService;
use App\Models\Exam;
use App\Observers\ExamObserver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(RepositorioEmbeddings::class, RepositorioEmbeddingsMysql::class);
        $this->app->singleton(ProvedorEmbeddings::class, ProvedorEmbeddingsOpenRouter::class);
        $this->app->singleton(RegistroUsoEmbeddings::class, RegistroUsoEmbeddingsMysql::class);
        $this->app->singleton(ResendMarketingEmailService::class, fn () => new ResendMarketingEmailService());

        $this->app->singleton(EmailMarketingService::class, function () {
            return new EmailMarketingService([
                'resend' => app(ResendMarketingEmailService::class),
            ]);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Exam::observe(ExamObserver::class);

        Model::saving(function (Model $model): void {
            // Campos técnicos/funcionais que não devem ser forçados para caixa alta.
            $excluded = [
                'password',
                'remember_token',
                'email',
                'role',
                'status',
                'billing_cycle',
                'weekday',
                'period',
                'slug',
                'action',
                'user_agent',
            ];

            foreach ($model->getAttributes() as $attribute => $value) {
                if (!is_string($value)) {
                    continue;
                }

                if (
                    in_array($attribute, $excluded, true)
                    || str_contains($attribute, 'token')
                    || str_contains($attribute, 'hash')
                    || str_contains($attribute, 'embedding')
                    || $attribute === 'model_name'
                ) {
                    continue;
                }

                $model->setAttribute($attribute, mb_strtoupper(trim($value), 'UTF-8'));
            }
        });
    }
}
