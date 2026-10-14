import { useState, type FormEvent } from "react";
import { API_URL } from "../config";

type Status = "idle" | "sending" | "sent" | "error";

/** Opções aceitas pela API (StoreLeadRequest) — manter em sincronia. */
const ROLES = ["Diretor(a) ou proprietário(a)", "Coordenador(a)", "Secretaria / financeiro", "Professor(a)"];
const STUDENTS = ["Até 100", "101 a 300", "301 a 1.000", "Mais de 1.000"];

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>;
}

/** Pedido de demonstração. O campo company_website fica oculto para filtrar envios automáticos. */
export default function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "sending") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? "");
    setStatus("sending");
    setError(null);

    try {
      const response = await fetch(`${API_URL}/leads`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          name: field("name"),
          role: field("role"),
          email: field("email"),
          phone: field("phone"),
          institution: field("institution"),
          students_range: field("students_range"),
          message: field("message"),
          company_website: field("company_website"),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const first = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new Error(typeof first === "string" ? first : "Não foi possível enviar. Tente de novo.");
      }
      form.reset();
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Não foi possível enviar. Tente de novo.");
    }
  };

  return (
    <form className="fcard" aria-labelledby="demo-t" onSubmit={(event) => void submit(event)}>
      <h3 id="demo-t">Agende sua demonstração</h3>
      <p className="s">Responderemos em até [PRAZO DE RETORNO].</p>
      {status === "sent" ? (
        <p className="ok" role="status">Recebemos seu pedido. Em breve a equipe entra em contato.</p>
      ) : (
        <>
          <div className="fgrid2">
            <div className="ff"><label htmlFor="d-nome">Seu nome</label><input id="d-nome" name="name" type="text" autoComplete="name" placeholder="Nome e sobrenome" required maxLength={120} /></div>
            <div className="ff"><label htmlFor="d-cargo">Cargo</label><div className="selw"><select id="d-cargo" name="role">{ROLES.map((o) => <option key={o}>{o}</option>)}</select><Chevron /></div></div>
            <div className="ff"><label htmlFor="d-mail">E-mail</label><input id="d-mail" name="email" type="email" autoComplete="email" placeholder="voce@cursinho.com.br" required maxLength={160} /></div>
            <div className="ff"><label htmlFor="d-tel">WhatsApp</label><input id="d-tel" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(00) 00000-0000" required /></div>
            <div className="ff"><label htmlFor="d-esc">Nome do cursinho</label><input id="d-esc" name="institution" type="text" autoComplete="organization" placeholder="Ex.: Cursinho Alfa" required maxLength={160} /></div>
            <div className="ff"><label htmlFor="d-qtd">Quantos alunos?</label><div className="selw"><select id="d-qtd" name="students_range">{STUDENTS.map((o) => <option key={o}>{o}</option>)}</select><Chevron /></div></div>
            <div className="ff w"><label htmlFor="d-msg">O que você quer ver? <em>(opcional)</em></label><textarea id="d-msg" name="message" maxLength={1000} placeholder="Ex.: importação de provas em PDF, financeiro, app do aluno…" /></div>
            <div className="hp" aria-hidden="true"><label htmlFor="d-site">Site</label><input id="d-site" name="company_website" tabIndex={-1} autoComplete="off" /></div>
          </div>
          {error ? <p className="err" role="alert">{error}</p> : null}
          <button type="submit" className="btn btn-p" disabled={status === "sending"}>
            {status === "sending" ? "Enviando…" : "Solicitar demonstração"}
            {status === "sending" ? null : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>}
          </button>
          <div className="priv"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4"></path></svg><span>Usamos seus dados só para falar sobre a demonstração. <a href="#privacidade">Política de privacidade</a>.</span></div>
        </>
      )}
    </form>
  );
}
