import { useEffect, useState } from "react";
import { API_URL } from "../config";
import aprova from "../../assets/logo-curso/aprova.png";
import conectivo from "../../assets/logo-curso/conectivo.png";
import elite from "../../assets/logo-curso/elite.png";
import metaCerta from "../../assets/logo-curso/meta-certa.png";

type Marca = { name: string; src: string };

function endereco(asset: string | { uri: string }): string {
  return typeof asset === "string" ? asset : asset.uri;
}

/** Logos fixas, exibidas mesmo se a API não responder. */
const MARCAS: Marca[] = [
  { name: "Conectivo Cursos", src: endereco(conectivo) },
  { name: "Aprova+", src: endereco(aprova) },
  { name: "Elite Preparatórios", src: endereco(elite) },
  { name: "Meta Certa", src: endereco(metaCerta) },
];

/** A faixa rola 1/3 do trilho por ciclo (keyframes `marq`), por isso a lista é repetida 3 vezes. */
const COPIAS = 3;

const chave = (name: string) => name.trim().toLocaleLowerCase("pt-BR");

/** Faixa "Quem já usa": logos fixas + escolas ativas vindas da API (sem repetir nomes). */
export default function Clients() {
  const [marcas, setMarcas] = useState<Marca[]>(MARCAS);

  useEffect(() => {
    let cancel = false;
    fetch(`${API_URL}/site/clients`, { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const list = payload?.body?.clients;
        if (cancel || !Array.isArray(list)) return;
        const fixas = new Set(MARCAS.map((m) => chave(m.name)));
        const extras = list
          .filter((item: { name?: string; logo_url?: string }) => item?.name && item?.logo_url && !fixas.has(chave(item.name)))
          .map((item: { name: string; logo_url: string }) => ({ name: item.name, src: item.logo_url }));
        setMarcas([...MARCAS, ...extras]);
      })
      .catch(() => undefined);
    return () => { cancel = true; };
  }, []);

  const removerQuebrada = (src: string) => setMarcas((atual) => atual.filter((m) => m.src !== src));

  return (
    <section className="clients" id="clientes" aria-labelledby="clientes-t">
      <div className="gfx" aria-hidden="true"></div>
      <div className="glow" aria-hidden="true"></div>
      <div className="wrap">
        <div className="hd">
          <span className="ey"><i></i>Quem já usa</span>
          <h2 id="clientes-t">Cursinhos que já estão com a gente</h2>
          <p>Preparatórios para vestibular, ENEM, institutos federais e colégios militares que organizam a gestão e acompanham seus alunos no Cursinho Hub.</p>
        </div>
      </div>
      <div className="marq">
        <ul className="marq-track">
          {Array.from({ length: COPIAS }, (_, copia) =>
            marcas.map((m) => (
              <li key={`${copia}-${m.src}`} className="lcard" aria-hidden={copia > 0 ? "true" : undefined}>
                <img src={m.src} alt={copia > 0 ? "" : m.name} onError={() => removerQuebrada(m.src)} />
              </li>
            )),
          )}
        </ul>
      </div>
      <div className="wrap">
        <div className="ft"><span><b>Seu cursinho pode ser o próximo.</b> Veja a plataforma funcionando com os seus dados.</span><a className="btn btn-o btn-sm" href="#demo">Agendar demonstração</a></div>
      </div>
    </section>
  );
}
