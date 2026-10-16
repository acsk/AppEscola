import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Tabs from "../ui/Tabs";
import SearchableSelect, { type SearchableOption } from "../ui/SearchableSelect";
import SimilarQuestionsModal, { type SimilarSource } from "./SimilarQuestionsModal";
import type { QuestionBankCatalogs } from "../../hooks/useQuestionBankCatalogs";
import api from "../../services/api";
import {
  fetchMissedQuestionBrief,
  type MissedQuestionBrief,
  type MissedQuestionRow,
  type MissedQuestionScope,
} from "../../services/missedQuestions";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { color } from "../../constants/theme";

type Toast = { visible: boolean; type: "success" | "error"; message: string };

type Props = {
  visible: boolean;
  catalogs: QuestionBankCatalogs;
  onClose: () => void;
  onCreated: (count: number) => void;
  setToast: (toast: Toast) => void;
  ensureAi: () => Promise<string | null>;
};

const pct = (value: number | null) =>
  value == null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default function MissedQuestionsBriefModal({ visible, catalogs, onClose, onCreated, setToast, ensureAi }: Props) {
  const [scope, setScope] = useState<MissedQuestionScope>("collective");
  const [student, setStudent] = useState<SearchableOption | null>(null);
  const [brief, setBrief] = useState<MissedQuestionBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SimilarSource | null>(null);
  const studentHits = useRef<SearchableOption[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (scope === "student" && !student) {
      setBrief(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMissedQuestionBrief({
      scope,
      student_id: scope === "student" && student ? Number(student.value) : undefined,
    })
      .then((data) => {
        if (!cancelled) setBrief(data);
      })
      .catch((cause) => {
        if (!cancelled) {
          setBrief(null);
          setError(getApiErrorMessage(cause, "Não foi possível montar o resumo dos erros."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, scope, student]);

  const searchStudents = async (query: string): Promise<SearchableOption[]> => {
    const { data } = await api.get("/students", {
      params: { status: "active", search: query.trim() || undefined, per_page: 20 },
    });
    const list = Array.isArray(data?.data) ? data.data : [];
    const options = list.map((item: { id: number; name: string; enrollment_number?: string | null }) => ({
      value: String(item.id),
      label: item.name,
      sublabel: item.enrollment_number ?? undefined,
    }));
    studentHits.current = options;
    return options;
  };

  const copySummary = async () => {
    if (!brief?.summary || typeof navigator === "undefined" || !navigator.clipboard) {
      setToast({ visible: true, type: "error", message: "Não foi possível copiar o resumo neste navegador." });
      return;
    }
    try {
      await navigator.clipboard.writeText(brief.summary);
      setToast({ visible: true, type: "success", message: "Resumo copiado." });
    } catch {
      setToast({ visible: true, type: "error", message: "Não foi possível copiar o resumo." });
    }
  };

  const generate = async (row: MissedQuestionRow) => {
    const blocked = await ensureAi();
    if (blocked) {
      setToast({ visible: true, type: "error", message: blocked });
      return;
    }
    setSource({
      id: row.id,
      type: row.type,
      optionsCount: row.options_count || 5,
      difficultyId: row.difficulty_id,
      imageUrl: row.image_url,
      initialInstructions: row.generation_note,
    });
  };

  return (
    <>
      <Modal visible={visible && source === null} title="Resumo dos erros" onClose={onClose} size="xl">
        <View style={{ gap: 16 }}>
          <Text className="text-sm text-ink-muted">
            As questões que os alunos mais erram, no conjunto da escola ou de um aluno. O resumo descreve a habilidade para criar questões novas.
          </Text>
          <Tabs
            accessibilityLabel="Alcance do resumo"
            items={[
              { id: "collective", label: "Coletivo" },
              { id: "student", label: "Por aluno" },
            ]}
            value={scope}
            onChange={(id) => {
              setScope(id);
              if (id === "collective") setStudent(null);
            }}
          />
          {scope === "student" ? (
            <SearchableSelect
              label="Aluno"
              placeholder="Buscar por nome ou matrícula"
              modalTitle="Escolher aluno"
              options={[]}
              value={student?.value}
              selectedOption={student ?? undefined}
              onSearch={searchStudents}
              onChange={(value) => {
                setStudent(studentHits.current.find((item) => item.value === value) ?? { value, label: value });
              }}
            />
          ) : null}
          {scope === "student" && !student ? (
            <Text className="text-sm text-ink-muted">Escolha um aluno para ver as questões que ele mais errou.</Text>
          ) : null}
          {loading ? <ActivityIndicator color={color.brand} /> : null}
          {error ? <Text className="text-sm text-danger">{error}</Text> : null}
          {brief && !loading ? (
            <View style={{ gap: 16 }}>
              <View className="bg-surface-sunken border border-border rounded-ds-md" style={{ padding: 12, gap: 8 }}>
                <View className="flex-row items-center justify-between" style={{ gap: 8 }}>
                  <Text className="text-sm font-semibold text-ink">Resumo para gerar questões</Text>
                  <Button size="sm" variant="secondary" label="Copiar" onPress={() => void copySummary()} />
                </View>
                <Text className="text-sm text-ink" style={{ lineHeight: 20 }}>{brief.summary}</Text>
              </View>
              {brief.questions.map((row) => (
                <View key={row.id} className="border border-border rounded-ds-md" style={{ padding: 12, gap: 8 }}>
                  <View className="flex-row flex-wrap items-start justify-between" style={{ gap: 12 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text className="text-sm font-semibold text-ink">
                        #{row.id}
                        {row.subject ? ` · ${row.subject}` : ""}
                        {row.topics.length ? ` — ${row.topics.join(", ")}` : ""}
                      </Text>
                      <Text className="text-sm text-ink">{row.snippet}</Text>
                      <Text className="text-xs text-ink-muted">
                        {row.wrong_count} {row.wrong_count === 1 ? "erro" : "erros"} em {row.answer_count}{" "}
                        {row.answer_count === 1 ? "resposta" : "respostas"} ({pct(row.error_rate)})
                        {row.students_wrong > 1 ? ` · ${row.students_wrong} alunos` : ""}
                        {row.difficulty ? ` · ${row.difficulty}` : ""}
                      </Text>
                    </View>
                    <Button size="sm" variant="ai" icon={Sparkles} label="Gerar questões" onPress={() => void generate(row)} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Modal>
      <SimilarQuestionsModal
        visible={source !== null}
        source={source}
        catalogs={catalogs}
        onClose={() => setSource(null)}
        onCreated={(count) => {
          setSource(null);
          onCreated(count);
        }}
        setToast={setToast}
      />
    </>
  );
}
