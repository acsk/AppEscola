import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { Check, RefreshCw, Sparkles } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormInput from "../ui/FormInput";
import MessageModal from "../ui/MessageModal";
import ProgressDialog from "../ui/ProgressDialog";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { aiRedrawQuestionImage } from "../../services/questionAi";
import type { AiImageReview } from "../../types/questionAi";
import type { ContentForm } from "../../utils/questionContent";
import { imageQuestionContent } from "../../utils/questionImageReview";
import { getApiValidationErrors } from "../../utils/apiErrors";
import { describeAiError } from "../../utils/aiErrors";

type Props = {
  visible: boolean;
  /** Questão salva (auditoria); null = questão nova, ainda não salva. */
  questionId: number | null;
  content: ContentForm;
  onClose: () => void;
  /** Usuário escolheu usar a nova imagem. */
  onUse: (imageUrl: string) => void;
};

const MAX_INSTRUCTIONS = 500;

/**
 * Nova versão da imagem do enunciado: a IA analisa a imagem atual com o enunciado e as alternativas do
 * formulário e redesenha a figura com os mesmos dados. A questão só muda se o usuário escolher "Usar".
 */
export default function RedrawImageModal({ visible, questionId, content, onClose, onUse }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [instructions, setInstructions] = useState("");
  const [instructionsError, setInstructionsError] = useState<string | undefined>();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<AiImageReview | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setInstructions("");
    setInstructionsError(undefined);
    setResult(null);
    setError(null);
  }, [visible]);

  const generate = async () => {
    if (!content.image_url) return;
    setGenerating(true);
    setInstructionsError(undefined);
    try {
      const { question_text, options, type } = imageQuestionContent(content);
      const response = await aiRedrawQuestionImage({
        question_id: questionId ?? undefined,
        image_url: content.image_url,
        type,
        question_text,
        options,
        instructions: instructions.trim() || undefined,
      });
      setResult(response.body);
    } catch (cause) {
      const fieldErrors = getApiValidationErrors(cause);
      if (fieldErrors.instructions) setInstructionsError(fieldErrors.instructions);
      else setError(describeAiError(cause, "Não foi possível gerar a nova imagem"));
    } finally {
      setGenerating(false);
    }
  };

  const ready = result?.image_generation.status === "READY" && !!result.image_url;
  const imageHeight = isMobile ? 180 : 240;
  const imageBox = (label: string, uri: string | null | undefined) => (
    <View style={{ flex: 1, minWidth: 220, gap: 6 }}>
      <Text className="text-xs font-semibold text-ink-muted">{label}</Text>
      <View className="border border-border rounded-ds-md p-2 bg-surface items-center justify-center" style={{ height: imageHeight + 16 }}>
        {uri ? (
          <Image source={{ uri }} accessibilityLabel={label} style={{ width: "100%", height: imageHeight }} resizeMode="contain" />
        ) : (
          <Text className="text-xs text-ink-subtle text-center">Sem imagem gerada.</Text>
        )}
      </View>
    </View>
  );

  return (
    <>
      <Modal
        visible={visible && !generating}
        title="Gerar nova imagem com IA"
        onClose={onClose}
        size="lg"
        compact
        maxHeight="92%"
        showScrollIndicator
        footer={
          <View className="flex-row flex-wrap justify-end" style={{ gap: 8 }}>
            <Button label="Cancelar" onPress={onClose} />
            {result ? (
              <>
                <Button icon={RefreshCw} label="Gerar outra" onPress={() => void generate()} />
                {result.image_url && (
                  <Button
                    variant="primary"
                    icon={Check}
                    label={ready ? "Usar nova imagem" : "Usar mesmo assim"}
                    onPress={() => onUse(result.image_url!)}
                  />
                )}
              </>
            ) : (
              <Button variant="ai" icon={Sparkles} label="Gerar nova imagem" onPress={() => void generate()} />
            )}
          </View>
        }
      >
        <View style={{ gap: 12 }}>
          <Text className="text-sm text-ink-muted">
            A IA analisa o enunciado, as alternativas e a imagem atual, e redesenha a figura com os mesmos dados, mais nítida
            e legível. A questão só muda se você escolher usar a nova imagem. Pode gerar cobrança no OpenRouter.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {imageBox("Imagem atual", content.image_url)}
            {result && imageBox("Nova imagem", result.image_url)}
          </View>
          {result && !ready && (
            <Text className="text-sm text-warning" aria-live="polite">
              {result.image_generation.reason || "A nova imagem não passou na conferência automática. Confira com atenção antes de usar."}
            </Text>
          )}
          {ready && (result.image_generation.validation?.problemas.length ?? 0) === 0 && (
            <Text className="text-xs text-success" aria-live="polite">
              A conferência automática não encontrou diferenças entre a figura e a questão. Revise mesmo assim.
            </Text>
          )}
          <FormInput
            dense
            label="Observações de estilo (opcional)"
            value={instructions}
            onChangeText={(v) => {
              setInstructions(v.slice(0, MAX_INSTRUCTIONS));
              setInstructionsError(undefined);
            }}
            placeholder="Ex.: fundo branco, rótulos maiores, traço mais grosso."
            maxLength={MAX_INSTRUCTIONS}
            error={instructionsError}
          />
        </View>
      </Modal>

      <ProgressDialog
        visible={generating}
        title="Gerando nova imagem"
        message="A IA está analisando a questão e redesenhando a figura com os mesmos dados."
        expectedSeconds={120}
        stages={[
          { after: 0, label: "Analisando a imagem e o enunciado…" },
          { after: 20, label: "Descrevendo a figura…" },
          { after: 40, label: "Desenhando a nova imagem…" },
          { after: 90, label: "Conferindo a imagem gerada…" },
        ]}
      />

      <MessageModal
        visible={error !== null}
        type="error"
        title={error?.title ?? ""}
        message={error?.message ?? ""}
        onClose={() => setError(null)}
      />
    </>
  );
}
