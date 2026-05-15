# Integração de Sincronização de Boletos Cora - painelEscola

## 📋 Resumo

Foi implementada a funcionalidade de sincronizar boletos emitidos pela Cora com as cobranças locais da matrícula. Essa integração permite que você importe automaticamente boletos existentes na Cora para o sistema local, sem precisar criar cobranças manualmente.

---

## 🎯 Funcionalidade

### Onde fica a funcionalidade

Na tela de **Detalhes da Matrícula**, na seção "Cobranças", foi adicionado um novo botão **"Sincronizar"** (em azul) ao lado do botão "Nova Cobrança" (em roxo).

### O que faz

Quando clicado, o botão:
1. Conecta com a API backend
2. Busca todos os boletos emitidos pela Cora para aquela matrícula
3. Faz matching dos boletos com cobranças locais por:
   - CPF do responsável financeiro (guardian)
   - Dados de matrícula salvos na Cora
   - Valor e data de vencimento
4. Cria novas cobranças locais para boletos não registrados
5. Atualiza cobranças existentes com dados da Cora (status, links de pagamento, etc.)
6. Mostra resultado final (X criadas, Y atualizadas, Z ignoradas)

---

## 🔧 Implementação Técnica

### Arquivos Criados/Modificados

#### 1. **services/cora.ts** (NOVO)
```typescript
// Funções de sincronização de boletos Cora
export type SyncCoraChargesRequest = {
  environment: "stage" | "prod" | "production";
  charge_ids?: string[];
  create_missing?: boolean;
  async?: boolean;
};

export type SyncCoraChargesResult = {
  enrollment_id: number;
  tenant_id: number;
  environment: string;
  external_total: number;
  created: number;
  updated: number;
  ignored: number;
  processed_charge_ids: string[];
};

export async function syncEnrollmentCoraCharges(
  enrollmentId: number,
  payload: SyncCoraChargesRequest
): Promise<SyncCoraChargesResult>

export async function syncBulkEnrollmentCoraCharges(
  enrollmentIds: number[],
  payload: SyncCoraChargesRequest
): Promise<SyncCoraChargesResult[]>
```

#### 2. **screens/matriculas/EnrollmentDetailScreen.tsx** (MODIFICADO)

**Imports adicionados:**
```typescript
import { syncEnrollmentCoraCharges, SyncCoraChargesResult } from "../../services/cora";
```

**Estados adicionados:**
```typescript
const [syncingCoraCharges, setSyncingCoraCharges] = useState(false);
const [syncCoraResult, setSyncCoraResult] = useState<SyncCoraChargesResult | null>(null);
```

**Função de sincronização:**
```typescript
const onSyncCoraCharges = async () => {
  // Dispara sync com ambiente apropriado
  // Mostra toast com resultado
  // Recarrega matrícula
}
```

**Botão UI:**
```typescript
<TouchableOpacity
  onPress={onSyncCoraCharges}
  disabled={syncingCoraCharges}
  className={`flex-row items-center justify-center px-4 py-2 rounded-xl ${
    syncingCoraCharges ? "bg-gray-300" : "bg-blue-600"
  }`}
>
  {syncingCoraCharges ? (
    <ActivityIndicator size="small" color="white" />
  ) : (
    <Ionicons name="sync" size={16} color="white" />
  )}
  <Text className="text-white font-semibold text-sm ml-1">
    {syncingCoraCharges ? "Sincronizando..." : "Sincronizar"}
  </Text>
</TouchableOpacity>
```

---

## 🔌 Endpoint Backend

**POST** `/api/enrollments/{enrollment}/sync-cora-charges`

### Request
```json
{
  "environment": "prod",
  "charge_ids": [],
  "create_missing": true,
  "async": false
}
```

**Parâmetros:**
- `environment` (obrigatório): "stage" ou "prod"
- `charge_ids` (opcional): Array de IDs específicas para sincronizar. Se vazio, sincroniza todas
- `create_missing` (opcional, padrão: true): Se true, cria cobranças locais para boletos não encontrados
- `async` (opcional, padrão: false): Se true, retorna 202 e processa em background via Queue Job

