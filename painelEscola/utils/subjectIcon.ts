const SUBJECT_ICON_MAP: Record<string, string> = {
  "book-open": "book-outline",
  book: "book-outline",
  calculator: "calculator-outline",
  flask: "flask-outline",
  beaker: "flask-outline",
  globe: "globe-outline",
  atom: "nuclear-outline",
  pencil: "pencil-outline",
  "chart-bar": "bar-chart-outline",
  music: "musical-notes-outline",
  "paint-brush": "color-palette-outline",
  dumbbell: "barbell-outline",
  computer: "desktop-outline",
  code: "code-slash-outline",
};

export function subjectIconName(icon: string): string {
  return SUBJECT_ICON_MAP[icon] ?? "school-outline";
}
