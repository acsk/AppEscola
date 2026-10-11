import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Check, Download } from "lucide-react-native";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import { FINANCE_PDF_MODELS, type FinancePdfModel, type FinancePdfOptions } from "../../utils/financeReportExport";
import { color } from "../../constants/theme";

type Props = {
  /** Modelo pré-escolhido (null = fechado). */
  model: FinancePdfModel | null;
  /** "Vencimento 01/10 a 11/10/2026 · todos os cursos e turmas · 57 cobranças" */
  scope: string;
  exporting: boolean;
  onClose: () => void;
  onExport: (options: FinancePdfOptions) => void;
};

/** Papel do PDF é sempre claro: a prévia usa cores fixas de papel, não do tema. */
const PAPER = { bg: "#ffffff", line: "#d9dde3", ink: "#111722", brand: "#1c3d63", paid: "#1c6a45", pending: "#8a5200", overdue: "#b0261b" }; // ds-keep

function CheckRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} role="checkbox" aria-checked={checked} className="flex-row items-center" style={{ gap: 8 }}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 2,
          borderWidth: 1,
          borderColor: checked ? color.brand : color["border-strong"],
          backgroundColor: checked ? color.brand : color.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Check size={12} color={color["on-brand"]} strokeWidth={3} /> : null}
      </View>
      <Text className="text-ink" style={{ fontSize: 14, lineHeight: 20 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Line({ width, bg = PAPER.line, height = 4 }: { width: `${number}%`; bg?: string; height?: number }) {
  return <View style={{ width, height, backgroundColor: bg }} />;
}

/** Miniatura esquemática da página (timbrado, título, KPIs, barra, distribuição, tabela). */
function PagePreview({ model, landscape }: { model: FinancePdfModel; landscape: boolean }) {
  const showDistribution = model === "completo" || model === "resumo";
  const showRows = model !== "resumo";
  return (
    <View>
      <View
        aria-hidden
        style={{
          aspectRatio: landscape ? 297 / 210 : 210 / 297,
          backgroundColor: PAPER.bg,
          borderWidth: 1,
          borderColor: color.border,
          padding: 12,
          gap: 6,
          overflow: "hidden",
        }}
      >
        <View className="flex-row items-center" style={{ gap: 6, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: PAPER.brand }}>
          <View style={{ width: 14, height: 14, backgroundColor: PAPER.line }} />
          <View style={{ flex: 1, gap: 3 }}>
            <Line width="60%" bg={PAPER.ink} />
            <Line width="80%" />
          </View>
        </View>
        <Line width="60%" bg={PAPER.ink} height={7} />
        {model !== "inadimplencia" && (
          <>
            <View className="flex-row" style={{ gap: 3 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ flex: 1, height: 16, borderWidth: 1, borderColor: PAPER.line }} />
              ))}
            </View>
          </>
        )}
        {showDistribution && (
          <View className="flex-row" style={{ height: 5, gap: 1 }}>
            <View style={{ width: "34%", backgroundColor: PAPER.paid }} />
            <View style={{ width: "62%", backgroundColor: PAPER.pending }} />
            <View style={{ width: "4%", backgroundColor: PAPER.overdue }} />
          </View>
        )}
        {showDistribution &&
          [60, 48, 40, 30, 22].map((w, i) => (
            <View key={i} className="flex-row items-center" style={{ gap: 4 }}>
              <Line width="40%" />
              <View style={{ height: 4, width: `${w}%`, backgroundColor: PAPER.brand }} />
            </View>
          ))}
        {showRows && Array.from({ length: 10 }, (_, i) => <View key={`r${i}`} style={{ height: 3, backgroundColor: "#eceef2" /* ds-keep */ }} />)}
      </View>
      <Text className="text-ink-subtle text-center" style={{ fontSize: 12, lineHeight: 16, marginTop: 8 }}>
        Prévia · A4 {landscape ? "paisagem" : "retrato"}
      </Text>
    </View>
  );
}

