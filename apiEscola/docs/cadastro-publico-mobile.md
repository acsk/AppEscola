# Cadastro Público — Mobile (Pré-matrícula)

Endpoints públicos para o fluxo de "Cadastre-se" no app mobile.  
**Não requerem autenticação.** O tenant é identificado pelo slug na URL.

---

## Base URL

```
https://<dominio>/api/public/{tenant_slug}
```

Exemplo: `https://api.appescola.com.br/api/public/cursinho-exemplo`

---

## 1. Listar cursos disponíveis

Use para popular o campo "Quais cursos deseja cursar?" (multiseleção) no formulário.

**`GET /api/public/{tenant_slug}/courses`**

### Resposta — 200 OK

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": [
    { "id": 2, "name": "Reforço Escolar" },
    { "id": 4, "name": "CPM - PORT/MAT" },
    { "id": 5, "name": "CPM - PORT/MAT - REVISÃO" }
  ]
}
```

### Erros

| Status | Mensagem                  | Quando ocorre              |
|--------|---------------------------|----------------------------|
| 404    | Escola não encontrada.    | `tenant_slug` inválido     |

---

## 2. Cadastrar aluno + responsável

**`POST /api/public/{tenant_slug}/register`**

### Headers

```
Content-Type: application/json
```

### Body

```json
{
  "student": {
    "name":       "João da Silva",           // obrigatório
    "birth_date": "2012-03-15",              // opcional — formato YYYY-MM-DD
    "document":   "123.456.789-00",          // opcional — CPF (com ou sem pontuação)
    "phone":      "(11) 99999-0001",         // opcional
    "is_minor":   true                       // opcional — boolean, default false
  },
  "course_ids": [2, 4],                      // opcional — multiseleção (ids retornados por /courses)
  "course_id": 2,                            // opcional — legado (retrocompatibilidade)
  "guardian": {
    "name":         "Maria da Silva",        // obrigatório
    "document":     "987.654.321-00",        // opcional — CPF do responsável
    "email":        "maria@exemplo.com",     // opcional
    "phone":        "(11) 99999-0002",       // opcional
    "relationship": "mae"                    // opcional — ver tabela abaixo
  }
}
```

#### Valores válidos para `relationship`

| Valor             | Descrição          |
|-------------------|--------------------|
| `pai`             | Pai                |
| `mae`             | Mãe                |
| `avo_paterno`     | Avô paterno        |
| `avo_materno`     | Avó materna        |
| `tio`             | Tio/Tia            |
| `responsavel_legal` | Responsável legal |
| `outro`           | Outro              |

### Resposta — 201 Created

```json
{
  "type": "success",
  "message": "Pré-cadastro realizado com sucesso.",
  "body": {
    "student": {
      "id": 24,
      "enrollment_number": "202600024",
      "name": "JOÃO DA SILVA",
      "status": "inactive",
      "desired_courses": [
        { "id": 4, "name": "CPM - PORT/MAT" },
        { "id": 2, "name": "Reforço Escolar" }
      ]
    },
    "guardian": {
      "id": 17,
      "name": "MARIA DA SILVA",
      "relationship": "mae"
    },
    "message": "Cadastro enviado com sucesso! A escola irá entrar em contato para confirmar a matrícula."
  }
}
```

> **Nota:** o campo `message` dentro de `body` é o texto amigável para exibir ao usuário no app.

### Erros

| Status | Campo             | Mensagem de exemplo                              | Quando ocorre                              |
|--------|-------------------|--------------------------------------------------|--------------------------------------------|
| 404    | —                 | Escola não encontrada.                           | `tenant_slug` inválido                     |
| 422    | `student.name`    | The student.name field is required.              | Nome do aluno não informado                |
| 422    | `student.document`| The student.document has already been taken.     | CPF do aluno já cadastrado nesta escola    |
| 422    | `student.email`   | The student.email has already been taken.        | E-mail do aluno já cadastrado nesta escola |
| 422    | `guardian.name`   | The guardian.name field is required.             | Nome do responsável não informado          |
| 422    | `course_ids`      | The course ids field must be an array.           | `course_ids` enviado fora de formato array |
| 422    | `course_ids.0`    | The selected course ids.0 is invalid.            | Curso não pertence a esta escola           |
| 422    | `course_id`       | The selected course id is invalid.               | Campo legado inválido                      |
| 429    | —                 | Too Many Requests                                | Limite de 30 requisições/minuto atingido   |

#### Formato das mensagens de validação (422)

```json
{
  "message": "The student.name field is required.",
  "errors": {
    "student.name": ["The student.name field is required."]
  }
}
```

---

## Fluxo sugerido no app

```
1. App carrega a tela "Cadastre-se"
2. App chama GET /courses → popula o componente de multiseleção
3. Usuário preenche: dados do aluno + dados do responsável + cursos desejados
4. App chama POST /register
5. Em caso de sucesso (201):
   → Exibe body.message ao usuário
   → Navega para tela de confirmação
6. Em caso de erro 422:
   → Lê errors e exibe cada mensagem abaixo do campo correspondente
```

---

## Comportamentos importantes

- **CPF aceita com ou sem formatação** — `123.456.789-00` e `12345678900` são equivalentes.
- **Responsável reutilizado** — se já existir um responsável com o mesmo CPF na escola, ele é vinculado ao novo aluno sem criar duplicata.
- **Aluno criado como `inactive`** — a escola precisa aprovar e ativar o cadastro antes de criar a matrícula oficial.
- **Matrícula do aluno é gerada no pré-cadastro** — o campo `enrollment_number` já chega preenchido para uso no painel.
- **`course_ids` é informativo** — registra interesse em um ou mais cursos; a matrícula definitiva é criada pelo painel administrativo da escola.
- **Compatibilidade mantida** — `course_id` único ainda é aceito para clientes antigos.

---

## Como passar para o painel (aluno inativo)

Quando chegar um pré-cadastro, o painel deve seguir este fluxo:

1. **Listar pendências**
  - Chamar `GET /api/students?status=inactive`
  - Exibir na fila de aprovação os campos:
    - `enrollment_number`, `name`, `phone`, `is_minor`
    - `desired_courses` (lista de cursos de interesse)
    - `guardians`

2. **Abrir detalhes**
  - Chamar `GET /api/students/{id}`
  - Mostrar os cursos selecionados em `desired_courses`

3. **Aprovar cadastro do aluno**
  - Chamar `PUT /api/students/{id}` com:

```json
{
  "status": "active"
}
```

4. **Efetivar matrícula em turma**
  - Chamar `POST /api/enrollments` (precisa de `school_class_id`):

```json
{
  "student_id": 123,
  "school_class_id": 456,
  "start_date": "2026-05-14",
  "status": "active"
}
```

> O pré-cadastro só informa interesse de curso. A matrícula oficial depende da turma (`school_class_id`) escolhida no painel.
