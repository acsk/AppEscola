import type { Referencia } from '../../../services/financeiro.service';

export function formatarMoeda(valor: string | number): string {
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarData(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Ex.: `2026-05-01` → `Maio/2026` a partir de `referencia.inicio_mes`. */
export function formatarReferenciaMes(referencia: Referencia): string {
  const iso = referencia.inicio_mes || referencia.fim_mes || referencia.hoje;
  const [anoStr, mesStr] = iso.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr);

  if (!ano || !mes) return '';

  const label = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  const partes = label.split(' de ');
  if (partes.length === 2) {
    const nomeMes = partes[0].charAt(0).toUpperCase() + partes[0].slice(1);
    return `${nomeMes}/${partes[1]}`;
  }

  return label;
}
