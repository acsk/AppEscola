# API AppEscola — Guia de Integração Mobile

> **Plataforma:** Laravel 12 + Sanctum · **Auth:** Bearer Token  
> **Base URL (dev):** `http://localhost:4000/api`

---

## Índice

1. [Autenticação](#1-autenticação)
2. [Formato padrão de resposta](#2-formato-padrão-de-resposta)
3. [Simulados — Aluno](#3-simulados--aluno)
4. [Fluxo de realização de simulado](#4-fluxo-de-realização-de-simulado)
5. [Histórico de tentativas](#5-histórico-de-tentativas)
6. [Materiais de Apoio — Simulados](#6-materiais-de-apoio--simulados)
7. [Troca de senha](#7-troca-de-senha)
8. [Navegação por perfil (role)](#8-navegação-por-perfil-role)
9. [Erros comuns](#9-erros-comuns)

---

## 1. Autenticação

### Login

```
POST /api/login
Content-Type: application/json
```

| Campo | Tipo | Descrição |
|---|---|---|
| `login` | string | E-mail (admin/professor) ou número de matrícula (aluno) |
| `password` | string | Senha |

**Exemplos de body:**

```json
// Admin ou Professor
{ "login": "admin@escola.com.br", "password": "suasenha" }

// Aluno
{ "login": "MAT-1-00001", "password": "suasenha" }
```

**Resposta `200`:**

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "token": "1|abc123...",
    "password_change_required": false,
    "user": {
      "id": 2,
      "tenant_id": 1,
      "name": "Admin Escola",
      "email": "admin@escola.com.br",
      "role": "admin",
      "status": "active",
      "password_change_required": false
    }
  }
}
```

> **Atenção:** se `password_change_required: true`, redirecione imediatamente para a tela de troca de senha antes de liberar o app.

---

### Usar o token

Adicione em **todas** as requisições autenticadas:

```
Authorization: Bearer {token}
```

---

### Obter usuário autenticado

```
GET /api/me
Authorization: Bearer {token}
```

Use ao iniciar o app para validar se o token ainda é válido.  
`401` = token expirado → redirecionar para Login.

---

### Logout

```
POST /api/logout
Authorization: Bearer {token}
```

Invalida o token no servidor. Após a chamada, apague o token localmente.

---

## 2. Formato padrão de resposta

Todas as respostas seguem este envelope:

```json
{
  "type": "success" | "error",
  "message": "Descrição da operação",
  "body": { ... } | null
}
```

| `type` | HTTP | Situação |
|---|---|---|
| `success` | 200 | Operação bem-sucedida |
| `success` | 201 | Recurso criado |
| `error` | 400 | Erro genérico |
| `error` | 403 | Sem permissão / matrícula inativa |
| `error` | 404 | Recurso não encontrado |
| `error` | 422 | Dados inválidos — `body.errors` contém os detalhes |

**Exemplo de erro de validação:**

```json
{
  "type": "error",
  "message": "Dados inválidos.",
  "body": {
    "errors": {
      "login": ["Credenciais inválidas."]
    }
  }
}
```

---

## 3. Simulados — Aluno

> Estes endpoints são exclusivos para usuários com `role: "aluno"`.  
> Critérios verificados automaticamente:
> - Aluno com `status: active`
> - Matrícula `status: active` dentro do período (start_date ≤ hoje ≤ end_date)
> - Simulado publicado (`status: published`)
> - Simulado do curso da matrícula ativa
> - **Todos os simulados são retornados, incluindo encerrados** — use `can_start` para saber se ainda é possível iniciar

---

### Listar simulados disponíveis

```
GET /api/aluno/exams
Authorization: Bearer {token}
```

**Resposta `200`:**

```json
{
  "type": "success",
  "message": "Simulados disponíveis.",
  "body": [
    {
      "id": 2,
      "course_id": 4,
      "course": { "id": 4, "name": "CPM - PORT/MAT" },
      "subject_id": 2,
      "subject": {
        "id": 2,
        "name": "Português",
        "icon": "book-open",
        "color": "#10B981"
      },
      "exam_type": "enem",
      "exam_type_label": "ENEM",
      "status": "published",
      "status_label": "Publicado",
      "title": "Simulado ENEM 2026 – Matemática e Linguagens",
      "description": "...",
      "duration_minutes": 90,
      "passing_score": 60.0,
      "starts_at": "2026-05-03T00:00:00.000000Z",
      "ends_at": "2026-05-09T00:00:00.000000Z",
      "attempt_status": "not_started",
      "can_start": true
    }
  ]
}
```

| Campo | Valores possíveis | Descrição |
|---|---|---|
| `attempt_status` | `not_started` \| `in_progress` \| `pending_review` \| `awaiting_release` \| `completed` | Status da tentativa do aluno |
| `can_start` | `true` \| `false` | Se está dentro do período permitido para iniciar |

---

### Detalhes de um simulado (com questões)

```
GET /api/aluno/exams/{id}
Authorization: Bearer {token}
```

Retorna o simulado com as questões e opções. Não exibe o gabarito.
Quando existir tentativa do aluno, cada questão incluirá `student_answer`
com a opção marcada (`option_id`) ou o texto digitado (`text_answer`).

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "id": 2,
    "subject": {
      "id": 2,
      "name": "Português",
      "icon": "book-open",
      "color": "#10B981"
    },
    "title": "Simulado ENEM 2026",
    "attempt_status": "not_started",
    "attempt_id": null,
    "can_start": true,
    "questions": [
      {
        "id": 1,
        "type": "multiple_choice",
        "question_text": "Qual é o valor de x?",
        "image_url": null,
        "points": 1,
        "order": 1,
        "allow_text_answer": false,
        "student_answer": {
          "option_id": 2,
          "text_answer": null
        },
        "options": [
          { "id": 1, "option_text": "x = 0", "order": 1, "triggers_text_input": false },
          { "id": 2, "option_text": "x = 4", "order": 2, "triggers_text_input": false },
          { "id": 3, "option_text": "Outro", "order": 3, "triggers_text_input": true }
        ]
      },
      {
        "id": 2,
        "type": "essay",
        "question_text": "Disserte sobre...",
        "student_answer": {
          "option_id": null,
          "text_answer": "Minha resposta discursiva"
        },
        "options": []
      },
      {
        "id": 3,
        "type": "multiple_choice",
        "question_text": "Questão ainda não respondida",
        "student_answer": null,
        "options": []
      }
    ]
  }
}
```

| Campo | Descrição |
|---|---|
| `student_answer.option_id` | ID da opção marcada pelo aluno (quando aplicável) |
| `student_answer.text_answer` | Texto digitado pelo aluno (discursiva, justificativa ou opção com entrada livre) |
| `student_answer` | `null` quando a questão ainda não foi respondida |

---

## 4. Fluxo de realização de simulado

```
Listar simulados  →  Selecionar  →  Iniciar  →  Responder (loop)  →  Finalizar
GET /aluno/exams     GET /aluno/exams/{id}   POST /exams/{id}/start   POST /exam-attempts/{id}/answer   POST /exam-attempts/{id}/finish
```

---

### Passo 1 — Iniciar tentativa

```
POST /api/exams/{exam_id}/start
Authorization: Bearer {token}
```

> Para alunos, **não é necessário enviar body**. O `student_id` é resolvido automaticamente pelo token.  
> Para admin/professor, enviar `{ "student_id": 5 }` no body.

**Resposta `201`:**

```json
{
  "type": "success",
  "message": "Criado com sucesso.",
  "body": {
    "id": 42,
    "exam_id": 2,
    "student_id": 11,
    "status": "in_progress",
    "started_at": "2026-05-03T20:00:00.000000Z",
    "exam": { "id": 2, "title": "Simulado ENEM 2026" }
  }
}
```

> Guarde o `id` retornado (é o `attempt_id`) para os próximos passos.

**Bloqueios automáticos:**
- Simulado não publicado → `422`
- Tentativa já em andamento → `422` (erro em `exam_id`)
- Antes de `starts_at` → `422`
- Após `ends_at` → `422`

---

### Passo 2 — Enviar resposta

```
POST /api/exam-attempts/{attempt_id}/answer
Authorization: Bearer {token}
Content-Type: application/json
```

**Questão objetiva (opção normal):**
```json
{ "question_id": 1, "option_id": 2 }
```

**Questão objetiva com opção "Outro" (`triggers_text_input: true`):**
```json
{ "question_id": 1, "option_id": 3, "text_answer": "Minha resposta livre" }
```

**Questão objetiva com justificativa obrigatória (`allow_text_answer: true`):**
```json
{ "question_id": 1, "option_id": 2, "text_answer": "Justificativa aqui" }
```

**Questão discursiva (`type: essay`):**
```json
{ "question_id": 9, "text_answer": "Desenvolvimento da resposta..." }
```

Pode ser chamado múltiplas vezes — cada chamada **substitui** a resposta anterior da mesma questão.

---

### Passo 3 — Finalizar simulado

```
POST /api/exam-attempts/{attempt_id}/finish
Authorization: Bearer {token}
```

O `status` retornado determina o que exibir:

| `status` | O que mostrar |
|---|---|
| `"completed"` | Resultado imediato: nota, percentual, se passou ou não |
| `"pending_review"` | Mensagem de aguardo: o professor ainda vai corrigir algumas respostas |
| `"awaiting_release"` | Simulado entregue e corrigido, mas o resultado ainda está bloqueado até o fim do período |

**Resposta `200` — resultado imediato (`status: "completed"`):**

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "id": 42,
    "status": "completed",
    "score": 8.0,
    "max_score": 10.0,
    "percentage": 80.0,
    "passed": true,
    "finished_at": "2026-05-03T21:30:00.000000Z"
  }
}
```

**Resposta `200` — aguardando correção (`status: "pending_review"`):**

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "id": 42,
    "status": "pending_review",
    "score": null,
    "max_score": 10.0,
    "percentage": null,
    "pending_answers_count": 2,
    "passed": null,
    "finished_at": "2026-05-03T21:30:00.000000Z"
  }
}
```

> Exibir mensagem: *"Seu simulado foi entregue! Algumas respostas serão corrigidas pelo professor. Você será notificado quando o resultado estiver disponível."*

| Campo | Descrição |
|---|---|
| `score` | Pontuação obtida (`null` enquanto `pending_review`) |
| `max_score` | Pontuação máxima possível |
| `percentage` | `score / max_score * 100` (`null` enquanto `pending_review` ou `awaiting_release`) |
| `passed` | `true` se aprovado — só presente quando `status = "completed"` |
| `pending_answers_count` | Quantas respostas aguardam correção — só presente quando `status = "pending_review"` |

> Quando o simulado estiver configurado com `release_results_after_end: true`, o backend pode retornar `status: "awaiting_release"` até `ends_at` ser atingido. Nesse caso, mantenha a UI em modo de aguardo e consulte `GET /api/exam-attempts/{id}` depois.

**Como verificar o resultado depois:**
Chame `GET /api/exam-attempts/{id}` periodicamente (ou ao abrir o histórico) para checar se o status mudou para `"completed"`.

---

## 5. Histórico de tentativas

Lista todas as tentativas do aluno autenticado (em andamento, concluídas, etc.).

```
GET /api/aluno/attempts
Authorization: Bearer {token}
```

**Query params (opcionais):**

| Parâmetro | Valores | Descrição |
|---|---|---|
| `status` | `in_progress` \| `pending_review` \| `awaiting_release` \| `completed` \| `abandoned` | Filtra por status da tentativa |

**Resposta `200`:**

```json
{
  "type": "success",
  "message": "Operação realizada com sucesso.",
  "body": {
    "data": [
      {
        "id": 42,
        "exam_id": 2,
        "exam": {
          "id": 2,
          "title": "Simulado ENEM 2026 – Matemática e Linguagens",
          "duration_minutes": 90,
          "passing_score": 60.0,
          "exam_type": "enem",
          "exam_type_label": "ENEM",
          "status": "published",
          "subject": {
            "id": 2,
            "name": "Português",
            "icon": "book-open",
            "color": "#10B981"
          }
        },
        "started_at": "2026-05-03T20:00:00.000000Z",
        "finished_at": "2026-05-03T21:30:00.000000Z",
        "status": "completed",
        "score": 8.0,
        "max_score": 10.0,
        "percentage": 80.0,
        "passed": true
      },
      {
        "id": 45,
        "exam_id": 3,
        "exam": {
          "id": 3,
          "title": "Simulado Fuvest 2026",
          "subject": {
            "id": 1,
            "name": "Matemática",
            "icon": "calculator",
            "color": "#3B82F6"
          }
        },
        "started_at": "2026-05-04T10:00:00.000000Z",
        "finished_at": null,
        "status": "in_progress",
        "score": null,
        "max_score": 10.0,
        "percentage": null,
        "passed": null
      }
    ],
    "links": { "...": "paginação" },
    "meta": { "current_page": 1, "last_page": 1, "total": 2 }
  }
}
```

| Campo | Descrição |
|---|---|
| `status` | `in_progress` = em andamento · `pending_review` = aguardando correção manual · `awaiting_release` = aguardando liberação do resultado · `completed` = finalizado |
| `score` | `null` enquanto `in_progress`, `pending_review` ou `awaiting_release` |
| `passed` | `null` enquanto `in_progress`, `pending_review`, `awaiting_release` ou simulado sem `passing_score` |
| `percentage` | `null` enquanto `in_progress`, `pending_review` ou `awaiting_release` |

> Se o aluno tiver uma tentativa `in_progress`, use o `id` dela para continuar via `POST /api/exam-attempts/{id}/answer`.  
> Se tiver uma tentativa `pending_review` ou `awaiting_release`, exibir aviso de que o resultado ainda não foi liberado.

### Revisão de tentativa (respondido + corrigido)

Use este endpoint para o aluno acompanhar o que respondeu e como foi corrigido por questão.

```
GET /api/aluno/attempts/{attempt_id}/review
Authorization: Bearer {token}
```

Regras:
- Só o próprio aluno dono da tentativa pode acessar
- Se a tentativa ainda estiver `in_progress`, retorna `422`
- Para `pending_review`, o retorno traz correções parciais
- Para `awaiting_release`, o retorno traz as questões e respostas do aluno, mas sem gabarito, sem nota por questão e sem correção
- Para `completed`, retorna correção completa, incluindo alternativa correta em questões objetivas

**Resposta `200` (exemplo resumido):**

```json
{
  "type": "success",
  "message": "Tentativa carregada com sucesso.",
  "body": {
    "id": 42,
    "status": "completed",
    "score": 8.0,
    "max_score": 10.0,
    "percentage": 80.0,
    "passed": true,
    "exam": {
      "id": 2,
      "title": "Simulado ENEM 2026"
    },
    "questions": [
      {
        "id": 1,
        "type": "multiple_choice",
        "question_text": "Qual é o valor de x?",
        "student_answer": {
          "option_id": 2,
          "text_answer": null
        },
        "correction": {
          "is_correct": true,
          "points_earned": 1.0,
          "max_points": 1.0,
          "correct_option_id": 2
        },
        "options": [
          {
            "id": 2,
            "option_text": "x = 4",
            "selected": true,
            "is_correct": true
          }
        ]
      }
    ]
  }
}
```

**Resposta `200` — aguardando liberação (`status: "awaiting_release"`):**

```json
{
  "type": "success",
  "message": "Tentativa carregada com sucesso.",
  "body": {
    "id": 42,
    "status": "awaiting_release",
    "score": null,
    "max_score": 10.0,
    "percentage": null,
    "passed": null,
    "exam": {
      "id": 2,
      "title": "Simulado ENEM 2026"
    },
    "questions": [
      {
        "id": 1,
        "type": "multiple_choice",
        "question_text": "Qual é o valor de x?",
        "student_answer": {
          "option_id": 2,
          "text_answer": null
        },
        "correction": null,
        "options": [
          {
            "id": 2,
            "option_text": "x = 4",
            "selected": true,
            "is_correct": null
          }
        ]
      }
    ]
  }
}
```

---

## 6. Materiais de Apoio — Simulados

Recursos (links, PDFs, imagens, vídeos) associados a um simulado para que o aluno possa estudar ou consultar durante a realização.

### Listar materiais de um simulado

```
GET /api/exams/{exam_id}/support-materials
Authorization: Bearer {token}
```

**Resposta `200`:**

```json
{
  "type": "success",
  "message": "Materiais carregados com sucesso.",
  "body": [
    {
      "id": 1,
      "exam_id": 2,
      "title": "Vídeo de Introdução",
      "description": "Explicação completa do conteúdo",
      "type": "link",
      "content": "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "file_type": null,
      "file_size": null,
      "created_at": "2026-05-09T15:30:00Z"
    },
    {
      "id": 2,
      "exam_id": 2,
      "title": "Resumo em PDF",
      "description": "Conteúdo resumido",
      "type": "file",
      "content": "https://app.localhost/storage/tenant_id/support-materials/2/resumo.pdf",
      "file_type": "pdf",
      "file_size": 2048576,
      "created_at": "2026-05-09T15:35:00Z"
    },
    {
      "id": 3,
      "exam_id": 2,
      "title": "Vídeo Complementar",
      "description": null,
      "type": "file",
      "content": "https://app.localhost/storage/tenant_id/support-materials/2/video.mp4",
      "file_type": "video",
      "file_size": 104857600,
      "created_at": "2026-05-09T16:00:00Z"
    }
  ]
}
```

| Campo | Descrição |
|---|---|
| `type` | `"link"` = URL externa · `"file"` = arquivo do servidor |
| `content` | URL completa (para links) ou caminho de acesso (para arquivos) |
| `file_type` | `"pdf"` · `"image"` · `"video"` · `"document"` — `null` para links |
| `file_size` | Tamanho em bytes — `null` para links |

### Renderização no mobile

**Para `type: "link"`:**
```tsx
// Abrir link em navegador/webview
if (material.type === 'link') {
  Linking.openURL(material.content);
}
```

**Para `type: "file"`:**
```tsx
// Renderizar player ou visualizador conforme file_type
switch (material.file_type) {
  case 'pdf':
    // → renderizar com WebView ou PDFView
    // → usar WebView se não há biblioteca nativa
    break;
  case 'image':
    // → renderizar com Image
    break;
  case 'video':
    // → renderizar com Video player (expo-av, react-native-video, etc.)
    break;
  case 'document':
    // → abrir com app nativo (Sharing.shareAsync)
    break;
}
```

### Tipos TypeScript (DTO)

```ts
export type SupportMaterialType = 'link' | 'file';
export type SupportMaterialFileType = 'pdf' | 'image' | 'video' | 'document' | null;

export interface SupportMaterial {
  id: number;
  exam_id: number;
  title: string;
  description: string | null;
  type: SupportMaterialType;
  content: string;
  file_type: SupportMaterialFileType;
  file_size: number | null;
  created_at: string;
  updated_at?: string;
}

export interface ApiSuccess<T> {
  type: 'success';
  message: string;
  body: T;
}
```

### Service de API (React Native)

```ts
import api from './api';
import { ApiSuccess, SupportMaterial } from '../types/support-material';

export async function getExamSupportMaterials(examId: number): Promise<SupportMaterial[]> {
  const { data } = await api.get<ApiSuccess<SupportMaterial[]>>(`/exams/${examId}/support-materials`);
  return data.body ?? [];
}
```

### Exemplo de tela pronta (React Native)

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Video } from 'expo-av';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { getExamSupportMaterials } from '../services/support-material.service';
import { SupportMaterial } from '../types/support-material';

type Props = { examId: number };

export default function SupportMaterialsScreen({ examId }: Props) {
  const [materials, setMaterials] = useState<SupportMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getExamSupportMaterials(examId);
      setMaterials(list);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const renderMaterial = ({ item }: { item: SupportMaterial }) => (
    <View style={styles.card}>
      <Text style={styles.title}>{item.title}</Text>
      {!!item.description && <Text style={styles.description}>{item.description}</Text>}

      {item.type === 'link' ? (
        <TouchableOpacity style={styles.button} onPress={() => Linking.openURL(item.content)}>
          <Text style={styles.buttonText}>Abrir link</Text>
        </TouchableOpacity>
      ) : (
        <View>
          {item.file_type === 'video' && (
            <Video
              source={{ uri: item.content }}
              resizeMode="contain"
              useNativeControls
              style={styles.video}
            />
          )}

          {item.file_type === 'pdf' && <WebView source={{ uri: item.content }} style={styles.pdf} />}

          {item.file_type === 'image' && <Image source={{ uri: item.content }} style={styles.image} />}

          {item.file_type === 'document' && (
            <TouchableOpacity style={styles.button} onPress={() => Sharing.shareAsync(item.content)}>
              <Text style={styles.buttonText}>Baixar arquivo</Text>
            </TouchableOpacity>
          )}

          {item.file_size !== null && (
            <Text style={styles.fileInfo}>{(item.file_size / 1024 / 1024).toFixed(2)} MB</Text>
          )}
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      data={materials}
      keyExtractor={(item) => String(item.id)}
      renderItem={renderMaterial}
      refreshing={loading}
      onRefresh={fetchMaterials}
      ListEmptyComponent={<Text style={styles.empty}>Sem materiais de apoio para este simulado.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', padding: 12, marginVertical: 8, borderRadius: 8 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 14, color: '#666', marginBottom: 8 },
  button: { backgroundColor: '#3B82F6', padding: 10, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  video: { height: 240, marginVertical: 8, borderRadius: 6 },
  pdf: { height: 320, borderRadius: 6 },
  image: { height: 220, borderRadius: 6, marginVertical: 8 },
  fileInfo: { fontSize: 12, color: '#999', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 20 },
});
```

---

## 7. Troca de senha

```
POST /api/me/password
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "current_password": "senhaAtual",
  "password": "novaSenha123",
  "password_confirmation": "novaSenha123"
}
```

**Regras:**
- Nova senha: mínimo 8 caracteres
- Após sucesso, `password_change_required` é definido como `false` automaticamente

---

## 8. Navegação por perfil (role)

Após o login, use `user.role` para definir a navegação:

| `role` | Stack | Como faz login |
|---|---|---|
| `admin` | AdminStack | E-mail |
| `professor` | ProfessorStack | E-mail *(a ser liberado pelo backend)* |
| `aluno` | AlunoStack | Número de matrícula |
| `super_admin` | Não expor no app | E-mail |

**Fluxo de inicialização do app:**

```
App inicia
  └─ tem token salvo?
       não → tela de Login
       sim → GET /api/me
               401 → apagar token → Login
               200 → role?
                       admin  → AdminStack
                       aluno  → AlunoStack
                       ...
               200 + password_change_required: true → ChangePassword
```

---

## 9. Erros comuns

| Código | Causa | Ação |
|---|---|---|
| `401` | Token ausente ou expirado | Apagar token e redirecionar para Login |
| `403` | Matrícula inativa, aluno inativo ou tenant errado | Exibir mensagem de `body.message` |
| `404` | Simulado não encontrado ou sem acesso | Exibir tela de erro |
| `422` | Dados inválidos ou regra de negócio | Exibir `body.errors` no formulário |

**Interceptor global recomendado (Axios):**

```ts
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
    return Promise.reject(error);
  }
);
```
