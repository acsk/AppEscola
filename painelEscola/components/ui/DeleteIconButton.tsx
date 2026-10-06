import React from "react";
import { TouchableOpacity } from "react-native";
import { Trash2 } from "lucide-react-native";
import Icon from "./Icon";
import { color } from "../../constants/theme";

type Props = {
  onPress: () => void;
  /** Texto para leitor de tela: "Excluir aluno", "Remover alternativa B". */
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
};

/** Botão só-ícone de excluir/remover: vermelho cheio para chamar atenção (padrão do painel). */
export default function DeleteIconButton({ onPress, label, disabled = false, size = "sm" }: Props) {
  const box = size === "sm" ? 28 : 34;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      activeOpacity={0.8}
      className="items-center justify-center rounded-ds-md bg-danger"
      style={{ width: box, height: box, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon icon={Trash2} color={color["on-danger"]} />
    </TouchableOpacity>
  );
}
