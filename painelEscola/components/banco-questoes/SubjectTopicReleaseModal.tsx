import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SearchableSelect from "../ui/SearchableSelect";
import { getApiErrorMessage } from "../../utils/apiErrors";
import {
  fetchSubjectTopicRelease,
  saveSubjectTopicRelease,
  type SubjectTopicRelease,
} from "../../services/questionBank";

type Props = {
  visible: boolean;
  subjectId: number | null;
  subjectName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
};

/** Liberação manual: na disciplina, marca os assuntos que o curso pode praticar a partir de 2027. */
export default function SubjectTopicReleaseModal({ visible, subjectId, subjectName, onClose, onSaved }: Props) {
  const [data, setData] = useState<SubjectTopicRelease | null>(null);
  const [courseId, setCourseId] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !subjectId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setCourseId("");
    void fetchSubjectTopicRelease(subjectId)
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setCourseId(payload.courses[0] ? String(payload.courses[0].id) : "");
      })
      .catch((cause) => {
        if (active) setError(getApiErrorMessage(cause, "Não foi possível carregar a liberação."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, subjectId]);

  const course = courseId ? Number(courseId) : null;
  const manualIds = useMemo(() => {
    if (!data || course === null) return [];
    return data.topics
      .filter((topic) => topic.releases.some((release) => release.course_id === course && release.manual))
      .map((topic) => topic.id);
  }, [data, course]);

  useEffect(() => {
    setSelected(manualIds);
  }, [manualIds]);

  const toggle = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const save = async () => {
    if (!subjectId || course === null) return;
    setSaving(true);
    setError(null);
    try {
      const response = await saveSubjectTopicRelease(subjectId, course, selected);
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
      title={`Liberar assuntos · ${subjectName}`}
      onClose={() => !saving && onClose()}
      size="md"
      footer={
        <View className="flex-row justify-end gap-3">
          <Button variant="secondary" label="Cancelar" disabled={saving} onPress={onClose} />
          <Button label="Salvar" loading={saving} disabled={loading || course === null} onPress={() => void save()} />
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <Text className="text-sm text-ink-muted">
          Turmas até 2026 continuam vendo a disciplina inteira. A partir de 2027, o aluno deste curso pratica os assuntos marcados.
          Assunto liberado por um simulado permanece aberto mesmo se a marcação manual sair.
        </Text>
        {loading ? <ActivityIndicator color="var(--ds-brand)" /> : null}
        {error ? <Text className="text-sm text-danger">{error}</Text> : null}
        {data && data.courses.length === 0 ? <Text className="text-sm text-ink">Nenhum curso ativo nesta escola.</Text> : null}
        {data && data.courses.length > 0 ? (
          <SearchableSelect
            label="Curso"
            modalTitle="Selecionar curso"
            value={courseId}
            options={data.courses.map((item) => ({ value: String(item.id), label: item.name }))}
            onChange={setCourseId}
          />
        ) : null}
        {data && course !== null
          ? data.topics.map((topic) => {
              const release = topic.releases.find((item) => item.course_id === course);
              const heldByExam = (release?.exams.length ?? 0) > 0;
              const on = heldByExam || selected.includes(topic.id);
              return (
                <TouchableOpacity
                  key={topic.id}
                  disabled={heldByExam}
                  onPress={() => toggle(topic.id)}
                  className="flex-row items-start gap-3 py-1"
                >
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={20}
                    color={on ? "var(--ds-brand)" : "var(--ds-ink-subtle)"}
                  />
                  <View className="flex-1">
                    <Text className="text-sm text-ink">{topic.name}</Text>
                    {heldByExam ? (
                      <Text className="text-xs text-ink-subtle">
                        Liberado pelo simulado {release?.exams.map((exam) => exam.title).join(", ")}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })
          : null}
        {data && data.topics.length === 0 ? <Text className="text-sm text-ink">Esta disciplina ainda não tem assuntos.</Text> : null}
      </View>
    </Modal>
  );
}
