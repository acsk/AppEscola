import axios, { AxiosError } from 'axios';
import { BASE_URL } from './api';

export interface PublicApiResponse<T> {
  type: 'success' | 'error';
  message: string;
  body?: T;
}

export interface PublicCourse {
  id: number;
  name: string;
}

export interface PublicRegisterStudentInput {
  name: string;
  email?: string;
  birth_date?: string;
  document?: string;
  phone?: string;
  is_minor?: boolean;
}

export interface PublicRegisterGuardianInput {
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  relationship?: PublicGuardianRelationship;
}

export type PublicGuardianRelationship =
  | 'pai'
  | 'mae'
  | 'avo_paterno'
  | 'avo_materno'
  | 'tio'
  | 'responsavel_legal'
  | 'outro';

export interface PublicRegisterRequest {
  student: PublicRegisterStudentInput;
  course_ids?: number[];
  course_id?: number;
  guardian: PublicRegisterGuardianInput;
}

export interface PublicRegisterSuccessBody {
  student: {
    id: number;
    name: string;
    status: string;
    desired_course_id: number | null;
    desired_course_ids?: number[];
    desired_course?: {
      id: number;
      name: string;
    } | null;
    desired_courses?: Array<{
      id: number;
      name: string;
    }>;
  };
  guardian: {
    id: number;
    name: string;
    relationship: string | null;
  };
  message: string;
}

export interface PublicValidationErrorResponse {
  message: string;
  errors?: Record<string, string[]>;
}

const configuredSlug = (process.env.EXPO_PUBLIC_TENANT_SLUG || process.env.EXPO_PUBLIC_TENANT || '').trim();

export function getPublicTenantSlug(): string {
  if (!configuredSlug) {
    throw new Error('Tenant não configurado. Defina EXPO_PUBLIC_TENANT_SLUG no app.');
  }
  return configuredSlug;
}

function createPublicApi(tenantSlug: string) {
  const sanitizedBase = BASE_URL.replace(/\/$/, '');
  const encodedSlug = encodeURIComponent(tenantSlug.trim());

  return axios.create({
    baseURL: `${sanitizedBase}/api/public/${encodedSlug}`,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
}

export async function listPublicCourses(tenantSlug = getPublicTenantSlug()): Promise<PublicCourse[]> {
  const api = createPublicApi(tenantSlug);
  const { data } = await api.get<PublicApiResponse<PublicCourse[]>>('/courses');

  if (data.type === 'error') {
    throw new Error(data.message || 'Não foi possível carregar os cursos.');
  }

  return data.body ?? [];
}

export async function registerPublicStudent(
  payload: PublicRegisterRequest,
  tenantSlug = getPublicTenantSlug(),
): Promise<PublicRegisterSuccessBody> {
  const api = createPublicApi(tenantSlug);
  const { data } = await api.post<PublicApiResponse<PublicRegisterSuccessBody>>('/register', payload);

  if (data.type === 'error') {
    throw new Error(data.message || 'Não foi possível enviar o pré-cadastro.');
  }

  if (!data.body) {
    throw new Error('Resposta inválida da API de pré-cadastro.');
  }

  return data.body;
}

export function extractPublicValidationErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error)) return {};

  const axiosError = error as AxiosError<PublicValidationErrorResponse>;
  const map = axiosError.response?.data?.errors;
  if (!map) return {};

  const result: Record<string, string> = {};
  Object.entries(map).forEach(([field, messages]) => {
    if (Array.isArray(messages) && messages[0]) {
      result[field] = messages[0];
    }
  });

  return result;
}
