import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { drawTenantPdfHeader } from "./pdfTenantLetterhead";
import { PDF_COLOR, PDF_MARGIN, PDF_TYPE, drawDocumentTitle, drawFactsStrip, drawPageFooters, pdfTableStyles, setText, type PdfFact } from "./pdfTheme";
import { fmtDate, fmtMetricValue, fmtNumber } from "../components/bi/format";
import type {
  BiAnyReport,
  BiClassReport,
  BiIndividualReport,
  BiInstitutionalReport,
  BiMetric,
  BiMetricDefinition,
  BiReportType,
  BiResultsReport,
  BiSubjectReport,
} from "../services/biService";

// ── Documento intermediário (o mesmo vira PDF e XLSX) ─────────────────────────

type Cell = string | number | null;

export type ReportSection =
  | { kind: "facts"; title: string; facts: PdfFact[] }
  | { kind: "table"; title: string; description?: string; columns: string[]; rows: Cell[][] }
  | { kind: "chart"; title: string; description?: string; labels: string[]; series: { name: string; values: (number | null)[] }[] }
  | { kind: "text"; title: string; paragraphs: string[] };

export type ReportDoc = { fileName: string; title: string; subtitle: string; facts: PdfFact[]; sections: ReportSection[]; methodology: string[] };

export type ReportOptions = {
  indicators: string[];
  letterhead: boolean;
  charts: boolean;
  executiveSummary: string;
};

/** Indicadores que cada relatório oferece (os marcados entram no arquivo). */
export const REPORT_INDICATORS: Record<BiReportType, { key: string; label: string; default: boolean; hint?: string }[]> = {
  individual: [
    { key: "indices", label: "Índices do Diagnóstico 360°", default: true },
    { key: "evolution", label: "Avaliações comparáveis × colegas", default: true },
    { key: "subjects", label: "Acerto por disciplina", default: true },
    { key: "topics", label: "Assuntos críticos e em evolução", default: true },
    { key: "recommendations", label: "Recomendações", default: true },
    { key: "interventions", label: "Intervenções", default: false },
  ],
  class: [
    { key: "indicators", label: "Indicadores consolidados", default: true },
    { key: "evolution", label: "Evolução mensal", default: true },
    { key: "subjects", label: "Disciplinas com maior dificuldade", default: true },
    { key: "students", label: "Alunos (desempenho e atenção)", default: true },
  ],
  subject: [
    { key: "indicators", label: "Indicadores da disciplina", default: true },
    { key: "ranking", label: "Ranking de assuntos", default: true },
    { key: "heatmap", label: "Comparação entre turmas (turma × assunto)", default: true },
  ],
  institutional: [
    { key: "indicators", label: "Indicadores gerais", default: true },
    { key: "assessments", label: "Simulados e avaliações", default: true },
    { key: "classes", label: "Comparação entre turmas", default: true },
    { key: "engagement", label: "Frequência e engajamento", default: true },
    { key: "interventions", label: "Resultados de intervenções", default: false },
  ],
  results: [
    { key: "evolution", label: "Evolução média do aproveitamento", default: true },
    { key: "improving", label: "% de alunos com evolução positiva", default: true },
    { key: "assessments", label: "Simulados realizados", default: true },
    { key: "questions", label: "Questões resolvidas", default: true },
    { key: "subjects", label: "Evolução por disciplina", default: true },
    { key: "participation", label: "Participação nas atividades", default: false },
    { key: "interventions", label: "Resultados de intervenções", default: false },
    { key: "approvals", label: "Aprovações comprovadas", default: false, hint: "Só cadastradas com evidência" },
  ],
};

export const REPORT_FORMATS: Record<BiReportType, ("pdf" | "xlsx")[]> = {
  individual: ["pdf"],
  class: ["pdf", "xlsx"],
  subject: ["pdf", "xlsx"],
  institutional: ["pdf", "xlsx"],
  results: ["pdf"],
};

const TITLES: Record<BiReportType, string> = {
  individual: "Relatório individual",
  class: "Relatório da turma",
  subject: "Relatório da disciplina",
  institutional: "Relatório institucional",
  results: "Relatório de resultados",
};