export default function FinancePdfExportModal({ model, scope, exporting, onClose, onExport }: Props) {
  const { isMobile } = useResponsiveLayout();
  const [current, setCurrent] = useState<FinancePdfModel>("completo");
  const [showFilters, setShowFilters] = useState(true);
  const [groupByClass, setGroupByClass] = useState(false);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    if (model) setCurrent(model);
  }, [model]);

  const canGroup = current === "completo" || current === "lista";

  return (
    <Modal
      visible={model !== null}
      title="Exportar PDF"
      onClose={() => !exporting && onClose()}
      size="md"
      compact
      showScrollIndicator
      maxHeight="88%"
      headerContent={
        <Text className="text-ink-muted" style={{ fontSize: 13, lineHeight: 18, marginTop: 2 }}>
          {scope}
        </Text>
      }
      footer={
        <View className="flex-row items-center flex-wrap" style={{ gap: 8, width: "100%" }}>
          <Text className="text-ink-subtle" style={{ fontSize: 12, lineHeight: 16, flexShrink: 1 }}>
            O arquivo usa o logo e os dados da escola.
          </Text>
          <View className="flex-row" style={{ gap: 8, marginLeft: "auto" }}>
            <Button label="Cancelar" onPress={onClose} disabled={exporting} />
            <Button
              variant="primary"
              icon={Download}
              label={exporting ? "Gerando PDF..." : "Gerar PDF"}
              loading={exporting}
              onPress={() => onExport({ model: current, landscape, showFilters, groupByClass: canGroup && groupByClass })}
            />
          </View>
        </View>
      }
    >
      <View style={{ flexDirection: isMobile ? "column" : "row", gap: 20 }}>
        <View style={{ flex: 1, gap: 16 }}>
          <View role="radiogroup" aria-label="Modelo do relatório" style={{ gap: 6 }}>
            {FINANCE_PDF_MODELS.map((option) => {
              const on = option.key === current;
              return (
                <TouchableOpacity
                  key={option.key}
                  role="radio"
                  aria-checked={on}
                  onPress={() => setCurrent(option.key)}
                  activeOpacity={0.85}
                  className="rounded-ds-md"
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderWidth: on ? 2 : 1,
                    margin: on ? 0 : 1,
                    borderColor: on ? color.brand : color["border-strong"],
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      marginTop: 2,
                      borderRadius: 8,
                      borderWidth: on ? 5 : 1,
                      borderColor: on ? color.brand : color["border-strong"],
                      backgroundColor: color.surface,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <View className="flex-row items-baseline" style={{ gap: 8 }}>
                      <Text className="font-medium text-ink" style={{ fontSize: 14, lineHeight: 20, flex: 1 }}>
                        {option.title}
                      </Text>
                      <Text className="font-mono text-ink-subtle" style={{ fontSize: 12 }}>
                        {option.pages}
                      </Text>
                    </View>
                    <Text className="text-ink-muted" style={{ fontSize: 12, lineHeight: 16 }}>
                      {option.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ gap: 10 }}>
            <CheckRow label="Mostrar os filtros aplicados no cabeçalho" checked={showFilters} onPress={() => setShowFilters((v) => !v)} />
            {canGroup && (
              <CheckRow label="Agrupar cobranças por turma, com subtotais" checked={groupByClass} onPress={() => setGroupByClass((v) => !v)} />
            )}
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <Text className="font-medium text-ink" style={{ fontSize: 13 }}>
                Orientação
              </Text>
              <View role="radiogroup" aria-label="Orientação" className="flex-row border border-border-strong rounded-ds-md overflow-hidden" style={{ height: 32 }}>
                {([
                  [false, "Retrato"],
                  [true, "Paisagem"],
                ] as const).map(([value, label], i) => {
                  const on = landscape === value;
                  return (
                    <TouchableOpacity
                      key={label}
                      role="radio"
                      aria-checked={on}
                      onPress={() => setLandscape(value)}
                      className={on ? "bg-surface-sunken" : "bg-surface"}
                      style={{ paddingHorizontal: 12, justifyContent: "center", borderLeftWidth: i ? 1 : 0, borderLeftColor: color["border-strong"] }}
                    >
                      <Text className={`font-medium ${on ? "text-ink" : "text-ink-muted"}`} style={{ fontSize: 13 }}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
        <View style={{ width: isMobile ? "100%" : 200, maxWidth: isMobile ? 220 : undefined, alignSelf: isMobile ? "center" : "flex-start" }}>
          <PagePreview model={current} landscape={landscape} />
        </View>
      </View>
    </Modal>
  );
}
