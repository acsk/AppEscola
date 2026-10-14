import { useEffect, useState } from "react";
import { API_URL } from "../config";

type Cliente = { name: string; logo_url: string };

/** Substitua estes arquivos pelas logos fictícias, mantendo o nome. */
const FICTICIAS = [1, 2, 3, 4, 5].map((n) => ({
  src: `/clientes/0${n}.svg`,
  alt: `Espaço para logo ${n}`,
}));

/** Faixa de clientes: logos das escolas ativas e cinco vagas para logos fictícias. */
export default function Clients() {
  const [clients, setClients] = useState<Cliente[]>([]);

  useEffect(() => {
    let cancel = false;
    fetch(`${API_URL}/site/clients`, { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const list = payload?.body?.clients;
        if (cancel || !Array.isArray(list)) return;
        setClients(list.filter((item: Cliente) => item?.logo_url && item?.name));
      })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, []);

  return (
    <section className="clients" id="clientes" aria-label="Clientes">
      <div className="wrap">
        <p className="clients-label">Clientes</p>
        <ul className="clients-row">
          {clients.map((client) => (
            <li key={client.logo_url}>
              <img src={client.logo_url} alt={client.name} onError={(event) => { event.currentTarget.parentElement?.remove(); }} />
            </li>
          ))}
          {FICTICIAS.map((logo) => (
            <li key={logo.src} className="slot">
              <img src={logo.src} alt={logo.alt} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
