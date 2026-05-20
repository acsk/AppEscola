import { useEffect, type RefObject } from "react";
import { Platform } from "react-native";

export type TextInputRestriction = "integer" | "decimal" | "digits";

const CONTROL_KEYS = new Set([
  "Backspace",
  "Delete",
  "Tab",
  "Enter",
  "Escape",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

function isAllowedChar(char: string, restriction: TextInputRestriction): boolean {
  if (restriction === "decimal") {
    return /\d/.test(char) || char === "." || char === ",";
  }
  return /\d/.test(char);
}

function isAllowedText(text: string, restriction: TextInputRestriction): boolean {
  if (!text) return true;
  if (restriction === "decimal") {
    return /^[\d.,]*$/.test(text);
  }
  return /^\d*$/.test(text);
}

function resolveInputElement(ref: RefObject<unknown>): HTMLElement | null {
  const node = ref.current as Record<string, unknown> | HTMLElement | null;
  if (!node) return null;
  if (node instanceof HTMLElement) {
    return node.tagName === "INPUT" || node.tagName === "TEXTAREA" ? node : node.querySelector("input, textarea");
  }
  const candidates = [
    node._node,
    node._nativeElement,
    typeof node.getScrollableNode === "function" ? (node.getScrollableNode as () => unknown)() : null,
  ];
  for (const candidate of candidates) {
    if (candidate instanceof HTMLElement) {
      return candidate.tagName === "INPUT" || candidate.tagName === "TEXTAREA"
        ? candidate
        : candidate.querySelector("input, textarea");
    }
  }
  return null;
}

/**
 * Bloqueia digitação e colagem de caracteres inválidos na web.
 * Complementa a sanitização em onChangeText (keyboardType não restringe na web).
 */
export function useRestrictTextInput(
  ref: RefObject<unknown>,
  restriction: TextInputRestriction | undefined,
  enabled = true
) {
  useEffect(() => {
    if (!restriction || !enabled || Platform.OS !== "web") return;

    let element: HTMLElement | null = null;
    let disposed = false;

    const attach = () => {
      if (disposed) return;
      element = resolveInputElement(ref);
      if (!element) return;

      const onBeforeInput = (event: Event) => {
        const data = (event as InputEvent).data;
        if (!data) return;
        if ([...data].some((char) => !isAllowedChar(char, restriction))) {
          event.preventDefault();
        }
      };

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (CONTROL_KEYS.has(event.key)) return;
        if (event.key.length === 1 && !isAllowedChar(event.key, restriction)) {
          event.preventDefault();
        }
      };

      const onPaste = (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData("text") ?? "";
        if (!isAllowedText(text, restriction)) {
          event.preventDefault();
        }
      };

      const onDrop = (event: DragEvent) => {
        const text = event.dataTransfer?.getData("text") ?? "";
        if (!isAllowedText(text, restriction)) {
          event.preventDefault();
        }
      };

      element.addEventListener("beforeinput", onBeforeInput);
      element.addEventListener("keydown", onKeyDown, true);
      element.addEventListener("paste", onPaste);
      element.addEventListener("drop", onDrop);

      return () => {
        element?.removeEventListener("beforeinput", onBeforeInput);
        element?.removeEventListener("keydown", onKeyDown, true);
        element?.removeEventListener("paste", onPaste);
        element?.removeEventListener("drop", onDrop);
      };
    };

    let cleanup = attach();
    const retryTimer = setTimeout(() => {
      cleanup?.();
      cleanup = attach();
    }, 0);

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      cleanup?.();
    };
  }, [ref, restriction, enabled]);
}
