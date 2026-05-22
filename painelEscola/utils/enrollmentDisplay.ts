import type { EnrollmentSummary } from "../types/matriculas";

export type EnrollmentProductKind = "bundle" | "plan" | "unknown";

export function enrollmentProductKind(
  item: Pick<EnrollmentSummary, "bundle_id" | "bundle" | "course_plan_id" | "course_plan">
): EnrollmentProductKind {
  if (item.bundle_id != null || item.bundle) {
    return "bundle";
  }
  if (item.course_plan) {
    return "plan";
  }
  return "unknown";
}

/** Nome do pacote, curso ou plano exibido na lista. */
export function enrollmentProductTitle(item: EnrollmentSummary): string {
  if (enrollmentProductKind(item) === "bundle") {
    return item.bundle?.name ?? "Pacote";
  }

  return (
    item.course_plan?.course?.name ??
    item.school_class?.course?.name ??
    item.course_plan?.name ??
    "—"
  );
}

/** Turma(s) ou detalhe secundário na lista. */
export function enrollmentProductSubtitle(item: EnrollmentSummary): string | null {
  if (enrollmentProductKind(item) === "bundle") {
    const classes = item.school_classes?.length
      ? item.school_classes
      : item.school_class
        ? [item.school_class]
        : [];

    if (classes.length === 0) {
      return null;
    }

    return classes
      .map((sc) => {
        const course = sc.course?.name;
        return course ? `${course} · ${sc.name}` : sc.name;
      })
      .join(" · ");
  }

  const className = item.school_class?.name;
  if (!className) {
    return item.course_plan?.name ? `Plano ${item.course_plan.name}` : null;
  }

  return item.course_plan?.name
    ? `${className} · Plano ${item.course_plan.name}`
    : className;
}

export function enrollmentProductBadgeLabel(item: EnrollmentSummary): string | null {
  const kind = enrollmentProductKind(item);
  if (kind === "bundle") return "Pacote";
  if (kind === "plan") return "Plano";
  return null;
}
