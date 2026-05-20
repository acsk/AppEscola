import { api } from './api';

export type UserRole = 'admin' | 'super_admin' | 'professor' | 'aluno';

export interface AuthTenant {
  id: number;
  name: string;
  trade_name: string | null;
  corporate_name: string | null;
  slug: string;
  cnpj: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  photo_url: string | null;
  address: string | null;
}

export interface AuthStudent {
  id: number;
  enrollment_number: string | null;
  document: string | null;
  phone: string | null;
}

export interface AuthUser {
  id: number;
  student_id: number | null;
  photo_url: string | null;
  tenant_id: number;
  name: string;
  email: string | null;
  role: UserRole;
  status: string;
  password_change_required: boolean;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
  tenant?: AuthTenant | null;
  student?: AuthStudent | null;
}

export interface LoginResponse {
  token: string;
  password_change_required: boolean;
  user: AuthUser;
}

export interface ApiError {
  message?: string;
  errors?: Record<string, string[]>;
}

export async function loginApi(login: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/api/login', { login, password });
  return data;
}

export async function logoutApi(): Promise<void> {
  await api.post('/api/logout');
}

export async function getMeApi(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/api/me');
  return data;
}
