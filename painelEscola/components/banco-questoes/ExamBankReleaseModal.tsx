import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { getApiErrorMessage } from "../../utils/apiErrors";
import {
  fetchExamTopicRelease,
  saveExamTopicRelease,
  type ExamTopicRelease,
} from "../../services/questionBank";

type Props = {
  visible: boolean;
  examId: number | null;
  mode: "ask" | "edit";
  onClose: () => void;
  onSaved: (message: string) => void;
};

/** Pergunta, na publicação, se os assuntos do simulado oficial liberam questões extras do banco. */
export default function ExamBankReleaseModal({ visible, examId, mode, onClose, onSaved }: Props) {
  const [data, setData] = useState<ExamTopicRelease | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !examId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    void fetchExamTopicRelease(examId)
      .then((payload) => {
        if (!active) return;
        setData(payload);
        const topics = payload.subjects.flatMap((subject) => subject.topics);
        if (mode === "ask" && !payload.configured) {
          setSelected(topics.map((topic) => topic.id));
        } else {
          setSelected(topics.filter((topic) => topic.selected).map((topic) => topic.id));
        }
      })
      .catch((cause) => {
        if (active) setError(getApiErrorMessage(cause, "Não foi possível carregar os assuntos."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, examId, mode]);

  const topics = data?.subjects.flatMap((subject) => subject.topics) ?? [];
  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const save = async (enabled: boolean) => {
    if (!examId) return;
    if (enabled && selected.length === 0) {
      setError("Marque ao menos um assunto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await saveExamTopicRelease(examId, enabled, enabled ? selected : []);
      onSaved(response.message);
      onClose();
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Não foi possível salvar a liberação."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      title={mode === "ask" ? "Liberar questões do banco?" : "Assuntos no banco de questões"}
      onClose={() => !saving && onClose()}
      size="md"
      footer={
        <View className="flex-row justify-end gap-3 flex-wrap">
          <Button variant="secondary" label={mode === "ask" ? "Não liberar" : "Remover liberação deste simulado"} disabled={saving || loading} onPress={() => void save(false)} />
          <Button label="Liberar assuntos marcados" loading={saving} disabled={loading || !topics.length} onPress={() => void save(true)} />
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <Text className="text-sm text-ink-muted">
          As questões extras são outras do banco, dos mesmos assuntos. As questões deste simulado continuam só nele.
          Turmas até 2026 seguem vendo a disciplina inteira. A partir de 2027, o aluno vê estes assuntos.
        </Text>
        {loading ? <ActivityIndicator color="var(--ds-brand)" /> : null}
        {error ? <Text className="text-sm text-danger">{error}</Text> : null}
        {data && data.courses.length === 0 ? (
          <Text className="text-sm text-ink">Vincule ao menos um curso ao simulado para liberar os assuntos.</Text>
        ) : null}
        {data && topics.length === 0 ? (
          <Text className="text-sm text-ink">Este simulado ainda não tem assuntos apontados nas questões.</Text>
        ) : null}
        {data?.courses.length ? (
          <Text className="text-xs text-ink-subtle">
            Cursos: {data.courses.map((course) => course.name).join(", ")}
          </Text>
        ) : null}
        {data?.subjects.map((subject) => (
          <View key={subject.id} style={{ gap: 6 }}>
            <Text className="text-sm font-semibold text-ink">{subject.name}</Text>
            {subject.topics.map((topic) => {
              const on = selected.includes(topic.id);
              return (
                <TouchableOpacity key={topic.id} onPress={() => toggle(topic.id)} className="flex-row items-center gap-3 py-1">
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? "var(--ds-brand)" : "var(--ds-ink-subtle)"} />
                  <Text className="text-sm text-ink flex-1">
                    {topic.name}
                    <Text className="text-ink-subtle"> · {topic.questions_count} {topic.questions_count === 1 ? "questão" : "questões"}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </Modal>
  );
}
