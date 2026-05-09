# Uploads - Painel Web e App Mobile

Guia rapido para integrar os dois uploads da API:

- Foto de aluno
- Imagem de enunciado de questao

Base URL de exemplo: http://localhost:4000/api

Autenticacao: todas as rotas exigem Bearer Token.

## Endpoints

| Metodo | Endpoint | Uso |
|---|---|---|
| POST | /api/students/{student}/upload-photo | Upload da foto do aluno |
| POST | /api/exams/{exam}/questions/upload-image | Upload da imagem da questao |

## Regras de arquivo

- Tipos aceitos: jpg, jpeg, png, webp
- Questao aceita tambem: gif
- Tamanho maximo: 5MB
- Formato da requisicao: multipart/form-data

## Importante para web e mobile

- Envie arquivo em FormData.
- Nao force manualmente o header Content-Type.
- Deixe o cliente HTTP definir o boundary automaticamente.
- Evite enviar headers de cache na requisicao (Cache-Control, Pragma, Expires) para nao quebrar preflight CORS.

---

## 1) Upload de foto do aluno

### Requisicao

POST /api/students/{student}/upload-photo

Campos multipart:

- photo: arquivo de imagem (obrigatorio)

### Resposta esperada

```json
{
  "type": "success",
  "message": "Foto enviada com sucesso.",
  "body": {
    "student_id": 12,
    "photo_url": "http://localhost:4000/storage/exam-questions/1/students/12/foto.png",
    "path": "exam-questions/1/students/12/foto.png"
  }
}
```

### Persistencia

Depois do upload, os endpoints abaixo retornam photo_url:

- GET /api/students
- GET /api/students/{id}

---

## 2) Upload de imagem da questao

### Requisicao

POST /api/exams/{exam}/questions/upload-image

Campos multipart:

- image: arquivo de imagem (obrigatorio)
- question_id: inteiro (opcional)

### Regra de pasta

- Se enviar question_id: base_path/{tenant_id}/{exam_id}/{question_id}
- Se nao enviar: base_path/{tenant_id}/{exam_id}/draft

### Resposta esperada

```json
{
  "message": "Imagem enviada com sucesso.",
  "image_url": "http://localhost:4000/storage/exam-questions/1/8/31/arquivo.png",
  "path": "exam-questions/1/8/31/arquivo.png"
}
```

### Uso no cadastro/edicao da questao

Use image_url no body de:

- POST /api/exams/{exam}/questions
- PUT /api/exams/{exam}/questions/{question}

---

## Exemplo Web (fetch)

```javascript
async function uploadStudentPhoto(studentId, file, token) {
  const form = new FormData();
  form.append('photo', file);

  const response = await fetch(`/api/students/${studentId}/upload-photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!response.ok) {
    const err = await response.json();
    throw err;
  }

  return response.json();
}
```

```javascript
async function uploadQuestionImage(examId, file, token, questionId) {
  const form = new FormData();
  form.append('image', file);
  if (questionId) form.append('question_id', String(questionId));

  const response = await fetch(`/api/exams/${examId}/questions/upload-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  if (!response.ok) {
    const err = await response.json();
    throw err;
  }

  return response.json();
}
```

---

## Exemplo Mobile (React Native com axios)

```javascript
import axios from 'axios';

export async function uploadStudentPhotoMobile(studentId, uri, token) {
  const form = new FormData();

  form.append('photo', {
    uri,
    type: 'image/jpeg',
    name: 'photo.jpg',
  });

  const { data } = await axios.post(
    `/api/students/${studentId}/upload-photo`,
    form,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data;
}
```

```javascript
import axios from 'axios';

export async function uploadQuestionImageMobile(examId, uri, token, questionId) {
  const form = new FormData();

  form.append('image', {
    uri,
    type: 'image/jpeg',
    name: 'question.jpg',
  });

  if (questionId) {
    form.append('question_id', String(questionId));
  }

  const { data } = await axios.post(
    `/api/exams/${examId}/questions/upload-image`,
    form,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return data;
}
```

---

## Erros comuns

### 422 com validation.required em image/photo

Causa mais comum: arquivo nao foi enviado em FormData correto.

Checklist:

- Campo do arquivo com o nome certo (photo ou image)
- Nao enviar JSON no body
- Nao setar Content-Type manualmente

### 404 na URL retornada

Checklist backend:

- storage link criado
- APP_URL correto
- permissao de leitura no storage

---

## Checklist rapido de homologacao

1. Upload de foto do aluno retorna 200.
2. photo_url abre no navegador.
3. GET /api/students/{id} retorna photo_url preenchido.
4. Upload de imagem de questao retorna 201.
5. image_url abre no navegador.
6. Questao salva com image_url no POST/PUT.