const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? "—" : `${fmtNumber(v, d)}%`);
const pp = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNumber(Math.abs(v), 1)} pp`);
const metricValue = (m?: BiMetric, unit = "") => (m && m.value !== null ? `${fmtMetricValue(m)}${unit}` : "—");
const metricRow = (label: string, m?: BiMetric, unit = ""): Cell[] => [
  label,
  metricValue(m, unit),
  m && m.previous !== null ? `${fmtMetricValue({ ...m, value: m.previous })}${unit}` : "—",
  m && m.delta !== null ? `${m.delta > 0 ? "+" : ""}${fmtNumber(m.delta, 1)} ${m.delta_unit === "pp" ? "pp" : m.delta_unit === "pts" ? "pts" : "%"}` : "—",
  m ? (m.sufficient ? `n=${m.sample.size}` : `amostra insuficiente (n=${m.sample.size})`) : "",
];
const METRIC_COLUMNS = ["Indicador", "Período", "Anterior", "Variação", "Amostra"];
const slug = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 50);

/** Linhas de metodologia: definição de cada indicador usado + regras gerais. */
function methodology(keys: string[], catalog: Record<string, BiMetricDefinition>, extra: string[] = []): string[] {
  const defs = Array.from(new Set(keys))
    .map((k) => catalog[k])
    .filter((d): d is BiMetricDefinition => !!d)
    .map((d) => `${d.name}: ${d.formula}. ${d.missing}`);
  return [
    ...extra,
    ...defs,
    "Valores sem amostra mínima aparecem como \"—\" (nunca como zero). Online e presencial não são misturados.",
    "Período anterior: mesma duração, terminando no dia anterior ao início do período.",
  ];
}

// ── Montagem por relatório ────────────────────────────────────────────────────

export function buildReportDoc(data: BiAnyReport, opts: ReportOptions, catalog: Record<string, BiMetricDefinition>, context: { label: string }): ReportDoc {
  const on = (k: string) => opts.indicators.includes(k);
  const period = `${fmtDate(data.period.from)} a ${fmtDate(data.period.to)}`;
  const sections: ReportSection[] = [];
  const keys: string[] = [];
  let extra: string[] = [];

  if (opts.executiveSummary.trim() && (data.report === "institutional" || data.report === "results")) {
    sections.push({ kind: "text", title: "Resumo executivo", paragraphs: opts.executiveSummary.trim().split(/\n+/) });
  }

  switch (data.report) {
    case "results": {
      const r = data as BiResultsReport;
      extra = r.methodology;
      const facts: PdfFact[] = [];
      if (on("evolution")) facts.push({ label: "Evolução média do aproveitamento", value: pp(r.headline.evolution_pp) });
      if (on("improving")) facts.push({ label: "Alunos com evolução positiva", value: pct(r.headline.improving_pct, 0) });
      if (on("assessments")) facts.push({ label: "Avaliações realizadas", value: r.headline.assessments_taken.toLocaleString("pt-BR") });
      if (on("questions")) facts.push({ label: "Questões resolvidas", value: r.headline.questions_answered.toLocaleString("pt-BR") });
      if (on("participation")) facts.push({ label: "Participação nos simulados", value: pct(r.headline.participation_pct, 0) });
      if (facts.length) sections.push({ kind: "facts", title: "Destaques do período", facts });
      if (opts.charts && on("evolution")) {
        sections.push({
          kind: "chart",
          title: "Aproveitamento médio por mês",
          description: "Simulados online e avaliações presenciais em séries separadas (% da nota máxima).",
          labels: r.monthly.map((m) => m.label),
          series: [
            { name: "Online", values: r.monthly.map((m) => m.online.value) },
            { name: "Presencial", values: r.monthly.map((m) => m.presencial.value) },
          ],
        });
      }
      if (on("subjects")) {
        sections.push({
          kind: "table",
          title: "Evolução por disciplina",
          description: `Acerto na 1ª metade (${fmtDate(r.halves.start.from)} a ${fmtDate(r.halves.start.to)}) × 2ª metade (${fmtDate(r.halves.end.from)} a ${fmtDate(r.halves.end.to)}).`,
          columns: ["Disciplina", "Início", "Fim", "Variação"],
          rows: r.subjects.map((s) => (s.suppressed ? [s.name, "oculto", "oculto", `menos de ${r.sample.min_group} alunos`] : [s.name, pct(s.start), pct(s.end), pp(s.delta_pp)])),
        });
      }
      if (on("interventions") && r.interventions?.items.length) {
        sections.push({
          kind: "table",
          title: "Resultados de intervenções",
          description: "Antes × depois no alvo de cada intervenção concluída. Resultado observado, não causal.",
          columns: ["Tipo", "Intervenções", "Alunos", "Antes", "Depois", "Variação"],
          rows: r.interventions.items.map((i) => [i.label, i.interventions, i.students, pct(i.before, 0), pct(i.after, 0), pp(i.delta_pp)]),
        });
      }
      if (on("approvals")) {
        sections.push({
          kind: "table",
          title: "Aprovações comprovadas",
          description: `${r.approvals.total} resultado(s) cadastrado(s) com evidência; ${r.approvals.with_consent} com consentimento para divulgação.`,
          columns: ["Concurso", "Aprovados", "Classificados"],
          rows: r.approvals.by_exam.map((a) => [a.label, a.approved, a.classified]),
        });
      }
      extra = [`Amostra: ${r.sample.active_students} alunos ativos; ${r.sample.students_with_evolution} com avaliações comparáveis.`, ...extra];
      break;
    }
    case "institutional": {
      const r = data as BiInstitutionalReport;
      const m = (k: string) => r.overview.metrics.find((x) => x.key === k);
      if (on("indicators")) {
        const list: [string, string, string][] = [
          ["Alunos ativos", "students.active", ""],
          ["Atividade recente", "students.recent_activity", "%"],
          ["Participação nos simulados", "exams.participation", "%"],
          ["Média geral das avaliações", "assessments.avg_pct", "%"],
          ["Acerto no banco de questões", "practice.first_accuracy", "%"],
          ["Frequência média", "attendance.rate", "%"],
          ["Evolução positiva", "students.improving", "%"],
          ["Precisam de reforço", "students.needs_support", ""],
        ];
        list.forEach(([, k]) => keys.push(k));
        sections.push({ kind: "table", title: "Indicadores gerais", columns: METRIC_COLUMNS, rows: list.map(([label, k, u]) => metricRow(label, m(k), u)) });
        if (opts.charts) {
          sections.push({
            kind: "chart",
            title: "Aproveitamento médio por mês",
            labels: r.overview.monthly.map((x) => x.label),
            series: [
              { name: "Online", values: r.overview.monthly.map((x) => x.online.value) },
              { name: "Presencial", values: r.overview.monthly.map((x) => x.presencial.value) },
            ],
          });
        }
      }
      if (on("assessments")) {
        const a = (k: string) => r.assessments.metrics.find((x) => x.key === k);
        ["assessments.count", "assessments.avg_online", "assessments.avg_presencial", "assessments.below_goal_share"].forEach((k) => keys.push(k));
        sections.push({
          kind: "table",
          title: "Simulados e avaliações",
          columns: METRIC_COLUMNS,
          rows: [
            metricRow("Avaliações aplicadas", a("assessments.count")),
            metricRow("Média online", a("assessments.avg_online"), "%"),
            metricRow("Média presencial", a("assessments.avg_presencial"), "%"),
            metricRow("Resultados abaixo da meta", a("assessments.below_goal_share"), "%"),
          ],
        });
      }
      if (on("classes")) {
        sections.push({
          kind: "table",
          title: "Comparação entre turmas",
          description: "Turmas com menos de 10 alunos ficam ocultas (LGPD).",
          columns: ["Turma", "Alunos", "Média online", "Média presencial", "Acerto no banco", "Frequência", "Em atenção"],
          rows: r.classes.items.map((c) =>
            c.suppressed
              ? [c.name, "oculto", "", "", "", "", ""]
              : [c.name, metricValue(c.metrics.students), metricValue(c.metrics.avg_online, "%"), metricValue(c.metrics.avg_presencial, "%"), metricValue(c.metrics.practice, "%"), metricValue(c.metrics.attendance, "%"), metricValue(c.metrics.needs_support)]
          ),
        });
      }
      if (on("engagement") && r.engagement) {
        const e = (k: string) => r.engagement!.metrics.find((x) => x.key === k);
        ["engagement.active_days_week", "engagement.index_avg", "students.low_attendance"].forEach((k) => keys.push(k));
        sections.push({
          kind: "table",
          title: "Frequência e engajamento",
          columns: METRIC_COLUMNS,
          rows: [
            metricRow("Frequência média", e("attendance.rate"), "%"),
            metricRow("Dias ativos por semana", e("engagement.active_days_week")),
            metricRow("Engajamento médio (0–100)", e("engagement.index_avg")),
            metricRow("Alunos com frequência baixa", e("students.low_attendance")),
          ],
        });
      }
      if (on("interventions") && r.interventions) {
        sections.push({
          kind: "table",
          title: "Resultados de intervenções",
          description: `${r.interventions.summary.active} ativas · ${r.interventions.effectiveness.completed} concluídas no período. Resultado observado, não causal.`,
          columns: ["Tipo", "Intervenções", "Alunos", "Antes", "Depois", "Variação"],
          rows: r.interventions.effectiveness.items.map((i) => [i.label, i.interventions, i.students, pct(i.before, 0), pct(i.after, 0), pp(i.delta_pp)]),
        });
      }
      break;
    }
    case "class": {
      const r = data as BiClassReport;
      const m = (k: string) => r.overview.metrics.find((x) => x.key === k);
      if (on("indicators")) {
        const list: [string, string, string][] = [
          ["Alunos ativos", "students.active", ""],
          ["Participação nos simulados", "exams.participation", "%"],
          ["Média geral das avaliações", "assessments.avg_pct", "%"],
          ["Acerto no banco de questões", "practice.first_accuracy", "%"],
          ["Frequência média", "attendance.rate", "%"],
          ["Precisam de reforço", "students.needs_support", ""],
        ];
        list.forEach(([, k]) => keys.push(k));
        sections.push({ kind: "table", title: "Indicadores da turma", columns: METRIC_COLUMNS, rows: list.map(([label, k, u]) => metricRow(label, m(k), u)) });
      }
      if (on("evolution") && opts.charts) {
        sections.push({
          kind: "chart",
          title: "Aproveitamento médio por mês",
          labels: r.overview.monthly.map((x) => x.label),
          series: [
            { name: "Online", values: r.overview.monthly.map((x) => x.online.value) },
            { name: "Presencial", values: r.overview.monthly.map((x) => x.presencial.value) },
          ],
        });
      }
      if (on("subjects")) {
        sections.push({
          kind: "table",
          title: "Disciplinas com maior dificuldade",
          columns: ["Disciplina", "Acerto", "Respostas", "Assunto mais crítico"],
          rows: r.overview.subjects_difficulty.map((s) => [s.name, pct(s.accuracy), s.answers, s.critical_topic ? `${s.critical_topic.name} (${pct(s.critical_topic.accuracy, 0)})` : "—"]),
        });
      }
      if (on("students")) {
        const v = (c: { value: number | null; n: number }) => (c.value === null ? "—" : pct(c.value, 0));
        sections.push({
          kind: "table",
          title: "Alunos",
          description: "Em atenção primeiro.",
          columns: ["Aluno", "Online", "Presencial", "Banco", "Frequência", "Evolução", "Atenção"],
          rows: r.detail.students.items.map((s) => [s.name, v(s.online), v(s.presencial), v(s.practice), v(s.attendance), pp(s.evolution_pp), s.reasons.map((x) => x.label).join("; ") || "—"]),
        });
      }
      break;
    }
    case "subject": {
      const a = (data as BiSubjectReport).analytics;
      const m = (k: string) => a.metrics.find((x) => x.key === k);
      if (on("indicators")) {
        ["subject.answers", "subject.accuracy", "subject.students_evaluated", "subject.topics_below_goal"].forEach((k) => keys.push(k));
        sections.push({
          kind: "table",
          title: "Indicadores da disciplina",
          columns: METRIC_COLUMNS,
          rows: [
            metricRow("Questões respondidas", m("subject.answers")),
            metricRow("Acertos", m("subject.accuracy"), "%"),
            metricRow("Alunos avaliados", m("subject.students_evaluated")),
            metricRow("Assuntos abaixo da meta", m("subject.topics_below_goal")),
          ],
        });
      }
      if (on("ranking")) {
        sections.push({
          kind: "table",
          title: "Ranking de assuntos",
          description: "Menor aproveitamento primeiro.",
          columns: ["Assunto", "Acerto", "Variação", "Respostas", "Alunos"],
          rows: a.ranking.items.map((t) => [t.name, pct(t.accuracy), pp(t.delta_pp), t.answers, t.students]),
        });
      }
      if (on("heatmap") && a.heatmap && a.heatmap.rows.length) {
        sections.push({
          kind: "table",
          title: "Turmas × assuntos",
          description: "% de acertos; \"—\" = amostra insuficiente.",
          columns: ["Turma", ...a.heatmap.topics.map((t) => t.name)],
          rows: a.heatmap.rows.map((row) => [row.name, ...row.cells.map((c) => (c.value === null ? "—" : pct(c.value, 0)))]),
        });
      }
      break;
    }
    case "individual": {
      const r = data as BiIndividualReport;
      const d = r.diagnosis;
      const s = r.evolution.student;
      if (on("indices") && d) {
        ["index.learning", "index.engagement", "index.preparation"].forEach((k) => keys.push(k));
        sections.push({
          kind: "table",
          title: "Diagnóstico 360°",
          description: `Índices de 0 a 100 · turma de referência ${d.student.school_class.name}.`,
          columns: ["Dimensão", "Aluno", "Turma", "Variação", "Componentes"],
          rows: (["learning", "engagement", "preparation"] as const).map((k) => {
            const dim = d.dimensions[k];
            return [
              { learning: "Aprendizagem", engagement: "Engajamento", preparation: "Preparação" }[k],
              dim.value === null ? "—" : fmtNumber(dim.value, 0),
              dim.class_avg === null ? "—" : fmtNumber(dim.class_avg, 0),
              dim.delta === null ? "—" : `${dim.delta > 0 ? "+" : ""}${fmtNumber(dim.delta, 0)} pts`,
              dim.components.map((c) => `${c.label}: ${c.sufficient ? fmtNumber(c.value as number, 0) : "—"}`).join("; "),
            ];
          }),
        });
      }
      if (on("evolution")) {
        r.evolution.series.forEach((serie) => {
          const name = `${serie.modality === "online" ? "Online" : "Presencial"}${serie.exam_type ? ` · ${serie.exam_type}` : ""}`;
          if (opts.charts && serie.points.length > 1) {
            sections.push({
              kind: "chart",
              title: `Avaliações comparáveis · ${name}`,
              labels: serie.points.map((p) => fmtDate(p.date).slice(0, 5)),
              series: [
                { name: "Aluno", values: serie.points.map((p) => p.pct) },
                { name: "Colegas", values: serie.points.map((p) => p.peers_avg) },
              ],
            });
          }
          sections.push({
            kind: "table",
            title: `Resultados · ${name}`,
            columns: ["Data", "Avaliação", "Aluno", "Colegas"],
            rows: serie.points.map((p) => [fmtDate(p.date), p.title, pct(p.pct), p.peers_avg === null ? "—" : `${pct(p.peers_avg)} (n=${p.peers_n})`]),
          });
        });
      }
      if (on("subjects")) {
        sections.push({
          kind: "table",
          title: "Acerto por disciplina",
          columns: ["Disciplina", "Aluno", "Colegas", "Respostas"],
          rows: r.evolution.subjects.map((x) => [x.name, pct(x.accuracy, 0), pct(x.peers_accuracy, 0), x.answers]),
        });
      }
      if (on("topics")) {
        sections.push({
          kind: "table",
          title: "Assuntos críticos e em evolução",
          columns: ["Assunto", "Disciplina", "Acerto", "Variação", "Situação"],
          rows: [
            ...r.evolution.topics.critical.map((t) => [t.name, t.subject, pct(t.accuracy, 0), pp(t.delta_pp), "Crítico"]),
            ...r.evolution.topics.improving.map((t) => [t.name, t.subject, pct(t.accuracy, 0), pp(t.delta_pp), "Em evolução"]),
          ],
        });
      }
      if (on("recommendations") && d?.recommendations.length) {
        sections.push({ kind: "text", title: "Recomendações", paragraphs: d.recommendations.map((x) => `${x.title} — motivo: ${x.reason}`) });
      }
      if (on("interventions") && r.interventions.length) {
        sections.push({
          kind: "table",
          title: "Intervenções",
          columns: ["Código", "Intervenção", "Situação", "Início", "Reavaliação"],
          rows: r.interventions.map((i) => [i.code, i.title, i.status, fmtDate(i.starts_on), i.reassess_on ? fmtDate(i.reassess_on) : "—"]),
        });
      }
      if (s) {
        sections.unshift({
          kind: "facts",
          title: "Resumo",
          facts: [
            { label: "Média online", value: pct(s.online.value) },
            { label: "Média presencial", value: pct(s.presencial.value) },
            { label: "Acerto no banco", value: pct(s.practice.value) },
            { label: "Frequência", value: pct(s.attendance.value) },
            { label: "Evolução", value: pp(s.evolution_pp) },
          ],
        });
      }
      break;
    }
  }

  return {
    fileName: `${slug(TITLES[data.report])}-${slug(context.label)}-${data.period.to}`,
    title: TITLES[data.report],
    subtitle: context.label,
    facts: [
      { label: "Período", value: period },
      { label: "Meta pedagógica", value: `${fmtNumber(data.goal_pct, 0)}%` },
      { label: "Gerado em", value: new Date(data.generated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) },
    ],
    sections,
    methodology: methodology(keys, catalog, extra),
  };
}

// ── PDF (padrão visual dos PDFs do painel) ────────────────────────────────────

const SERIES_RGB = PDF_COLOR.series;

export async function renderReportPdf(doc: ReportDoc, letterhead: boolean): Promise<void> {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageHeight = pdf.internal.pageSize.getHeight();
  const width = pdf.internal.pageSize.getWidth() - PDF_MARGIN * 2;
  let y = letterhead ? await drawTenantPdfHeader(pdf, { marginLeft: PDF_MARGIN, marginRight: PDF_MARGIN }) : 16;
  const ensure = (space: number) => {
    if (y + space > pageHeight - 16) {
      pdf.addPage();
      y = 16;
    }
  };
  const heading = (title: string, description?: string) => {
    ensure(18);
    setText(pdf, PDF_COLOR.ink, PDF_TYPE.subtitle, "bold");
    pdf.text(title, PDF_MARGIN, y);
    y += 5;
    if (description) {
      setText(pdf, PDF_COLOR.inkMuted, PDF_TYPE.caption);
      const lines = pdf.splitTextToSize(description, width);
      pdf.text(lines, PDF_MARGIN, y);
      y += lines.length * 3.6;
    }
    y += 1;
  };

  y = drawDocumentTitle(pdf, y, { overline: "Inteligência Educacional", title: doc.title, description: doc.subtitle });
  y = drawFactsStrip(pdf, y, doc.facts);

  for (const section of doc.sections) {
    if (section.kind === "facts") {
      heading(section.title);
      y = drawFactsStrip(pdf, y, section.facts);
    } else if (section.kind === "text") {
      heading(section.title);
      setText(pdf, PDF_COLOR.ink, PDF_TYPE.body);
      for (const p of section.paragraphs) {
        const lines = pdf.splitTextToSize(p, width);
        ensure(lines.length * 4.4 + 2);
        pdf.text(lines, PDF_MARGIN, y);
        y += lines.length * 4.4 + 2;
      }
      y += 2;
    } else if (section.kind === "table") {
      heading(section.title, section.description);
      autoTable(pdf, {
        ...pdfTableStyles({ fontSize: 8 }),
        startY: y,
        head: [section.columns],
        body: section.rows.map((r) => r.map((c) => (c === null ? "—" : typeof c === "number" ? c.toLocaleString("pt-BR") : c))),
      });
      y = ((pdf as any).lastAutoTable?.finalY ?? y) + 6;
    } else if (section.kind === "chart") {
      heading(section.title, section.description);
      ensure(58);
      y = drawLineChart(pdf, y, width, 48, section);
    }
  }

  // Metodologia sempre em página própria (obrigatória).
  pdf.addPage();
  y = 16;
  heading("Metodologia e amostra");
  setText(pdf, PDF_COLOR.inkMuted, PDF_TYPE.label);
  for (const line of doc.methodology) {
    const lines = pdf.splitTextToSize(`• ${line}`, width);
    ensure(lines.length * 3.8 + 1.5);
    pdf.text(lines, PDF_MARGIN, y);
    y += lines.length * 3.8 + 1.5;
  }

  drawPageFooters(pdf, doc.title);
  pdf.save(`${doc.fileName}.pdf`);
}

function drawLineChart(pdf: jsPDF, top: number, width: number, height: number, chart: Extract<ReportSection, { kind: "chart" }>): number {
  const left = PDF_MARGIN + 10;
  const plotW = width - 12;
  const n = chart.labels.length;
  const x = (i: number) => left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v: number) => top + height - (Math.max(0, Math.min(100, v)) / 100) * height;

  pdf.setDrawColor(...PDF_COLOR.border);
  pdf.setLineWidth(0.2);
  [0, 50, 100].forEach((t) => {
    pdf.line(left, y(t), left + plotW, y(t));
    setText(pdf, PDF_COLOR.inkSubtle, 6.5);
    pdf.text(`${t}%`, left - 2, y(t) + 1, { align: "right" });
  });
  chart.labels.forEach((l, i) => {
    setText(pdf, PDF_COLOR.inkSubtle, 6.5);
    pdf.text(l, x(i), top + height + 4, { align: "center" });
  });
  chart.series.forEach((s, k) => {
    const rgb = SERIES_RGB[k % SERIES_RGB.length];
    pdf.setDrawColor(...rgb);
    pdf.setFillColor(...rgb);
    pdf.setLineWidth(0.6);
    s.values.forEach((v, i) => {
      if (v === null) return;
      const prev = s.values[i - 1];
      if (i > 0 && prev !== null && prev !== undefined) pdf.line(x(i - 1), y(prev), x(i), y(v));
      pdf.circle(x(i), y(v), 0.7, "F");
    });
  });
  // Legenda (a cor nunca é a única pista: nome escrito ao lado).
  let lx = left;
  const ly = top + height + 9;
  chart.series.forEach((s, k) => {
    const rgb = SERIES_RGB[k % SERIES_RGB.length];
    pdf.setFillColor(...rgb);
    pdf.rect(lx, ly - 2, 4, 1.2, "F");
    setText(pdf, PDF_COLOR.inkMuted, 7);
    pdf.text(s.name, lx + 5, ly);
    lx += 8 + pdf.getTextWidth(s.name) + 6;
  });
  return ly + 6;
}

// ── XLSX (SheetJS): uma aba por tabela + resumo + metodologia ─────────────────

export function renderReportXlsx(doc: ReportDoc): void {
  const book = XLSX.utils.book_new();
  const used = new Set<string>();
  const sheetName = (title: string) => {
    let base = title.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Aba";
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base.slice(0, 26)} ${i++}`;
    used.add(name);
    return name;
  };

  const summary: Cell[][] = [[doc.title], [doc.subtitle], [], ...doc.facts.map((f) => [f.label, f.value])];
  doc.sections.forEach((s) => {
    if (s.kind === "facts") {
      summary.push([], [s.title], ...s.facts.map((f) => [f.label, f.value]));
    }
    if (s.kind === "text") {
      summary.push([], [s.title], ...s.paragraphs.map((p) => [p]));
    }
  });
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), sheetName("Resumo"));

  doc.sections.forEach((s) => {
    if (s.kind === "table") {
      const rows: Cell[][] = [[s.title], ...(s.description ? [[s.description]] : []), [], s.columns, ...s.rows];
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName(s.title));
    }
    if (s.kind === "chart") {
      const rows: Cell[][] = [[s.title], [], ["Mês", ...s.series.map((x) => x.name)], ...s.labels.map((l, i) => [l, ...s.series.map((x) => x.values[i])])];
      XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName(s.title));
    }
  });
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Metodologia e amostra"], [], ...doc.methodology.map((l) => [l])]), sheetName("Metodologia"));

  XLSX.writeFile(book, `${doc.fileName}.xlsx`);
}
