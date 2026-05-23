import { api } from './api';
import type { SimuladoSubject } from './simulados.service';

export type PastExamType = 'link' | 'file';
export type PastExamFileType = 'pdf' | 'image' | 'document' | null;

export interface PastExamListItem {
  id: number;
  title: string;
  description: string | null;
  exam_year: number | null;
  exam_type: string | null;
  exam_type_label: string | null;
  type: PastExamType;
  content: string;
  file_type: PastExamFileType;
  file_size: number | null;
  subject: SimuladoSubject | null;
  course: { id: number; name: string } | null;
}

interface ApiEnvelope<T> {
  type?: 'success' | 'error';
  message?: string;
  body?: T;
}

function unwrapBody<T>(payload: T | ApiEnvelope<T>): T {
  const maybeEnvelope = payload as ApiEnvelope<T>;
  if (maybeEnvelope && typeof maybeEnvelope === 'object' && 'body' in maybeEnvelope) {
    return (maybeEnvelope.body ?? ([] as unknown as T)) as T;
  }
  return payload as T;
}

export interface PastExamsListFilters {
  search?: string;
  subject_id?: number;
  exam_year?: number;
  exam_type?: string;
}

export async function listarProvasAnteriores(
  filters?: PastExamsListFilters,
): Promise<PastExamListItem[]> {
  const params: Record<string, string | number> = {};
  if (filters?.search?.trim()) params.search = filters.search.trim();
  if (filters?.subject_id != null) params.subject_id = filters.subject_id;
  if (filters?.exam_year != null) params.exam_year = filters.exam_year;
  if (filters?.exam_type) params.exam_type = filters.exam_type;

  const { data } = await api.get<PastExamListItem[] | ApiEnvelope<PastExamListItem[]>>(
    '/api/aluno/past-exams',
    { params: Object.keys(params).length > 0 ? params : undefined },
  );
  const parsed = unwrapBody<PastExamListItem[]>(data);
  return Array.isArray(parsed) ? parsed : [];
}

export async function detalharProvaAnterior(id: number): Promise<PastExamListItem> {
  const { data } = await api.get<PastExamListItem | ApiEnvelope<PastExamListItem>>(
    `/api/aluno/past-exams/${id}`,
  );
  return unwrapBody<PastExamListItem>(data);
}

export function extrairDisciplinasDasProvas(
  items: PastExamListItem[],
): SimuladoSubject[] {
  const map = new Map<number, SimuladoSubject>();
  for (const item of items) {
    if (item.subject) {
      map.set(item.subject.id, item.subject);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function extrairAnosDasProvas(items: PastExamListItem[]): number[] {
  const anos = new Set<number>();
  for (const item of items) {
    if (item.exam_year != null) {
      anos.add(item.exam_year);
    }
  }
  return Array.from(anos).sort((a, b) => b - a);
}
