<?php

use App\Http\Controllers\PublicInvoicePaymentController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/pagamento/{invoice}/{signature}', PublicInvoicePaymentController::class)
    ->whereNumber('invoice')
    ->middleware('throttle:60,1')
    ->name('public.invoice-payment');
