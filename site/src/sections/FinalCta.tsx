import { Icon } from "../components/icons";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function FinalCta() {
  return (
    <>
<section className="final" id="demo">
  <div className="bgfx" aria-hidden="true"></div>
  <div className="ghostbars" aria-hidden="true"><i style={{ height: "38%" }}></i><i style={{ height: "52%" }}></i><i style={{ height: "47%" }}></i><i style={{ height: "66%" }}></i><i style={{ height: "74%" }}></i><i style={{ height: "92%" }}></i></div>
  <div className="wrap">
    <div className="in">
      <h2>O futuro do seu cursinho começa aqui.</h2>
      <p>Conheça uma plataforma que une gestão, tecnologia e Inteligência Artificial para transformar sua instituição.</p>
      <div className="cta"><a className="btn btn-w" href="#demo">Solicitar demonstração <Icon name="arrowRight" /></a></div>
      <small>Uma conversa com a nossa equipe, com o seu cenário e as suas dúvidas.</small>
    </div>
  </div>
</section>


    </>
  );
}