### Response
```json
{
  "enrollment_id": 123,
  "tenant_id": 2,
  "environment": "prod",
  "external_total": 1500.00,
  "created": 2,
  "updated": 3,
  "ignored": 1,
  "processed_charge_ids": ["charge_123", "charge_124", "charge_125"]
}
```

---

## 📱 UX/Comportamento

### Estados da Interface

**1. Padrão (Pronto)**
- Botão azul com ícone de sync (↻)
- Texto: "Sincronizar"
- Clicável

**2. Sincronizando**
- Botão cinza desabilitado
- Spinner + Texto: "Sincronizando..."
- Não é clicável

**3. Sucesso**
- Toast verde no topo
- Mensagem: "✓ Boletos sincronizados"
- Subtítulo: "Sincronização concluída: X criadas, Y atualizadas, Z ignoradas"
- Lista de cobranças é recarregada automaticamente

**4. Erro**
- Toast vermelho no topo
- Mensagem: "✗ Erro na sincronização"
- Detalhe: Mensagem de erro do backend

---

## 🌍 Comportamento de Ambiente

```typescript
// Detecta ambiente automaticamente
const isProductionHost = window.location.hostname !== "localhost";
const environment = isProductionHost ? "prod" : "stage";
```

**localhost (desenvolvimento)** → Sincroniza de `stage` (sandbox Cora)
**Production** → Sincroniza de `prod` (Cora real)

---

## 🔄 Fluxo Completo

```
Usuário clica "Sincronizar"
       ↓
App desabilita botão, mostra spinner
       ↓
POST /api/enrollments/{id}/sync-cora-charges
       ↓
Backend: Lista boletos da Cora
       ↓
Backend: Faz matching com guardians (CPF)
       ↓
Backend: Cria/atualiza invoices locais
       ↓
Retorna resultado { created, updated, ignored }
       ↓
App mostra toast com resultado
       ↓
App recarrega lista de cobranças
       ↓
Usuário vê novos boletos na tela
```

---

## 📝 Exemplo de Uso

### Cenário: IFAL - 26 alunos faltando boletos

1. Abrir matrícula do aluno
2. Descer para seção "Cobranças"
3. Clicar botão azul "Sincronizar"
4. Aguardar processamento (2-5 segundos)
5. Ver mensagem: "✓ Boletos sincronizados - 1 criada, 0 atualizadas, 0 ignoradas"
6. Novos boletos aparecem na lista com links de pagamento

---

## ⚙️ Possíveis Extensões Futuras

1. **Sincronização em Lote**: Selecionar múltiplas matrículas e sincronizar todas de uma vez
2. **Agendamento**: Sincronizar automaticamente a cada X horas
3. **Configuração Granular**: Permitir escolher quais cobranças sincronizar por intervalo de datas
4. **Histórico**: Manter log de quantas vezes cada boleto foi sincronizado
5. **Status Detalhado**: Mostrar spinner + barra de progresso para sync em lote

---

## 🐛 Troubleshooting

### "Erro ao sincronizar boletos da Cora"

**Causa provável**: Token Cora expirado ou credenciais não configuradas

**Solução**: 
- Verificar configurações de Cora em "Configuração > Provedores de Pagamento"
- Verificar certificado mTLS está válido
- Se em production, verificar se ambiente "prod" está ativo

### Boletos não aparecem

**Causa provável**: Boletos não foram encontrados pela Cora

**Solução**:
- Verificar se CPF do responsável está correto
- Verificar se boleto foi realmente emitido pela Cora
- Tentar sincronizar novamente em um minuto

### "create_missing: false" - Por que ignorar?

Se você quer apenas atualizar cobranças existentes sem criar novas, passe `create_missing: false` na requisição. Útil para não "poluir" o sistema com cobranças não planejadas.

---

## 📚 Referências

- **Endpoint Backend**: `/api/enrollments/{enrollment}/sync-cora-charges`
- **Job Assíncrono**: `App\Jobs\SyncEnrollmentCoraChargesJob`
- **Serviço Principal**: `App\Services\CoraEnrollmentInvoiceSyncService`
- **Documentação Cora**: Ver `docs/` no repo principal
