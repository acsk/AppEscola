# Payment Gateway Architecture

## Overview

A arquitetura de payment gateway foi refatorada para suportar múltiplos provedores de pagamento de forma extensível. A implementação segue o padrão **Strategy** com **Service Locator Factory**.

## Components

### 1. `PaymentGatewayContract` (Interface)

Define o contrato que todo gateway deve implementar:

```php
// app/Contracts/PaymentGatewayContract.php
interface PaymentGatewayContract {
    public function createCharge(Invoice $invoice, string $environment = 'stage', string $method = 'pix'): array;
    public function listInvoices(Tenant $tenant, string $environment = 'prod', array $query = []): array;
    public function getInvoiceById(Tenant $tenant, string $chargeId, string $environment = 'prod'): array;
    public function cancelCharge(Tenant $tenant, string $chargeId, string $environment = 'prod'): void;
}
```

### 2. `PaymentGatewayFactory` (Service Locator)

Central dispatcher que resolve qual implementação usar:

```php
// app/Services/PaymentGatewayFactory.php
class PaymentGatewayFactory {
    private const GATEWAYS = [
        'cora' => CoraPaymentGateway::class,
        // 'stripe' => StripePaymentGateway::class,
        // 'pagseguro' => PagSeguroPaymentGateway::class,
    ];

    public static function resolve(string $providerSlug): PaymentGatewayContract {
        return app(self::GATEWAYS[$providerSlug]);
    }
}
```

### 3. `CoraPaymentGateway` (Concrete Implementation)

Implementação específica para Cora:

```php
// app/Services/Gateways/CoraPaymentGateway.php
class CoraPaymentGateway implements PaymentGatewayContract {
    public function __construct(private readonly CoraTokenService $tokenService) {}
    
    public function createCharge(Invoice $invoice, string $environment = 'stage', string $method = 'pix'): array {
        // Implementação Cora
    }
    
    // ... outros métodos
}
```

### 4. `CoraPaymentService` (Backward Compatibility Wrapper)

Mantém compatibilidade com código legado:

```php
// app/Services/CoraPaymentService.php
class CoraPaymentService {
    private PaymentGatewayContract $gateway;

    public function __construct(private readonly CoraTokenService $tokenService) {
        $this->gateway = app(CoraPaymentGateway::class);
    }

    public function createCharge(Invoice $invoice, ...): array {
        return $this->gateway->createCharge($invoice, ...);  // Delega
    }
}
```

## Controllers Integration

Todos os controllers foram atualizados para usar a factory:

```php
class PaymentProviderController extends Controller {
    public function generateCharge(Request $request, Invoice $invoice, PaymentGatewayFactory $factory): JsonResponse {
        $gateway = $factory->resolve('cora');  // Resolve implementação
        $result = $gateway->createCharge($invoice, $environment, $method);
        // ...
    }
}
```

## Adding a New Gateway

### Step 1: Create Gateway Class

```php
// app/Services/Gateways/StripePaymentGateway.php
<?php

namespace App\Services\Gateways;

use App\Contracts\PaymentGatewayContract;
use App\Models\Invoice;
use App\Models\Tenant;

class StripePaymentGateway implements PaymentGatewayContract {
    public function __construct(private readonly StripeTokenService $tokenService) {}
    
    public function createCharge(Invoice $invoice, string $environment = 'stage', string $method = 'pix'): array {
        // Stripe-specific implementation
        $client = new StripeClient($this->tokenService->getToken());
        $charge = $client->charges->create([
            'amount' => $invoice->amount * 100,
            'currency' => 'brl',
            'customer_email' => $invoice->student?->email,
        ]);
        
        return [
            'external_id' => $charge->id,
            'status' => $charge->status,
            'payment_url' => $charge->receipt_url,
            'pix_copy_paste' => null,  // Stripe-specific extraction
            'qr_code_image_url' => null,
            'boleto_number' => null,
            'boleto_digitable' => null,
            'payload' => $charge->toArray(),
        ];
    }
    
    public function listInvoices(Tenant $tenant, string $environment = 'prod', array $query = []): array {
        // Stripe-specific list implementation
    }
    
    public function getInvoiceById(Tenant $tenant, string $chargeId, string $environment = 'prod'): array {
        // Stripe-specific get by ID implementation
    }
    
    public function cancelCharge(Tenant $tenant, string $chargeId, string $environment = 'prod'): void {
        // Stripe-specific cancel implementation
    }
}
```

