import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Check, ChevronLeft, ChevronRight, FileUp, ZoomIn, ZoomOut } from "lucide-react-native";
import Button from "../../ui/Button";
import { findSourcePage, questionTextRun } from "../../../utils/importReview";
import { MAX_PDF_BYTES } from "../../../utils/pdfQuestionImport";

type Box = { left: number; top: number; width: number; height: number };

type Props = {
  file: File | null;
  /** Nome do arquivo de origem (quando o PDF ainda não foi reaberto nesta sessão). */
  fileName?: string | null;
  onPickFile: (file: File) => void;
  /** Página da questão atual (null: procura pelo texto quando o PDF carregar). */
  page: number | null;
  onLocate: (page: number) => void;
  questionLabel: string;
  questionText: string;
  options: string[];
  cropping: boolean;
  onCancelCrop: () => void;
  onCrop: (file: File) => void;
};

const PAGE_MARGIN = 16;
const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

// pdf.js (via react-pdf) é carregado sob demanda: só quem abre a revisão baixa o leitor.
async function loadPdf(file: File) {
  const { pdfjs } = await import("react-pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return { pdfjs, doc };
}

type Loaded = Awaited<ReturnType<typeof loadPdf>>;

/**
 * PDF original na coluna da revisão: renderiza a página da questão, destaca o trecho dela (ocre)
 * e permite recortar uma área como imagem da questão.
 */
export default function PdfSourcePanel({
  file, fileName, onPickFile, page, onLocate, questionLabel, questionText, options, cropping, onCancelCrop, onCrop,
}: Props) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const pageTexts = useRef<string[] | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [current, setCurrent] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [width, setWidth] = useState(0);
  const [cssSize, setCssSize] = useState({ width: 0, height: 0 });
  const [highlight, setHighlight] = useState<Box | null>(null);
  const [rendering, setRendering] = useState(false);
  const [crop, setCrop] = useState<Box | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Abre o PDF.
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError("");
    pageTexts.current = null;
    if (!file) return;
    loadPdf(file)
      .then((result) => { if (!cancelled) setLoaded(result); })
      .catch(() => { if (!cancelled) setLoadError("Não foi possível abrir o PDF."); });
    return () => { cancelled = true; };
  }, [file]);

  // Vai para a página da questão; sem página conhecida, procura o comando no texto do PDF.
  useEffect(() => {
    if (!loaded) return;
    if (page) {
      setCurrent(Math.min(Math.max(1, page), loaded.doc.numPages));
      return;
    }
    let cancelled = false;
    (async () => {
      if (!pageTexts.current) {
        const texts: string[] = [];
        for (let n = 1; n <= loaded.doc.numPages; n += 1) {
          const content = await (await loaded.doc.getPage(n)).getTextContent();
          texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        }
        pageTexts.current = texts;
      }
      const found = findSourcePage(pageTexts.current, questionText);
      if (!cancelled && found) {
        setCurrent(found);
        onLocate(found);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLocate muda a cada render
  }, [loaded, page, questionText]);

  // Renderiza a página (nitidez em telas retina) e calcula o destaque da questão.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!loaded || !canvas || width <= 0) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    setRendering(true);
    (async () => {
      const pdfPage = await loaded.doc.getPage(current);
      const base = pdfPage.getViewport({ scale: 1 });
      const cssWidth = (width - PAGE_MARGIN * 2) * ZOOMS[zoomIndex];
      const scale = cssWidth / base.width;
      const viewport = pdfPage.getViewport({ scale });
      const dpr = Math.min(3, (typeof window !== "undefined" && window.devicePixelRatio) || 1) * 1.5;
      const renderViewport = pdfPage.getViewport({ scale: scale * dpr });
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      task = pdfPage.render({ canvasContext: canvas.getContext("2d")!, viewport: renderViewport, canvas } as never);
      await task.promise;
      if (cancelled) return;
      setCssSize({ width: viewport.width, height: viewport.height });

      const content = await pdfPage.getTextContent();
      const items = content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number } => "str" in item);
      const run = questionTextRun(items.map((item) => item.str), questionText, options);
      let box: Box | null = null;
      for (const index of run) {
        const item = items[index];
        const tx = loaded.pdfjs.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]);
        const rect = { left: tx[4], top: tx[5] - fontHeight, right: tx[4] + item.width * scale, bottom: tx[5] + fontHeight * 0.25 };
        box = box
          ? {
              left: Math.min(box.left, rect.left),
              top: Math.min(box.top, rect.top),
              width: Math.max(box.left + box.width, rect.right) - Math.min(box.left, rect.left),
              height: Math.max(box.top + box.height, rect.bottom) - Math.min(box.top, rect.top),
            }
          : { left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top };
      }
      const padded = box
        ? { left: Math.max(0, box.left - 6), top: Math.max(0, box.top - 6), width: box.width + 12, height: box.height + 12 }
        : null;
      if (cancelled) return;
      setHighlight(padded);
      if (padded) (scrollRef.current as unknown as { scrollTo?: (o: { y: number; animated: boolean }) => void })?.scrollTo?.({ y: Math.max(0, padded.top - 40), animated: true });
    })()
      .catch(() => { /* render cancelado ao trocar de página/zoom */ })
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [loaded, current, zoomIndex, width, questionText, options]);

  // Recorte: começa sobre o trecho destacado (como no protótipo) e é ajustado arrastando.
  useEffect(() => {
    setCrop(cropping ? highlight ?? { left: 24, top: 24, width: Math.max(80, cssSize.width - 48), height: 140 } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao entrar no modo recorte
  }, [cropping]);

  const pointer = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(Math.max(0, event.clientX - bounds.left), bounds.width), y: Math.min(Math.max(0, event.clientY - bounds.top), bounds.height) };
  };

  const useCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas || !crop || crop.width < 8 || crop.height < 8) return;
    const ratio = canvas.width / cssSize.width;
    const out = document.createElement("canvas");
    out.width = Math.round(crop.width * ratio);
    out.height = Math.round(crop.height * ratio);
    out.getContext("2d")!.drawImage(canvas, crop.left * ratio, crop.top * ratio, out.width, out.height, 0, 0, out.width, out.height);
    out.toBlob((blob) => {
      if (blob) onCrop(new File([blob], `recorte-pagina-${current}.png`, { type: "image/png" }));
    }, "image/png");
  };

  const numPages = loaded?.doc.numPages ?? 0;

  return (
    <View className="flex-1 bg-surface-sunken border-l border-border" style={{ minHeight: 0 }} aria-label="PDF original">
      <View className="flex-row items-center bg-surface border-b border-border px-4" style={{ height: 48, gap: 8 }}>
        <Text className="text-[13px] font-semibold text-ink">PDF original</Text>
        <Text className="text-xs font-mono text-ink-subtle flex-1" numberOfLines={1}>{file?.name ?? fileName ?? ""}</Text>
        <Button size="sm" variant="ghost" iconOnly icon={ZoomOut} label="Diminuir zoom" disabled={!loaded || zoomIndex === 0}
          onPress={() => setZoomIndex((z) => Math.max(0, z - 1))} />
        <Button size="sm" variant="ghost" iconOnly icon={ZoomIn} label="Aumentar zoom" disabled={!loaded || zoomIndex === ZOOMS.length - 1}
          onPress={() => setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1))} />
      </View>

      {!file ? (
        <View className="flex-1 items-center justify-center px-6" style={{ gap: 12 }}>
          <Text className="text-sm text-ink-muted text-center">
            Abra o PDF original para conferir cada questão ao lado e recortar imagens.
            {fileName ? `\nArquivo da importação: ${fileName}` : ""}
          </Text>
          <Button icon={FileUp} label="Abrir PDF original" onPress={() => pickerRef.current?.click()} />
          <input ref={pickerRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} aria-label="Arquivo PDF original"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = "";
              if (selected && selected.name.toLowerCase().endsWith(".pdf") && selected.size <= MAX_PDF_BYTES) onPickFile(selected);
            }} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-6"><Text className="text-sm text-danger">{loadError}</Text></View>
      ) : (
        <ScrollView ref={scrollRef} className="flex-1" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          contentContainerStyle={{ padding: PAGE_MARGIN }}>
          {!loaded && <ActivityIndicator color="var(--ds-brand)" style={{ marginTop: 40 }} />}
          <View style={{ position: "relative", alignSelf: "flex-start", backgroundColor: "#fff", borderWidth: 1, borderColor: "var(--ds-border)" }}>
            <canvas ref={canvasRef} aria-label={`Página ${current} do PDF`} style={{ display: "block" }} />
            {highlight && !cropping && (
              <View pointerEvents="none" style={{
                position: "absolute", left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height,
                borderWidth: 2, borderColor: "var(--ds-accent)", backgroundColor: "rgba(226,169,76,.08)",
              }}>
                <Text style={{
                  position: "absolute", top: -10, right: 6, fontSize: 10, lineHeight: 10, fontWeight: "600",
                  backgroundColor: "var(--ds-accent)", color: "#1b1306", paddingHorizontal: 5, paddingVertical: 3,
                }}>{questionLabel}</Text>
              </View>
            )}
            {cropping && (
              <div
                style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
                onMouseDown={(event) => {
                  const p = pointer(event);
                  drag.current = p;
                  setCrop({ left: p.x, top: p.y, width: 0, height: 0 });
                }}
                onMouseMove={(event) => {
                  if (!drag.current) return;
                  const p = pointer(event);
                  const start = drag.current;
                  setCrop({ left: Math.min(start.x, p.x), top: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) });
                }}
                onMouseUp={() => { drag.current = null; }}
                onMouseLeave={() => { drag.current = null; }}
              >
                {crop && (
                  <div style={{
                    position: "absolute", left: crop.left, top: crop.top, width: crop.width, height: crop.height,
                    border: "2px dashed var(--ds-brand)", background: "rgba(28,61,99,.06)", boxSizing: "border-box",
                  }}>
                    <span style={{
                      position: "absolute", bottom: -22, left: 0, whiteSpace: "nowrap", font: "500 11px/1 var(--ds-font-sans, sans-serif)",
                      background: "var(--ds-brand)", color: "var(--ds-on-brand)", padding: "4px 6px",
                    }}>Arraste para ajustar o recorte</span>
                  </div>
                )}
              </div>
            )}
          </View>
          {rendering && loaded && <ActivityIndicator color="var(--ds-brand)" style={{ marginTop: 8 }} />}
        </ScrollView>
      )}

      {file && loaded && (
        <View className="flex-row items-center justify-center px-4 pb-4 pt-2" style={{ gap: 8 }}>
          {cropping ? (
            <>
              <Button size="sm" variant="ghost" label="Cancelar" onPress={onCancelCrop} />
              <Button size="sm" variant="primary" icon={Check} label="Usar recorte" disabled={!crop || crop.width < 8 || crop.height < 8} onPress={useCrop} />
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" iconOnly icon={ChevronLeft} label="Página anterior" disabled={current <= 1}
                onPress={() => setCurrent((c) => Math.max(1, c - 1))} />
              <Text className="text-xs font-mono text-ink-subtle">
                Página {current} de {numPages}{highlight ? " · questão destacada em ocre" : ""}
              </Text>
              <Button size="sm" variant="ghost" iconOnly icon={ChevronRight} label="Próxima página" disabled={current >= numPages}
                onPress={() => setCurrent((c) => Math.min(numPages, c + 1))} />
            </>
          )}
        </View>
      )}
    </View>
  );
}
