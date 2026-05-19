<?php

/*
|--------------------------------------------------------------------------
| Catálogo de configurações de cobrança por tenant
|--------------------------------------------------------------------------
|
| Define as chaves válidas, tipo, valor padrão e metadados de UI para cada
| configuração que o tenant (escola) pode customizar via API.
|
| As configurações são persistidas na tabela `tenant_settings`, agrupadas
| por escopo (`module`) e chave (`key`). O TenantBillingSettingsService faz
| get/set/validação contra este catálogo.
|
| Tipos suportados: bool, int, string, array<string>
|
*/

return [

    'billing' => [
        'charges_enrollment_fee' => [
            'type' => 'bool',
            'default' => true,
            'label' => 'Cobrar taxa de matrícula',
            'description' => 'Quando desativado, nenhuma invoice de enrollment_fee é criada ao matricular o aluno.',
        ],

        'enrollment_fee_covers_first_month' => [
            'type' => 'bool',
            'default' => false,
            'label' => 'Taxa de matrícula equivale ao primeiro mês',
            'description' => 'Se ativo, a geração de mensalidades começa a partir do segundo mês do período.',
        ],

        'allow_monthlies_before_fee_paid' => [
            'type' => 'bool',
            'default' => true,
            'label' => 'Gerar mensalidades antes da taxa ser paga',
            'description' => 'Se desativado, a geração em lote de mensalidades só ocorre depois que a taxa de matrícula estiver com status "paid".',
        ],

        'default_payment_due_day' => [
            'type' => 'int',
            'default' => 10,
            'min' => 1,
            'max' => 28,
            'label' => 'Dia padrão de vencimento',
            'description' => 'Usado quando a matrícula não informa payment_due_day explicitamente.',
        ],
    ],

    'payment' => [
        'enabled_methods' => [
            'type' => 'array',
            'default' => ['pix', 'boleto', 'hybrid'],
            'options' => ['pix', 'boleto', 'hybrid', 'credit_card', 'debit_card', 'cash', 'transfer'],
            'label' => 'Métodos de pagamento habilitados',
            'description' => 'Restringe os métodos que podem ser passados ao gerar cobranças. boleto e bank_slip são equivalentes. hybrid = pix com QR code do boleto.',
        ],

        'default_provider' => [
            'type' => 'string',
            'default' => 'cora',
            'options' => ['cora', 'manual'],
            'label' => 'Provedor padrão',
            'description' => 'Provedor usado quando o front não informa explicitamente.',
        ],

        'default_method' => [
            'type' => 'string',
            'default' => 'hybrid',
            'options' => ['pix', 'boleto', 'hybrid'],
            'label' => 'Método padrão de cobrança',
        ],

        'auto_sync_charges' => [
            'type' => 'bool',
            'default' => true,
            'label' => 'Sincronizar cobranças automaticamente',
            'description' => 'Habilita jobs/agendamentos que consultam o provedor para atualizar status das invoices.',
        ],
    ],

    'enrollment' => [
        'require_cpf_to_enroll' => [
            'type' => 'bool',
            'default' => true,
            'label' => 'Exigir CPF do pagador na matrícula',
        ],

        'require_guardian_for_minors' => [
            'type' => 'bool',
            'default' => true,
            'label' => 'Exigir responsável financeiro para menores de idade',
        ],
    ],

];
