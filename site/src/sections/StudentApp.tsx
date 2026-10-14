/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function StudentApp() {
  return (
    <>
<section className="stu-sec" id="area-do-aluno">
  <div className="wrap">
    <span className="eyebrow"><span className="num" style={{ display: "inline-grid", placeItems: "center", width: "28px", height: "28px", borderRadius: "8px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}>06</span>Área do aluno</span>
    <h2 className="h2">O cursinho no bolso do aluno.</h2>
    <p className="lead">Um app próprio, no celular e no computador. O aluno pratica questões, faz simulados e acompanha os pagamentos — e tudo o que ele faz alimenta os seus relatórios.</p>
    <div className="phones">
      
      <div className="pcol">
        <div className="pcap"><b><i><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5"></path></svg></i>Banco de questões</b><span>Três passos e um botão: matéria, assunto e quantas questões.</span></div>
        <div className="phone" role="img" aria-label="App do aluno: banco de questões em três passos, dados fictícios">
          <div className="sb"></div>
          <div className="ph-h"><b>Banco de questões</b><small>Escolha e comece a praticar</small></div>
          <div className="ph-b">
            <div className="ph-new"><i></i>12 questões novas chegaram</div>
            <div className="ph-step"><em>1</em>Escolha a matéria</div>
            <div className="tiles">
              <div className="tile">Todas<small>486 questões</small></div>
              <div className="tile on"><i style={{ background: "#6E56CF" }}></i>Matemática<small>164 · <b>5 novas</b></small></div>
              <div className="tile"><i style={{ background: "#E5484D" }}></i>Linguagens<small>142 · <b>7 novas</b></small></div>
              <div className="tile"><i style={{ background: "#0E9384" }}></i>Natureza<small>98 questões</small></div>
            </div>
            <div className="ph-step"><em>2</em>Escolha o assunto</div>
            <div className="ph-chips"><span>Todos</span><span className="on">Frações · 24</span><span>Porcentagem · 18</span></div>
            <div className="ph-step"><em>3</em>Quantas questões?</div>
            <div className="ph-seg"><span>5</span><span className="on">10</span><span>20</span></div>
          </div>
          <div className="ph-cta">Começar 10 questões</div>
          <div className="ph-tab"><span><i></i>Início</span><span className="on"><i></i>Questões</span><span><i></i>Simulados</span><span><i></i>Financeiro</span></div>
        </div>
      </div>
      
      <div className="pcol">
        <div className="pcap"><b><i><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"></path></svg></i>Simulados</b><span>Prazo, regras e o que cai antes de começar. Nota na hora.</span></div>
        <div className="phone" role="img" aria-label="App do aluno: tela antes de iniciar um simulado, dados fictícios">
          <div className="sb"></div>
          <div className="ph-h"><b>Simulado Geral · 3ª ed.</b><small>Antes de começar</small></div>
          <div className="ph-b">
            <span className="ptag acc" style={{ alignSelf: "flex-start" }}>Termina sex., 18/10 às 18:00</span>
            <div className="stats3"><div><b>30</b><span>questões</span></div><div><b>1h30</b><span>de prova</span></div><div><b>60%</b><span>mínimo</span></div></div>
            <div className="pcard">
              <div className="o">O QUE CAI</div>
              <div className="prow"><span className="ptag out"><i style={{ background: "#6E56CF" }}></i>Matemática</span><b>12</b></div>
              <div className="prow"><span className="ptag out"><i style={{ background: "#E5484D" }}></i>Linguagens</span><b>10</b></div>
              <div className="prow"><span className="ptag out"><i style={{ background: "#0E9384" }}></i>Natureza</span><b>8</b></div>
            </div>
            <div className="pcard" style={{ fontSize: "12px", color: "#525A65", lineHeight: "1.5" }}>Uma tentativa. Você pode pausar e continuar até o prazo.<div style={{ marginTop: "6px", color: "#056B36", fontWeight: "700" }}>Treinar estes assuntos antes →</div></div>
          </div>
          <div className="ph-cta acc">Iniciar simulado</div>
          <div className="ph-tab"><span><i></i>Início</span><span><i></i>Questões</span><span className="on"><i></i>Simulados</span><span><i></i>Financeiro</span></div>
        </div>
      </div>
      
      <div className="pcol">
        <div className="pcap"><b><i><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18v12H3zM3 10h18M7 15h4"></path></svg></i>Financeiro</b><span>"Estou em dia?" respondido na primeira linha. Pix ou boleto.</span></div>
        <div className="phone" role="img" aria-label="App do aluno: financeiro com próxima cobrança e histórico, dados fictícios">
          <div className="sb"></div>
          <div className="ph-h"><b>Financeiro</b><small>Preparatório Federal · 2026</small></div>
          <div className="ph-b">
            <div className="okbar"><i>✓</i>Tudo em dia</div>
            <div className="pcard">
              <div className="o">PRÓXIMA COBRANÇA</div>
              <div className="big">R$ 340,00</div>
              <div className="meta">Mensalidade · vence em 05/11/2026</div>
              <div className="pbtn"><span className="p">Pagar com Pix</span><span className="s">Boleto</span></div>
            </div>
            <div className="pcard">
              <div className="o">PAGAS</div>
              <div className="prow"><span>Outubro<br /><span className="mo">pago em 04/10</span></span><span className="ptag ok">✓ Recibo</span></div>
              <div className="prow"><span>Setembro<br /><span className="mo">pago em 04/09</span></span><span className="ptag ok">✓ Recibo</span></div>
              <div className="prow"><span>Agosto<br /><span className="mo">pago em 05/08</span></span><span className="ptag ok">✓ Recibo</span></div>
            </div>
          </div>
          <div className="ph-tab"><span><i></i>Início</span><span><i></i>Questões</span><span><i></i>Simulados</span><span className="on"><i></i>Financeiro</span></div>
        </div>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
