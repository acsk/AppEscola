/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function Learning() {
  return (
    <>
<section className="sec t-white" id="aprendizagem">
  <div className="wrap">
    <span className="eyebrow">Inteligência de aprendizagem</span>
    <h2 className="h2">Cada aluno aprende de um jeito. Agora você consegue acompanhar.</h2>
    <p className="lead">Um painel pedagógico que transforma respostas em decisões: quem está evoluindo, onde a turma trava e qual reforço faz sentido agora.</p>
    <div className="dash">
      <div className="dash-h">
        <b>Desempenho da Turma B · Tarde</b>
        <span className="demo">Dados fictícios</span>
        <div className="sel"><span>Últimos 6 simulados</span><span>Todas as disciplinas</span></div>
      </div>
      <div className="dgrid">
        <div className="box g8">
          <h4>Evolução de desempenho</h4>
          <div className="sub">Média da turma por simulado, de 0 a 10</div>
          <div className="chart">
            <svg viewBox="0 0 640 220" role="img" aria-label="Média da turma subiu de 5,8 para 7,2 em seis simulados">
              <g stroke="#EEF0F4"><line x1="40" y1="20" x2="630" y2="20"></line><line x1="40" y1="80" x2="630" y2="80"></line><line x1="40" y1="140" x2="630" y2="140"></line></g>
              <line x1="40" y1="200" x2="630" y2="200" stroke="#D0D5DD"></line>
              <g fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#5D6779"><text x="30" y="24" textAnchor="end">9</text><text x="30" y="84" textAnchor="end">7</text><text x="30" y="144" textAnchor="end">5</text><text x="30" y="204" textAnchor="end">3</text>
              <text x="60" y="216" textAnchor="middle">S1</text><text x="174" y="216" textAnchor="middle">S2</text><text x="288" y="216" textAnchor="middle">S3</text><text x="402" y="216" textAnchor="middle">S4</text><text x="516" y="216" textAnchor="middle">S5</text><text x="620" y="216" textAnchor="middle">S6</text></g>
              <line x1="40" y1="95" x2="630" y2="95" stroke="#16A67A" strokeDasharray="5 4"></line>
              <text x="626" y="90" textAnchor="end" fontSize="11" fontWeight="600" fill="#0B7A57">Meta 6,5</text>
              <polyline points="60,116 174,110 288,104 402,92 516,82 620,74" fill="none" stroke="#98A2B3" strokeWidth="2" strokeDasharray="2 4"></polyline>
              <polyline points="60,134 174,122 288,116 402,95 516,86 620,74" fill="none" stroke="#1745D1" strokeWidth="2.5" strokeLinejoin="round"></polyline>
              <circle cx="620" cy="74" r="5" fill="#1745D1" stroke="#fff" strokeWidth="2"></circle>
              <text x="608" y="60" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="12" fontWeight="600" fill="#0B1220">7,2</text>
            </svg>
            <div className="leg"><span><i style={{ background: "var(--blue)" }}></i>Turma B</span><span><i style={{ background: "#98A2B3" }}></i>Média da escola</span><span><i style={{ background: "var(--green)" }}></i>Meta</span></div>
          </div>
        </div>
        <div className="box g4">
          <h4>Taxa de acertos</h4>
          <div className="sub">Último simulado</div>
          <div className="ring">
            <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="68% de acertos">
              <circle cx="60" cy="60" r="48" fill="none" stroke="#EEF0F4" strokeWidth="12"></circle>
              <circle cx="60" cy="60" r="48" fill="none" stroke="#1745D1" strokeWidth="12" strokeDasharray="205 302" strokeLinecap="round" transform="rotate(-90 60 60)"></circle>
              <text x="60" y="66" textAnchor="middle" fontFamily="Plus Jakarta Sans, sans-serif" fontSize="24" fontWeight="800" fill="#0B1220">68%</text>
            </svg>
            <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: "1.6" }}><b style={{ color: "var(--green-ink)" }}>+6 p.p.</b> em relação ao simulado anterior</div>
          </div>
        </div>
        <div className="box g4">
          <h4>Desempenho por disciplina</h4>
          <div className="sub">% de acertos</div>
          <div className="dlist">
            <div className="drow"><span>Linguagens</span><div className="t"><i style={{ width: "76%", background: "var(--blue)" }}></i></div><span className="v">76%</span></div>
            <div className="drow"><span>Humanas</span><div className="t"><i style={{ width: "72%", background: "var(--blue)" }}></i></div><span className="v">72%</span></div>
            <div className="drow"><span>Natureza</span><div className="t"><i style={{ width: "69%", background: "var(--blue)" }}></i></div><span className="v">69%</span></div>
            <div className="drow"><span>Matemática</span><div className="t"><i style={{ width: "54%", background: "#E5675C" }}></i></div><span className="v">54%</span></div>
          </div>
        </div>
        <div className="box g4">
          <h4>Assuntos com maior dificuldade</h4>
          <div className="sub">Menor taxa de acerto na turma</div>
          <ul className="hard">
            <li><span>Frações<small>Matemática</small></span><b>41%</b></li>
            <li><span>Óptica<small>Natureza</small></span><b>47%</b></li>
            <li><span>Porcentagem<small>Matemática</small></span><b>52%</b></li>
          </ul>
        </div>
        <div className="box g4" style={{ borderColor: "var(--violet-100)", background: "#FCFBFF" }}>
          <h4>Recomendações de reforço</h4>
          <div className="sub">Sugeridas pela IA, aprovadas pela coordenação</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
            <div className="srow" style={{ background: "#fff" }}><b>Lista · Frações</b><span className="pill p-vio">12 questões</span><span></span></div>
            <div className="srow" style={{ background: "#fff" }}><b>Revisão · Óptica</b><span className="pill p-vio">aula</span><span></span></div>
            <div className="srow" style={{ background: "#fff" }}><b>Lista · Porcentagem</b><span className="pill p-vio">8 questões</span><span></span></div>
          </div>
        </div>
        <div className="box g6">
          <h4>Ranking de desempenho</h4>
          <div className="rtabs"><span className="on">Desempenho</span><span>Evolução</span></div>
          <table className="rk">
            <thead><tr><th>#</th><th>Aluno</th><th style={{ textAlign: "right" }}>Média</th></tr></thead>
            <tbody>
              <tr><td className="pos">01</td><td><span className="av">IL</span>Isadora Lins</td><td className="num">9,1</td></tr>
              <tr><td className="pos">02</td><td><span className="av">TB</span>Theo Barreto</td><td className="num">8,7</td></tr>
              <tr><td className="pos">03</td><td><span className="av">MF</span>Manuela Freitas</td><td className="num">8,4</td></tr>
            </tbody>
          </table>
        </div>
        <div className="box g6">
          <h4>Ranking de dedicação</h4>
          <div className="rtabs"><span className="on">Questões resolvidas</span><span>Dias ativos</span></div>
          <table className="rk">
            <thead><tr><th>#</th><th>Aluno</th><th style={{ textAlign: "right" }}>Questões na semana</th></tr></thead>
            <tbody>
              <tr><td className="pos">01</td><td><span className="av">BP</span>Benício Prado</td><td className="num">198</td></tr>
              <tr><td className="pos">02</td><td><span className="av">SR</span>Sofia Ramalho</td><td className="num">176</td></tr>
              <tr><td className="pos">03</td><td><span className="av">DP</span>Davi Peixoto</td><td className="num">151</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
