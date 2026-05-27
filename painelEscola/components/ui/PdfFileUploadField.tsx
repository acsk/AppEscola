import React, { useRef } from "react";
import { View, Text, TouchableOpacity, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const THEME = {
  primary: "#4F46E5",
  primaryDark: "#4338CA",
  soft: "#EEF2FF",
  border: "#DDE3F5",
  ink: "#1E1B4B",
  muted: "#64748B",
  surface: "#FFFFFF",
  error: "#DC2626",
  errorBg: "#FEF2F2",
  errorBorder: "#FECACA",
} as const;

type Props = {
  label?: string;
  required?: boolean;
  hint?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  currentFileLabel?: string | null;
  error?: string;
  disabled?: boolean;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PdfIconBlock({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? 72 : 56;
  const icon = size === "lg" ? 40 : 32;
  return (
    <View style={[styles.pdfIconWrap, { width: box, height: box }]}>
      <View style={styles.pdfIconRing} />
      <Ionicons name="document-text" size={icon} color={THEME.primary} />
      <View style={styles.pdfIconBadge}>
        <Text style={styles.pdfIconBadgeText}>PDF</Text>
      </View>
    </View>
  );
}

export default function PdfFileUploadField({
  label = "Arquivo PDF",
  required = false,
  hint,
  value,
  onChange,
  currentFileLabel = null,
  error,
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasFile = Boolean(value || currentFileLabel);
  const displayName = value?.name ?? currentFileLabel ?? "";
  const displaySize = value ? formatFileSize(value.size) : null;

  const openPicker = () => {
    if (disabled || Platform.OS !== "web") return;
    inputRef.current?.click();
  };

  const handleInputChange = (e: { target?: { files?: FileList | null; value?: string } }) => {
    const file = e.target.files?.[0] ?? null;
    onChange(file);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const clearSelection = () => {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <View>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      <View
        style={[
          styles.dropzone,
          hasFile ? styles.dropzoneFilled : styles.dropzoneEmpty,
          error ? styles.dropzoneError : null,
          disabled ? styles.dropzoneDisabled : null,
        ]}
      >
        {hasFile ? (
          <View style={styles.fileRow}>
            <PdfIconBlock size="md" />
            <View style={styles.fileInfo}>
              <Text style={styles.fileStatus}>
                {value ? "Novo arquivo selecionado" : "Arquivo atual"}
              </Text>
              <Text style={styles.fileName} numberOfLines={2}>
                {displayName}
              </Text>
              {displaySize ? <Text style={styles.fileSize}>{displaySize}</Text> : null}
            </View>
            <View style={styles.fileActions}>
              <TouchableOpacity
                onPress={openPicker}
                disabled={disabled}
                style={styles.btnSecondary}
                activeOpacity={0.85}
              >
                <Ionicons name="swap-horizontal-outline" size={15} color={THEME.primary} />
                <Text style={styles.btnSecondaryText}>Trocar</Text>
              </TouchableOpacity>
              {value ? (
                <TouchableOpacity
                  onPress={clearSelection}
                  disabled={disabled}
                  style={styles.btnGhost}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnGhostText}>Remover</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <PdfIconBlock size="lg" />
            <Text style={styles.emptyTitle}>Nenhum PDF selecionado</Text>
            <Text style={styles.emptySub}>Toque no botão abaixo para escolher o arquivo</Text>
            <TouchableOpacity
              onPress={openPicker}
              disabled={disabled}
              style={styles.btnPrimary}
              activeOpacity={0.88}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={THEME.surface} />
              <Text style={styles.btnPrimaryText}>Selecionar PDF</Text>
            </TouchableOpacity>
          </View>
        )}

        {Platform.OS === "web" ? (
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={disabled}
            onChange={handleInputChange}
            style={{ position: "absolute", width: 0, height: 0, opacity: 0, overflow: "hidden" }}
            tabIndex={-1}
            aria-hidden
          />
        ) : null}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.ink,
    marginBottom: 6,
  },
  required: {
    color: THEME.error,
  },
  hint: {
    fontSize: 12,
    color: THEME.muted,
    marginBottom: 10,
    lineHeight: 18,
  },
  dropzone: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    backgroundColor: THEME.surface,
  },
  dropzoneEmpty: {
    borderColor: THEME.border,
    borderStyle: "dashed",
    backgroundColor: THEME.soft,
  },
  dropzoneFilled: {
    borderColor: THEME.border,
    borderStyle: "solid",
  },
  dropzoneError: {
    borderColor: THEME.errorBorder,
    backgroundColor: THEME.errorBg,
  },
  dropzoneDisabled: {
    opacity: 0.6,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  fileStatus: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.ink,
    lineHeight: 20,
  },
  fileSize: {
    fontSize: 12,
    color: THEME.muted,
    marginTop: 2,
  },
  fileActions: {
    gap: 8,
    alignItems: "flex-end",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: THEME.ink,
    marginTop: 4,
  },
  emptySub: {
    fontSize: 12,
    color: THEME.muted,
    textAlign: "center",
    marginBottom: 4,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: THEME.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 6,
  },
  btnPrimaryText: {
    color: THEME.surface,
    fontSize: 14,
    fontWeight: "700",
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: THEME.soft,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.primary,
  },
  btnGhost: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  btnGhostText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.muted,
  },
  errorText: {
    fontSize: 12,
    color: THEME.error,
    marginTop: 6,
  },
  pdfIconWrap: {
    borderRadius: 14,
    backgroundColor: THEME.soft,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pdfIconRing: {
    position: "absolute",
    width: "86%",
    height: "86%",
    borderRadius: 999,
    backgroundColor: THEME.surface,
    opacity: 0.7,
  },
  pdfIconBadge: {
    position: "absolute",
    bottom: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: THEME.primary,
  },
  pdfIconBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: THEME.surface,
    letterSpacing: 0.4,
  },
});
