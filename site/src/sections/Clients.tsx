import { useEffect, useState } from "react";
import { API_URL } from "../config";
import aprova from "../../assets/logo-curso/aprova.png";
import elite from "../../assets/logo-curso/elite.png";
import metaCerta from "../../assets/logo-curso/meta-certa.png";

type Cliente = { name: string; logo_url: string };

function endereco(asset: string | { uri: string }): string {
  return typeof asset === "string" ? asset : asset.uri;
}

const MARCAS = [
  { src: endereco(aprova), alt: "Aprova+" },
  { src: endereco(elite), alt: "Elite Preparatórios" },
  { src: endereco(metaCerta), alt: "Meta Certa" },
];

/** Dois espaços ainda reservados para as logos que faltam. */
const VAGAS = [2].map((n) => ({
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
            <li key={client.logo_url} className="marca">
              <img src={client.logo_url} alt={client.name} onError={(event) => { event.currentTarget.parentElement?.remove(); }} />
            </li>
          ))}
          {MARCAS.map((logo) => (
            <li key={logo.alt} className="marca">
              <img src={logo.src} alt={logo.alt} />
            </li>
          ))}
          {/* {VAGAS.map((logo) => (
            <li key={logo.src} className="slot">
              <img src={logo.src} alt={logo.alt} />
            </li>
          ))} */}
        </ul>
      </div>
    </section>
  );
}
