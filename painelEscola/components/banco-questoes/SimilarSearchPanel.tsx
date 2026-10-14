import React, { useState } from "react";
import { Text, View } from "react-native";
import Button from "../ui/Button";
import { getApiErrorMessage } from "../../utils/apiErrors";
import { color } from "../../constants/theme";
import { searchSimilarQuestions, similarMatchLabel, similarPercent, type SimilarMatch } from "../../services/questionSimilarity";

type Props = {
  questionText: string;
  subjectId?: number | null;
  topicId?: number | null;
  imageUrl?: string | null;
  options?: { option_text: string }[];
  ignoreId?: number | null;
  onOpen?: (questionId: number) => void;
  /** Na importação, compara o texto extraído com a questão cadastrada. */
  compararTexto?: string | null;
  /** Descarta a extração e preserva a questão já cadastrada. */
  onManterCadastrada?: () => void;
};

/** Alerta de semelhança. Não impede salvar. */
export default function SimilarSearchPanel({
  questionText, subjectId, topicId, imageUrl, options, ignoreId, onOpen, compararTexto, onManterCadastrada,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<SimilarMatch[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<number[]>([]);
  const [kept, setKept] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  const search = async () => {
    if (questionText.trim() === "") {
      setError("Escreva o enunciado antes de buscar semelhantes.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await searchSimilarQuestions({
        question_text: questionText,
        subject_id: subjectId,
        topic_id: topicId,
        image_url: imageUrl,
        options,
        ignorar_ids: ignoreId ? [ignoreId] : undefined,
      });
      setMatches(response.body.resultados);
      setNote(response.body.comparacao_multimodal_necessaria
        ? "A imagem faz parte da resolução. A comparação textual não decide sozinha se é duplicata."
        : response.body.reindexacao_necessaria
          ? "Há embeddings de outro modelo. Rode a reindexação para comparar esses vetores."
          : null);
    } catch (err) {
      setMatches(null);
      setError(getApiErrorMessage(err, "A verificação de semelhança não foi concluída."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Button size="sm" label="Buscar questões semelhantes" onPress={() => void search()} loading={loading} />
      {error ? <Text className="text-xs text-danger">{error}</Text> : null}
      {note ? <Text className="text-xs text-ink-muted">{note}</Text> : null}
      {matches && matches.length === 0 ? <Text className="text-xs text-ink-muted">Nenhuma correspondência relevante.</Text> : null}
      {compararTexto ? (
        <Text className="text-xs text-ink-muted">
          A questão cadastrada não é alterada aqui. O PDF desta importação continua vinculado.
        </Text>
      ) : null}
      {matches?.filter((match) => !ignored.includes(match.question_id)).map((match) => {
        const percent = similarPercent(match);
        const alerta = match.tipo === "duplicata_exata" || match.tipo === "possivel_duplicata" || match.tipo === "muito_semelhante";
        const aberta = openId === match.question_id;
        return (
          <View key={match.question_id} className="border border-border rounded-ds-md" style={{ padding: 10, gap: 4 }}>
            <Text className="text-xs font-semibold" style={{ color: alerta ? color.warning : color["ink-muted"] }}>
              {similarMatchLabel(match.tipo)}{percent !== null ? ` · ${percent}% de semelhança` : ""}
            </Text>
            <Text className="text-xs text-ink-muted">
              {[match.disciplina, match.assuntos[0]].filter(Boolean).join(" · ") || "Sem disciplina"} · #{match.question_id}
            </Text>
            <Text className="text-sm text-ink" numberOfLines={aberta ? undefined : 3}>{match.enunciado}</Text>
            <Text className="text-xs text-ink-muted">{match.motivo}</Text>
            {aberta && compararTexto ? (
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text className="text-xs font-semibold text-ink">Nesta importação</Text>
                  <Text className="text-sm text-ink">{compararTexto}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Text className="text-xs font-semibold text-ink">Já cadastrada #{match.question_id}</Text>
                  <Text className="text-sm text-ink">{match.enunciado}</Text>
                </View>
              </View>
            ) : null}
            {kept.includes(match.question_id) ? (
              <Text className="text-xs text-ink-muted">As duas serão mantidas. Esta importação segue como questão nova.</Text>
            ) : null}
            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
              {compararTexto ? (
                <Button size="sm" variant="ghost" label={aberta ? "Fechar comparação" : "Comparar"} onPress={() => setOpenId(aberta ? null : match.question_id)} />
              ) : null}
              {onOpen ? <Button size="sm" variant="ghost" label="Ver questão" onPress={() => onOpen(match.question_id)} /> : null}
              {compararTexto ? (
                <>
                  <Button size="sm" variant="ghost" label="Ignorar" onPress={() => setIgnored((ids) => [...ids, match.question_id])} />
                  <Button size="sm" variant="ghost" label="Manter as duas" onPress={() => setKept((ids) => ids.includes(match.question_id) ? ids : [...ids, match.question_id])} />
                  {onManterCadastrada ? (
                    <Button size="sm" variant="ghost" label="Manter só a cadastrada" onPress={onManterCadastrada} />
                  ) : null}
                </>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
