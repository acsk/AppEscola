import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bold, Italic, Underline, type LucideIcon } from "lucide-react-native";
import Icon from "./Icon";
import { color } from "../../constants/theme";
import { domToRichText, richTextToHtml, type RichMark } from "../../utils/richText";

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  /** Altura mínima da área de texto (px). */
  minHeight?: number;
  /** Campo de uma linha visual (alternativas): barra só com o campo em foco, sem margem inferior. */
  compact?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
};

const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

const COMMANDS: { mark: RichMark; command: string; icon: LucideIcon; label: string; shortcut: string }[] = [
  { mark: "b", command: "bold", icon: Bold, label: "Negrito", shortcut: `${MOD}B` },
  { mark: "i", command: "italic", icon: Italic, label: "Itálico", shortcut: `${MOD}I` },
  { mark: "u", command: "underline", icon: Underline, label: "Sublinhado", shortcut: `${MOD}U` },
];

/**
 * Campo de texto com negrito, itálico e sublinhado (web, contentEditable).
 * O valor segue o formato de utils/richText (texto + <b>/<i>/<u>); o HTML do editor só é
 * reescrito quando o valor muda de fora (ex.: IA, carregar questão), para não mover o cursor.
 */
export default function RichTextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  minHeight = 44,
  compact = false,
  disabled = false,
  "aria-label": ariaLabel,
}: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState<Record<RichMark, boolean>>({ b: false, i: false, u: false });

  useEffect(() => {
    const el = editorRef.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = richTextToHtml(value);
    lastEmitted.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = domToRichText(el as never);
    if (!next && el.innerHTML !== "") el.innerHTML = ""; // mostra o placeholder de novo
    lastEmitted.current = next;
    onChange(next);
  }, [onChange]);

  const refreshActive = useCallback(() => {
    if (typeof document === "undefined") return;
    setActive({
      b: document.queryCommandState("bold"),
      i: document.queryCommandState("italic"),
      u: document.queryCommandState("underline"),
    });
  }, []);

  useEffect(() => {
    if (!focused || typeof document === "undefined") return;
    document.addEventListener("selectionchange", refreshActive);
    return () => document.removeEventListener("selectionchange", refreshActive);
  }, [focused, refreshActive]);

  const apply = (command: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command);
    refreshActive();
    emit();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Enter = quebra de linha (<br>), não um novo <div>.
    if (event.key === "Enter") {
      event.preventDefault();
      document.execCommand("insertLineBreak");
      emit();
    }
  };

  /** Colar: mantém só negrito/itálico/sublinhado e quebras de linha. */
  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    let text: string;
    if (html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      text = domToRichText(doc.body as never);
    } else {
      text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
      text = text.replace(/</g, "<​").replace(/<​(\/?[biu]>)/gi, "<$1"); // "<" literal continua texto
      text = text.replace(/​/g, "");
    }
    document.execCommand("insertHTML", false, richTextToHtml(text));
    emit();
  };

  const showToolbar = !compact || focused;
  const borderColor = error ? color.danger : focused ? color.brand : color["border-strong"];

  const toolbar = (
    <View className="flex-row items-center" style={{ gap: 2 }} role="toolbar" aria-label="Formatação do texto">
      {COMMANDS.map((c) => (
        <TouchableOpacity
          key={c.mark}
          // onMouseDown sem foco: mantém a seleção do texto ao clicar no botão.
          {...({ onMouseDown: (e: React.MouseEvent) => e.preventDefault() } as object)}
          onPress={() => apply(c.command)}
          disabled={disabled}
          role="button"
          aria-label={`${c.label} (${c.shortcut})`}
          aria-pressed={focused && active[c.mark]}
          className={`items-center justify-center rounded-ds-sm ${focused && active[c.mark] ? "bg-surface-sunken" : ""}`}
          style={{ width: 28, height: 28 }}
        >
          <Icon icon={c.icon} color={focused && active[c.mark] ? color.ink : color["ink-muted"]} />
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <View className={compact ? "flex-1" : "mb-4"} style={{ minWidth: 0 }}>
      {label ? (
        <Text className="font-medium text-ink" style={{ fontSize: 13, lineHeight: 18, marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      <View
        className={compact ? "" : "rounded-ds-md bg-surface"}
        style={compact ? undefined : { borderWidth: 1, borderColor, overflow: "hidden" }}
      >
        {!compact && (
          <View className="border-b border-border bg-surface-sunken px-1" style={{ minHeight: 34, justifyContent: "center" }}>
            {toolbar}
          </View>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-label={ariaLabel ?? label}
          aria-invalid={!!error}
          data-placeholder={placeholder}
          className="ds-rich-text-input"
          onInput={emit}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => {
            setFocused(true);
            refreshActive();
          }}
          onBlur={() => setFocused(false)}
          style={{
            minHeight: compact ? undefined : minHeight,
            padding: compact ? "8px 0" : "10px 12px",
            fontSize: 14,
            lineHeight: "20px",
            color: color.ink,
            outline: "none",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            cursor: disabled ? "default" : "text",
          }}
        />
      </View>
      {compact && showToolbar && <View style={{ marginBottom: 4 }}>{toolbar}</View>}
      {error && !compact ? (
        <Text className="text-xs font-medium text-danger" style={{ marginTop: 6 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
