import type { BiMetric } from "../../services/biService";

export type MetricTile = { key: string; label: string; unit?: string; hint?: string; goodWhen?: "up" | "down" };

/** Cards da Visão geral (também usados no detalhe da turma, com o mesmo cálculo de /bi/overview). */
export function overviewTiles(metric: (key: string) => BiMetric | undefined): MetricTile[] {
  const improving = metric("students.improving");

  return [
    { key: "students.active", label: "Alunos ativos" },
    { key: "students.recent_activity", label: "Atividade recente", unit: "%", hint: "nos últimos 14 dias" },
    { key: "exams.participation", label: "Participação nos simulados", unit: "%" },
    { key: "assessments.avg_pct", label: "Média geral dos simulados", unit: "%" },
    { key: "practice.first_accuracy", label: "Acertos no banco de questões", unit: "%" },
    { key: "attendance.rate", label: "Frequência média", unit: "%" },
    {
      key: "students.improving",
      label: "Evolução positiva",
      unit: "%",
      hint: improving?.sample.with_sample !== undefined ? `de ${improving.sample.with_sample} com amostra` : undefined,
    },
    { key: "students.needs_support", label: "Precisam de reforço", goodWhen: "down" },
  ];
}
