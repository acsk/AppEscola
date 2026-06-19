# Banco MySQL remoto (Hostinger — produção)

Referência para consultar o banco de produção a partir da máquina local ou de outro servidor.

## Dados de conexão

| Campo    | Valor |
|----------|--------|
| **Host** | `srv1314.hstgr.io` |
| **IP**   | `193.203.175.71` (alternativa ao host) |
| **Porta**| `3306` |
| **Banco**| `u304177849_curso` |
| **Usuário / senha** | hPanel → Sites → Bancos de dados → MySQL (não versionar no Git) |

## Arquivos no projeto

| Arquivo | Uso |
|---------|-----|
| `database/remote-hostinger.example.env` | Template versionado (sem senha) |
| `database/remote-hostinger.env` | Credenciais locais (`.gitignore`) |

```bash
cd apiEscola
cp database/remote-hostinger.example.env database/remote-hostinger.env
# Edite remote-hostinger.env com usuário e senha do hPanel
```

## Liberar acesso remoto (obrigatório)

No **hPanel** da Hostinger:

1. **Bancos de dados** → **MySQL remoto** (ou “Remote MySQL”)
2. Adicione o **IP público** do computador que vai conectar
3. Confirme que o banco selecionado é `u304177849_curso`

Sem isso, a conexão externa falha mesmo com usuário e senha corretos.

## Cliente MySQL (linha de comando)

```bash
mysql -h srv1314.hstgr.io -P 3306 -u SEU_USUARIO -p u304177849_curso
```

## GUI (TablePlus, DBeaver, DataGrip)

- Host: `srv1314.hstgr.io`
- Port: `3306`
- Database: `u304177849_curso`
- User / Password: do hPanel
- SSL: geralmente não obrigatório na Hostinger compartilhada (se falhar, teste “Allow public key retrieval”)

## Regras de segurança

- **Nunca** commitar `remote-hostinger.env` nem senhas no repositório
- **Nunca** rodar no remoto: `migrate:fresh`, `db:wipe`, `DROP`, `TRUNCATE` sem autorização explícita
- Preferir **SELECT** e comandos de diagnóstico (`php artisan students:debug-app-access`, etc.) apontando credenciais só quando necessário

## Consultas úteis (exemplos)

```sql
-- Plano sem taxa de matrícula
SELECT cp.id, cp.name, cp.enrollment_fee_amount, c.name AS curso
FROM course_plans cp
JOIN courses c ON c.id = cp.course_id
WHERE cp.enrollment_fee_amount IS NULL;

-- Matrícula por id
SELECT e.*, cp.name AS plano, cp.enrollment_fee_amount
FROM enrollments e
LEFT JOIN course_plans cp ON cp.id = e.course_plan_id
WHERE e.id = 108;
```
