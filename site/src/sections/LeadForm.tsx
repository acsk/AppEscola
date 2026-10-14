import { useState, type FormEvent } from "react";
import { API_URL } from "../config";

type Status = "idle" | "sending" | "sent" | "error";

/** Pedido de demonstração. O campo company_website fica oculto para filtrar envios automáticos. */
export default function LeadForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "sending") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setError(null);

    try {
      const response = await fetch(`${API_URL}/leads`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          phone: String(data.get("phone") ?? ""),
          institution: String(data.get("institution") ?? ""),
          message: String(data.get("message") ?? ""),
          company_website: String(data.get("company_website") ?? ""),
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

  if (status === "sent") {
    return <p className="lead-ok" role="status">Recebemos seu pedido. Em breve a equipe entra em contato.</p>;
  }

  return (
    <form className="lead-form" onSubmit={(event) => void submit(event)}>
      <label>
        Nome
        <input name="name" autoComplete="name" required maxLength={120} />
      </label>
      <label>
        E-mail
        <input name="email" type="email" autoComplete="email" required maxLength={160} />
      </label>
      <label>
        Telefone
        <input name="phone" type="tel" autoComplete="tel" required inputMode="tel" placeholder="(00) 00000-0000" />
      </label>
      <label>
        Cursinho
        <input name="institution" autoComplete="organization" required maxLength={160} />
      </label>
      <label className="wide">
        Mensagem
        <textarea name="message" maxLength={1000} rows={3} placeholder="Conte o que você quer ver na demonstração" />
      </label>
      <label className="hp" aria-hidden="true">
        Site
        <input name="company_website" tabIndex={-1} autoComplete="off" />
      </label>
      {error ? <p className="lead-err wide" role="alert">{error}</p> : null}
      <button className="btn btn-w wide" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Enviando…" : "Solicitar demonstração"}
      </button>
    </form>
  );
}
