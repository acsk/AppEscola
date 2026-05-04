import { api } from './api';

export type UserRole = 'admin' | 'super_admin' | 'professor' | 'aluno';

export interface AuthUser {
  id: number;
  student_id: number | null;
  tenant_id: number;
  name: string;
  email: string | null;
  role: UserRole;
  status: string;
  password_change_required: boolean;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
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
