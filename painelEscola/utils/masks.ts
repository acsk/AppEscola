// ─── Telefone ─────────────────────────────────────────────────────────────────
// (XX) XXXX-XXXX (fixo) ou (XX) XXXXX-XXXX (celular)
export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ─── CPF ──────────────────────────────────────────────────────────────────────
// XXX.XXX.XXX-XX
export function maskCPF(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
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
