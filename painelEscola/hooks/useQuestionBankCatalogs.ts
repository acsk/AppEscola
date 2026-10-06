import { useCallback, useEffect, useState } from "react";
import {
  fetchActiveExamTypes,
  fetchCatalog,
  fetchTaxonomy,
  fetchTopics,
} from "../services/questionBank";
import type { CatalogItem, ExamTypeSummary, SubjectSummary, SubjectTopic, TaxonomySubject } from "../types/questionBank";

export type QuestionBankCatalogs = {
  difficulties: CatalogItem[];
  boards: CatalogItem[];
  tags: CatalogItem[];
  subjects: SubjectSummary[];
  /** Disciplinas com assuntos aninhados (fonte dos selects de disciplina/assunto). */
  taxonomy: TaxonomySubject[];
  examTypes: ExamTypeSummary[];
};

const EMPTY: QuestionBankCatalogs = { difficulties: [], boards: [], tags: [], subjects: [], taxonomy: [], examTypes: [] };

/** Cadastros usados nos filtros e na classificação. `reload` após cadastrar um item novo. */
export function useQuestionBankCatalogs() {
  const [catalogs, setCatalogs] = useState<QuestionBankCatalogs>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [difficulties, boards, tags, taxonomy, examTypes] = await Promise.all([
        fetchCatalog("difficulties"),
        fetchCatalog("boards"),
        fetchCatalog("tags"),
        fetchTaxonomy(),
        fetchActiveExamTypes(),
      ]);
      const subjects = taxonomy.map(({ id, name }) => ({ id, name }));
      setCatalogs({ difficulties, boards, tags, subjects, taxonomy, examTypes });
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
