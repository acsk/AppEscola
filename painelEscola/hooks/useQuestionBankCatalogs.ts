import { useCallback, useEffect, useState } from "react";
import {
  fetchActiveExamTypes,
  fetchActiveSubjects,
  fetchCatalog,
  fetchTopics,
} from "../services/questionBank";
import type { CatalogItem, ExamTypeSummary, SubjectSummary, SubjectTopic } from "../types/questionBank";

export type QuestionBankCatalogs = {
  difficulties: CatalogItem[];
  boards: CatalogItem[];
  tags: CatalogItem[];
  subjects: SubjectSummary[];
  examTypes: ExamTypeSummary[];
};

const EMPTY: QuestionBankCatalogs = { difficulties: [], boards: [], tags: [], subjects: [], examTypes: [] };

/** Cadastros usados nos filtros e na classificação. `reload` após cadastrar um item novo. */
export function useQuestionBankCatalogs() {
  const [catalogs, setCatalogs] = useState<QuestionBankCatalogs>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [difficulties, boards, tags, subjects, examTypes] = await Promise.all([
        fetchCatalog("difficulties"),
        fetchCatalog("boards"),
        fetchCatalog("tags"),
        fetchActiveSubjects(),
        fetchActiveExamTypes(),
      ]);
      setCatalogs({ difficulties, boards, tags, subjects, examTypes });
    } catch {
      // Os selects ficam vazios; a tela principal mostra o próprio erro de carregamento.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...catalogs, loading, reload };
}

/** Assuntos da disciplina (lista vazia sem disciplina). */
export function useSubjectTopics(subjectId: number | null) {
  const [topics, setTopics] = useState<SubjectTopic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!subjectId) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchTopics([subjectId])
      .then((items) => !cancelled && setTopics(items))
      .catch(() => !cancelled && setTopics([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  return { topics, loading };
}
