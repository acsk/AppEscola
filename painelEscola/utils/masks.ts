// ─── Telefone ─────────────────────────────────────────────────────────────────
// (XX) XXXX-XXXX (fixo) ou (XX) XXXXX-XXXX (celular)
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// WhatsApp usa a mesma máscara de telefone nacional
export function maskWhatsapp(value: string): string {
  return maskPhone(value);
}

export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

// ─── CEP ──────────────────────────────────────────────────────────────────────
// XXXXX-XXX
export function maskCEP(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function isValidCEP(value: string): boolean {
  return onlyDigits(value).length === 8;
}

// ─── CNPJ ─────────────────────────────────────────────────────────────────────
// XX.XXX.XXX/XXXX-XX
export function maskCNPJ(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcCheckDigit = (base: string, factors: number[]) => {
    const sum = base
      .split("")
      .reduce((acc, digit, idx) => acc + parseInt(digit, 10) * factors[idx], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base12 = cnpj.slice(0, 12);
  const d1 = calcCheckDigit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const base13 = `${base12}${d1}`;
  const d2 = calcCheckDigit(base13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return cnpj === `${base12}${d1}${d2}`;
}

// ─── CPF ──────────────────────────────────────────────────────────────────────
// XXX.XXX.XXX-XX
export function maskCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCPF(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  // Rejeita sequências iguais (111.111.111-11 etc.)
  if (/^(\d)\1{10}$/.test(d)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r1 = 11 - (sum % 11);
  if (r1 >= 10) r1 = 0;
  if (r1 !== parseInt(d[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  let r2 = 11 - (sum % 11);
  if (r2 >= 10) r2 = 0;
  return r2 === parseInt(d[10]);
}

// ─── Hora ─────────────────────────────────────────────────────────────────────
// Aplica máscara HH:MM enquanto o usuário digita
export function maskTime(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  const h = Math.min(parseInt(d.slice(0, 2), 10), 23);
  const m = d.slice(2);
  const hStr = String(h).padStart(2, "0");
  if (m.length === 0) return `${hStr}:`;
  const mNum = parseInt(m, 10);
  const mStr = m.length === 2 ? String(Math.min(mNum, 59)).padStart(2, "0") : m;
  return `${hStr}:${mStr}`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────
// Aplica máscara DD/MM/AAAA enquanto o usuário digita
export function maskDate(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// DD/MM/AAAA → YYYY-MM-DD (para enviar à API)
export function displayToISO(display: string): string {
  if (!display || display.length < 10) return "";
  const [day, month, year] = display.split("/");
  if (!day || !month || !year || year.length < 4) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// YYYY-MM-DD → DD/MM/AAAA (para exibir no formulário)
export function isoToDisplay(iso: string): string {
  if (!iso) return "";
  if (iso.includes("/")) return iso; // já está no formato display
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

// ─── Data e hora ──────────────────────────────────────────────────────────────

// Aplica máscara DD/MM/AAAA HH:MM enquanto o usuário digita
export function maskDateTime(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 12);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  const datePart = `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
  if (d.length <= 10) return `${datePart} ${d.slice(8, 10)}`;
  const h = Math.min(parseInt(d.slice(8, 10), 10) || 0, 23);
  const mRaw = d.slice(10, 12);
  const hStr = String(h).padStart(2, "0");
  if (mRaw.length === 0) return `${datePart} ${hStr}:`;
  const mNum = parseInt(mRaw, 10);
  const mStr = mRaw.length === 2 ? String(Math.min(Number.isNaN(mNum) ? 0 : mNum, 59)).padStart(2, "0") : mRaw;
  return `${datePart} ${hStr}:${mStr}`;
}

/** Mantém apenas dígitos (números inteiros). */
export function onlyIntegerInput(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, "");
  return maxLength != null ? digits.slice(0, maxLength) : digits;
}

/** Mantém número decimal com até `maxDecimals` casas. */
export function onlyDecimalInput(value: string, maxDecimals = 2): string {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const dotIndex = normalized.indexOf(".");
  if (dotIndex === -1) return normalized;
  const intPart = normalized.slice(0, dotIndex);
  const decPart = normalized.slice(dotIndex + 1).replace(/\./g, "");
  return decPart.length > 0 ? `${intPart}.${decPart.slice(0, maxDecimals)}` : intPart;
}

/** Valida DD/MM/AAAA HH:MM completo. */
export function isValidDisplayDateTime(display: string): boolean {
  const trimmed = display.trim();
  if (!trimmed || trimmed.length < 16) return false;
  const iso = displayDateTimeToISO(trimmed);
  if (!iso) return false;
  const [datePart, timePart] = trimmed.split(" ");
  if (!datePart || !timePart || timePart.length !== 5) return false;
  const [day, month, year] = datePart.split("/").map((p) => parseInt(p, 10));
  const [hh, mm] = timePart.split(":").map((p) => parseInt(p, 10));
  if ([day, month, year, hh, mm].some((n) => Number.isNaN(n))) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;
  const d = new Date(year, month - 1, day, hh, mm, 0, 0);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day &&
    d.getHours() === hh &&
    d.getMinutes() === mm
  );
}

export function displayDateTimeToMs(display: string): number | null {
  const iso = displayDateTimeToISO(display.trim());
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// DD/MM/AAAA HH:MM → YYYY-MM-DDTHH:MM:00 (para enviar à API)
export function displayDateTimeToISO(display: string): string {
  if (!display || display.length < 16) return "";
  const [datePart, timePart] = display.split(" ");
  if (!datePart || !timePart) return "";
  const [day, month, year] = datePart.split("/");
  if (!day || !month || !year || year.length < 4) return "";
  const [hh, mm] = timePart.split(":");
  if (!hh || !mm) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:00`;
}

// ─── Moeda ────────────────────────────────────────────────────────────────────
// Formata enquanto digita: 1234 → "12,34" / 123456 → "1.234,56"
export function maskCurrency(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13); // máx 99.999.999,99
  if (!digits) return "";
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// "1.234,56" → 1234.56 (para enviar à API)
export function currencyToFloat(masked: string): number {
  const clean = masked.replace(/\./g, "").replace(",", ".");
  const val = parseFloat(clean);
  return Number.isNaN(val) ? 0 : val;
}

// 1234.56 → "1.234,56" (para exibir no formulário a partir do valor da API)
export function floatToCurrency(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** decimal(10,2) — valor máximo permitido no banco. */
export const MAX_DB_DECIMAL_AMOUNT = 99_999_999.99;

export function isWithinDbDecimalAmount(value: number): boolean {
  return value >= 0 && value <= MAX_DB_DECIMAL_AMOUNT;
}

/** Dia de vencimento (1–28), conforme payment_due_day (tinyInteger). */
export function maskPaymentDueDay(value: string): string {
  const d = onlyIntegerInput(value, 2);
  if (d === "") return "";
  const n = parseInt(d, 10);
  if (Number.isNaN(n)) return "";
  if (n > 28) return "28";
  return d;
}

export function parsePaymentDueDay(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  if (Number.isNaN(n) || n < 1 || n > 28) return null;
  return n;
}

// YYYY-MM-DDTHH:MM:SS[.000Z] → DD/MM/AAAA HH:MM (para exibir no formulário)
export function isoToDisplayDateTime(iso: string): string {
  if (!iso) return "";
  // Normaliza: 2026-06-01T08:00:00.000Z ou 2026-06-01T08:00:00
  const clean = iso.replace("Z", "").split(".")[0]; // "2026-06-01T08:00:00"
  const [datePart, timePart] = clean.split("T");
  if (!datePart) return "";
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return "";
  const time = timePart ? timePart.slice(0, 5) : "00:00"; // HH:MM
  return `${day}/${month}/${year} ${time}`;
}
