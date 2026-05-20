<?php

namespace App\Providers;

use App\Models\Exam;
use App\Models\Invoice;
use App\Observers\ExamObserver;
use App\Observers\InvoiceObserver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Exam::observe(ExamObserver::class);
        Invoice::observe(InvoiceObserver::class);

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
            ];

            foreach ($model->getAttributes() as $attribute => $value) {
                if (!is_string($value)) {
                    continue;
                }

                if (
                    in_array($attribute, $excluded, true)
                    || str_contains($attribute, 'token')
                    || str_contains($attribute, 'hash')
                ) {
                    continue;
                }

                $model->setAttribute($attribute, mb_strtoupper(trim($value), 'UTF-8'));
            }
        });
    }
}
