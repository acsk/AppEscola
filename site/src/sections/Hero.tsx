import { Icon } from "../components/icons";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function Hero() {
  return (
    <>
<section className="hero" id="topo">
  <div className="wrap grid">
    <div>
      <div className="badge rise"><b>IA</b>Gestão educacional com Inteligência Artificial</div>
      <h1 className="h1 rise d1">Seu cursinho mais inteligente. <span>Sua gestão mais simples.</span></h1>
      <p className="sub rise d2">Centralize alunos, turmas, pagamentos, questões e simulados em uma única plataforma. Utilize Inteligência Artificial para personalizar a aprendizagem e acompanhar a evolução dos seus alunos.</p>
      <div className="cta rise d3">
        <a className="btn btn-p" href="#demo">Agendar demonstração
          <Icon name="arrowRight" />
        </a>
        <a className="btn btn-s" href="#alunos">Explorar funcionalidades</a>
      </div>
      <div className="chips rise d3">
        <a className="fchip" href="#alunos"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6"></path></svg>Alunos</a>
        <a className="fchip" href="#turmas"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"></path></svg>Turmas</a>
        <a className="fchip" href="#pagamentos"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18v12H3zM3 10h18M7 15h4"></path></svg>Pagamentos</a>
        <a className="fchip" href="#simulados"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"></path></svg>Simulados</a>
        <a className="fchip" href="#banco"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5"></path></svg>Banco de questões</a>
        <a className="fchip" href="#area-do-aluno"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M7 2h10v20H7zM11 18h2"></path></svg>Área do aluno</a>
      </div>
    </div>

    <div className="mock rise d2" role="img" aria-label="Prévia do painel da plataforma com dados fictícios">
      <div className="win">
        <div className="win-top"><i></i><i></i><i></i><span>app.cursinhohub.com.br/painel</span></div>
        <div className="app">
          <aside className="side" aria-hidden="true">
            <div className="lg"><i>CH</i>Cursinho Hub</div>
            <a className="on" href="#topo"><i></i>Painel</a>
            <a href="#topo"><i></i>Alunos</a>
            <a href="#topo"><i></i>Turmas</a>
            <a href="#topo"><i></i>Banco de questões</a>
            <a href="#topo"><i></i>Simulados</a>
            <a href="#topo"><i></i>Financeiro</a>
          </aside>
          <div className="main">
            <div className="mh"><b>Visão geral · Ano letivo</b><span className="demo">Dados fictícios</span></div>
            <div className="kpis">
              <div className="kpi"><span>Alunos ativos</span><b className="mono">286</b><em style={{ color: "var(--green-ink)" }}>▲ 12</em></div>
              <div className="kpi"><span>Média nos simulados</span><b className="mono">6,9</b><em style={{ color: "var(--green-ink)" }}>▲ 0,3</em></div>
              <div className="kpi"><span>Frequência</span><b className="mono">91%</b><em style={{ color: "var(--subtle)" }}>semana</em></div>
              <div className="kpi"><span>Recebido no mês</span><b className="mono">64%</b><em style={{ color: "var(--subtle)" }}>do previsto</em></div>
            </div>
            <div className="panels">
              <div className="pnl">
                <h4>Evolução da média nos simulados</h4>
                <svg viewBox="0 0 360 120" width="100%" aria-hidden="true">
                  <line x1="0" y1="100" x2="360" y2="100" stroke="#E4E7EC"></line>
                  <line x1="0" y1="60" x2="360" y2="60" stroke="#F0F2F5"></line>
                  <line x1="0" y1="20" x2="360" y2="20" stroke="#F0F2F5"></line>
                  <polyline points="0,90 45,84 90,86 135,72 180,68 225,60 270,54 315,46 360,40" fill="none" stroke="#1c3d63" strokeWidth="2.5" strokeLinejoin="round"></polyline>
                  <circle cx="360" cy="40" r="4" fill="#1c3d63" stroke="#fff" strokeWidth="2"></circle>
                </svg>
              </div>
              <div className="pnl">
                <h4>Acertos por disciplina</h4>
                <div className="bars">
                  <div className="bar"><span>Linguagens</span><div className="t"><i style={{ width: "76%" }}></i></div><span className="v">76%</span></div>
                  <div className="bar"><span>Natureza</span><div className="t"><i style={{ width: "69%" }}></i></div><span className="v">69%</span></div>
                  <div className="bar"><span>Matemática</span><div className="t"><i style={{ width: "57%" }}></i></div><span className="v">57%</span></div>
                  <div className="bar"><span>Humanas</span><div className="t"><i style={{ width: "72%" }}></i></div><span className="v">72%</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="float f-sim">
        <span>Simulado em andamento</span>
        <b>Simulado Geral · 3ª edição</b>
        <div className="prog"><i style={{ width: "68%" }}></i></div>
        <div className="meta"><span>Respostas enviadas</span><span className="mono">68%</span></div>
      </div>
      <div className="float f-ai">
        <span className="tg"><Icon name="sparkle" size={14} />Sugestão da IA</span>
        <p>A Turma B errou mais em <strong>frações e porcentagem</strong>. Sugerimos uma lista de reforço antes do próximo simulado.</p>
        <div className="chps"><span>12 questões</span><span>Nível médio</span><span>Revisar e enviar</span></div>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