### Step 2: Register in Factory

```php
// app/Services/PaymentGatewayFactory.php
private const GATEWAYS = [
    'cora' => CoraPaymentGateway::class,
    'stripe' => StripePaymentGateway::class,  // ← Add this line
    // 'pagseguro' => PagSeguroPaymentGateway::class,
];
```

### Step 3: Controllers Automatically Work!

Controllers don't need changes. They work with any registered gateway:

```php
// This now works for both Cora and Stripe!
$gateway = $factory->resolve('stripe');  // New provider
$result = $gateway->createCharge($invoice, 'prod', 'pix');
```

## Benefits

### 1. **Extensibility**
- Add new providers without modifying existing code
- Follow Open/Closed Principle
- Only add to GATEWAYS const and create new implementation

### 2. **Loose Coupling**
- Controllers depend on PaymentGatewayContract (abstraction)
- Not on specific gateway implementation (CoraPaymentGateway)
- Easy to swap implementations or mock for testing

### 3. **Backward Compatibility**
- CoraPaymentService wrapper still works
- Legacy code using direct injection continues to function
- Gradual migration path

### 4. **Dependency Injection**
- Laravel's service container resolves gateways
- Testable: Easy to mock implementations
- Manages lifecycle (singleton vs transient)

## Usage Examples

### From Controller (Recommended)

```php
public function generateCharge(Request $request, Invoice $invoice, PaymentGatewayFactory $factory): JsonResponse {
    $gateway = $factory->resolve('cora');
    $result = $gateway->createCharge($invoice, 'prod', 'pix');
}
```

### From Service

```php
class InvoiceSyncService {
    public function __construct(private readonly PaymentGatewayFactory $factory) {}
    
    public function sync(Tenant $tenant): void {
        $gateway = $factory->resolve('cora');
        $charges = $gateway->listInvoices($tenant, 'prod');
    }
}
```

### From Command/Job

```php
class SyncInvoicesCommand extends Command {
    public function handle(PaymentGatewayFactory $factory) {
        $gateway = $factory->resolve('cora');
        // Use gateway
    }
}
```

## Testing

### Mocking in Tests

```php
class PaymentTest extends TestCase {
    public function test_charge_creation() {
        $mockGateway = $this->mock(PaymentGatewayContract::class);
        $mockGateway->shouldReceive('createCharge')
            ->andReturn(['external_id' => '123']);
        
        $this->app->bind(PaymentGatewayFactory::class, function () use ($mockGateway) {
            return new class($mockGateway) {
                public function __construct(private $gateway) {}
                public function resolve(string $slug) {
                    return $this->gateway;
                }
            };
        });
        
        $response = $this->post('/api/invoices/1/generate-charge', [
            'provider' => 'cora'
        ]);
        
        $response->assertSuccessful();
    }
}
```

## Files Modified

- ✅ `app/Contracts/PaymentGatewayContract.php` (created)
- ✅ `app/Services/Gateways/CoraPaymentGateway.php` (created)
- ✅ `app/Services/PaymentGatewayFactory.php` (created)
- ✅ `app/Services/CoraPaymentService.php` (refactored to wrapper)
- ✅ `app/Http/Controllers/Api/PaymentProviderController.php` (updated)
- ✅ `app/Http/Controllers/Api/StudentFinanceController.php` (updated)
- ✅ `app/Http/Controllers/Api/InvoiceController.php` (updated)
- ✅ `app/Services/CoraEnrollmentInvoiceSyncService.php` (updated)

## Next Steps

1. Implement `StripePaymentGateway` following the pattern
2. Implement `PagSeguroPaymentGateway`
3. Create gateway-specific event listeners (payment webhooks)
4. Add payment provider configuration UI for setting keys/tokens
