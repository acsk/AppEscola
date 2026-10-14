import LeadForm from "./LeadForm";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function FinalCta() {
  return (
    <section className="final" id="demo">
      <div className="bgfx" aria-hidden="true"></div>
      <div className="wrap">
        <div className="in">
          <div>
            <h2>O futuro do seu cursinho começa aqui.</h2>
            <p className="l">Conheça uma plataforma que une gestão, tecnologia e Inteligência Artificial para transformar sua instituição.</p>
            <ul className="see">
              <li><span className="n">1</span><span><b>Conversa sobre o seu cenário</b>Como funcionam hoje matrículas, cobranças e simulados no seu cursinho.</span></li>
              <li><span className="n">2</span><span><b>Demonstração ao vivo</b>Painel da gestão e app do aluno, com o que faz sentido para você.</span></li>
              <li><span className="n">3</span><span><b>Próximos passos</b>Proposta e plano de implantação, sem compromisso.</span></li>
            </ul>
            <div className="alt">Prefere conversar agora? <a href="#contato">Fale pelo WhatsApp</a></div>
          </div>
          <LeadForm />
        </div>
      </div>
    </section>
  );
}
