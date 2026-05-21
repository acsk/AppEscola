<?php

/*
|--------------------------------------------------------------------------
| Catálogo de provedores de pagamento
|--------------------------------------------------------------------------
|
| Fonte única para capacidades, métodos suportados e metadados de UI.
| Usado por TenantBillingSettingsService, PaymentProviderController e Factory.
|
*/

return [

    'providers' => [

        'cora' => [
            'label' => 'Cora',
            'description' => 'Gera cobranças PIX, boleto ou híbrido via API Cora (credenciais mTLS por ambiente).',
            'requires_credentials' => true,
            'supports_gateway_charge' => true,
            'supports_auto_sync' => true,
            'gateway_class' => \App\Services\Gateways\CoraPaymentGateway::class,
            'methods' => ['pix', 'boleto', 'hybrid'],
            'default_enabled_methods' => ['pix', 'boleto', 'hybrid'],
            'default_method' => 'hybrid',
            'capabilities' => ['pix', 'boleto', 'hybrid', 'webhook', 'mtls_cert_upload'],
        ],

        'asaas' => [
            'label' => 'Asaas',
            'description' => 'Cobranças PIX, boleto e cartão via API Asaas (chave global no servidor + webhook).',
            'requires_credentials' => true,
            'supports_gateway_charge' => true,
            'supports_auto_sync' => true,
            'gateway_class' => \App\Services\Gateways\AsaasPaymentGateway::class,
            'methods' => ['pix', 'boleto', 'credit_card'],
            'default_enabled_methods' => ['pix', 'boleto'],
            'default_method' => 'pix',
            'capabilities' => ['pix', 'boleto', 'credit_card', 'webhook', 'customer_sync'],
        ],

        'manual' => [
            'label' => 'Manual',
            'description' => 'Sem gateway: faturas no sistema e confirmação pela secretaria (caixa, transferência, etc.).',
            'requires_credentials' => false,
            'supports_gateway_charge' => false,
            'supports_auto_sync' => false,
            'gateway_class' => null,
            'methods' => null, // null = todos os slugs de domain_payment_methods
            'default_enabled_methods' => ['pix', 'boleto', 'cash', 'transfer'],
            'default_method' => 'cash',
            'capabilities' => ['mark_as_paid'],
        ],

    ],

];
