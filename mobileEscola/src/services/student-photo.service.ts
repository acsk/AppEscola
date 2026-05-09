import { BASE_URL } from './api';
import { storage, STORAGE_KEYS } from './storage';

export interface UploadStudentPhotoParams {
  studentId: number;
  uri: string;
  fileName?: string;
  mimeType?: string;
}

export interface UploadStudentPhotoBody {
  student_id: number;
  photo_url: string;
  path: string;
}

export interface UploadStudentPhotoResponse {
  type?: string;
  message: string;
  body: UploadStudentPhotoBody;
}

/**
 * Faz upload da foto do aluno via fetch (não axios) para garantir que o
 * Content-Type multipart/form-data com boundary seja definido automaticamente
 * pelo cliente HTTP nativo, conforme a documentação da API.
 */
export async function uploadStudentPhoto(
  params: UploadStudentPhotoParams
): Promise<UploadStudentPhotoResponse> {
  const token = await storage.getItem(STORAGE_KEYS.TOKEN);
  console.log('[uploadStudentPhoto] iniciando', { studentId: params.studentId, uri: params.uri.slice(0, 60), hasToken: !!token, BASE_URL });

  const form = new FormData();

  // No web, params.uri pode ser um objectURL (blob:...). Convertemos em File real.
  // No mobile nativo, params.uri é um caminho file:// e o RN aceita o objeto {uri,name,type}.
  if (typeof window !== 'undefined' && params.uri.startsWith('blob:')) {
    const blob = await fetch(params.uri).then((r) => r.blob());
    const file = new File([blob], params.fileName ?? `student-${params.studentId}.jpg`, {
      type: params.mimeType ?? blob.type ?? 'image/jpeg',
    });
    console.log('[uploadStudentPhoto] File web criado', { name: file.name, size: file.size, type: file.type });
    form.append('photo', file);
  } else {
    console.log('[uploadStudentPhoto] FormData nativo', params);
    form.append('photo', {
      uri: params.uri,
      name: params.fileName ?? `student-${params.studentId}.jpg`,
      type: params.mimeType ?? 'image/jpeg',
    } as any);
  }

  const url = `${BASE_URL}/api/students/${params.studentId}/upload-photo`;
  console.log('[uploadStudentPhoto] POST', url);

  // Não definir Content-Type — o fetch define automaticamente com boundary.
  // Não enviar Cache-Control, Pragma, Expires para evitar preflight CORS.
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      Accept: 'application/json',
    },
    body: form,
  });
  console.log('[uploadStudentPhoto] resposta', response.status, response.statusText);

  let responseBody: any;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = {};
  }

  if (!response.ok) {
    const err = new Error(
      responseBody?.message ?? responseBody?.error ?? `Erro HTTP ${response.status}`
    );
    (err as any).response = { status: response.status, data: responseBody };
    throw err;
  }

  return responseBody as UploadStudentPhotoResponse;
}
