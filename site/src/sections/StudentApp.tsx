import { useState } from "react";

/** Telas do carrossel de tablet: título e legenda. */
const SLIDES = [
  ["Praticar", "Uma questão por vez, sem distrações."],
  ["Simulados", "Ordenados por prazo, com nota contra o mínimo."],
  ["Desempenho", "A média, a evolução e onde está a dificuldade."],
  ["O que estudar", "Assuntos com situação clara e um plano de reforço."],
  ["Agenda", "Simulados, aulas e entregas no mesmo calendário."],
  ["Ranking", "A posição na turma e quanto falta para subir."],
];
/** Largura do slide (880px) + gap (40px) do .car-track. */
const SLIDE_STEP = 920;

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function StudentApp() {
  const [slide, setSlide] = useState(0);
  const n = SLIDES.length;
  const go = (i: number) => setSlide((i + n) % n);
  const slideClass = (i: number) => (i === slide ? "slide on" : "slide");

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

    <div className="sdesk-cap">
      <div>
        <b><i><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 3h16v18H4zM10 18h4"></path></svg></i>No tablet e no computador</b>
        <p>O mesmo app em tela grande: praticar, simulados, desempenho, o que estudar, agenda e ranking.</p>
      </div>
      <span style={{ fontSize: "12px", fontWeight: "600", color: "#B4C7BC", border: "1px dashed rgba(180,199,188,.5)", borderRadius: "999px", padding: "4px 12px" }}>Dados fictícios</span>
    </div>

    <div className="car" role="region" aria-roledescription="carrossel" aria-label="Telas do app do aluno no tablet">
      <div className="car-view">
        <div className="car-track" style={{ transform: `translateX(${-slide * SLIDE_STEP}px)` }}>

          {/* 1 Praticar */}
          <div className={slideClass(0)} role="group" aria-roledescription="slide" aria-label="1 de 6: Praticar">
            <div className="tab-dev"><div className="tsc">
              <nav className="sd-rail" aria-hidden="true"><div className="lg">CH</div><span><i></i></span><span className="on"><i></i></span><span><i></i></span><span><i></i></span></nav>
              <div className="tw">
                <div className="th"><b>Praticar · Matemática</b><div className="tprog" style={{ maxWidth: "240px", marginLeft: "16px" }}><i style={{ width: "30%" }}></i></div><span className="tm" style={{ fontWeight: "600" }}>Questão 4 de 10</span><div className="r"><span className="tbtn">Sair</span></div></div>
                <div className="tb" style={{ alignItems: "center", paddingTop: "34px" }}>
                  <div style={{ width: "100%", maxWidth: "560px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <span className="sd-tg"><i></i>Frações</span>
                    <p className="sd-qt">Quanto é 3/4 de 20?</p>
                    <div className="sd-alts"><div className="sd-a"><b>A</b>10</div><div className="sd-a"><b>B</b>12</div><div className="sd-a on"><b>C</b>15</div><div className="sd-a"><b>D</b>16</div></div>
                    <div className="sd-act"><div className="sp"><span className="sd-btn">Pular</span><span className="sd-btn p">Responder</span></div></div>
                  </div>
                </div>
              </div>
            </div></div>
          </div>

          {/* 2 Simulados */}
          <div className={slideClass(1)} role="group" aria-roledescription="slide" aria-label="2 de 6: Simulados">
            <div className="tab-dev"><div className="tsc">
              <nav className="sd-rail" aria-hidden="true"><div className="lg">CH</div><span><i></i></span><span><i></i></span><span className="on"><i></i></span><span><i></i></span></nav>
              <div className="tw">
                <div className="th"><b>Simulados</b><div className="r"><div className="tseg"><span className="on">Abertos</span><span>Concluídos</span></div></div></div>
                <div className="tb">
                  <div className="tov">VENCE EM ATÉ 3 DIAS</div>
                  <div className="tcard trow"><div style={{ flex: "1" }}><div className="tt">Simulado Geral · 3ª edição</div><div className="tm"><span className="dots"><i style={{ background: "#6E56CF" }}></i><i style={{ background: "#E5484D" }}></i><i style={{ background: "#0E9384" }}></i></span> 30 questões · 1h30 · mínimo 60%</div></div><span className="ptag acc">Termina sex., 18/10 às 18:00</span><span className="tbtn a">Iniciar simulado</span></div>
                  <div className="tov" style={{ marginTop: "6px" }}>EM ANDAMENTO</div>
                  <div className="tcard trow"><div style={{ flex: "1" }}><div className="tt">Revisão de Linguagens</div><div className="trow" style={{ marginTop: "8px" }}><div className="tprog"><i style={{ width: "40%" }}></i></div><span className="tm" style={{ fontWeight: "600" }}>4 de 10 feitas</span></div></div><span className="tbtn">Continuar</span></div>
                  <div className="tov" style={{ marginTop: "6px" }}>CONCLUÍDOS</div>
                  <div className="tcard trow"><div style={{ flex: "1" }}><div className="tt">Simulado Geral · 2ª edição</div><div className="tm">Nota 7,4 · mínimo 6,0</div></div><span className="ptag ok">✓ Aprovado</span><span className="tbtn">Ver correção</span></div>
                  <div className="tcard trow"><div style={{ flex: "1" }}><div className="tt">Simulado de Matemática · 1</div><div className="tm">Nota 5,2 · mínimo 6,0</div></div><span className="stag r">Abaixo do mínimo</span><span className="tbtn">Ver correção</span></div>
                </div>
              </div>
            </div></div>
          </div>

          {/* 3 Desempenho */}
          <div className={slideClass(2)} role="group" aria-roledescription="slide" aria-label="3 de 6: Desempenho">
            <div className="tab-dev"><div className="tsc">
              <nav className="sd-rail" aria-hidden="true"><div className="lg">CH</div><span className="on"><i></i></span><span><i></i></span><span><i></i></span><span><i></i></span></nav>
              <div className="tw">
                <div className="th"><b>Desempenho</b><div className="r"><div className="tseg"><span className="on">2026</span><span>Últimos 30 dias</span></div></div></div>
                <div className="tb cols">
                  <div className="tcard">
                    <div className="tov">MÉDIA NOS SIMULADOS</div>
                    <div className="trow" style={{ alignItems: "baseline" }}><span className="tbig">7,2</span><span className="tm">mínimo 6,0 · <b style={{ color: "#087A3D" }}>▲ 0,6</b> no último mês</span></div>
                    <div className="mb"><em style={{ bottom: "60%" }}></em><i style={{ height: "52%" }}></i><i style={{ height: "58%" }}></i><i style={{ height: "55%" }}></i><i style={{ height: "64%" }}></i><i style={{ height: "68%" }}></i><i style={{ height: "72%" }}></i></div>
                    <div className="mbl"><span>mai</span><span>jun</span><span>jul</span><span>ago</span><span>set</span><span>out</span></div>
                  </div>
                  <div className="tcard">
                    <div className="tov">POR DISCIPLINA</div>
                    <div className="subj"><span><span className="dots"><i style={{ background: "#E5484D" }}></i></span> Linguagens</span><b>7,8</b><small>Último: 8,2 · acima da sua média</small></div>
                    <div className="subj"><span><span className="dots"><i style={{ background: "#0E9384" }}></i></span> Natureza</span><b>7,0</b><small>Último: 7,1</small></div>
                    <div className="subj"><span><span className="dots"><i style={{ background: "#6E56CF" }}></i></span> Matemática</span><b>6,1</b><small className="dn">▼ Último: 5,4 · abaixo da sua média</small></div>
                    <span className="tbtn p" style={{ width: "100%", justifyContent: "center", marginTop: "10px" }}>Treinar estes assuntos</span>
                  </div>
                </div>
              </div>
            </div></div>
          </div>

          {/* 4 O que estudar */}
          <div className={slideClass(3)} role="group" aria-roledescription="slide" aria-label="4 de 6: O que estudar">
            <div className="tab-dev"><div className="tsc">
              <nav className="sd-rail" aria-hidden="true"><div className="lg">CH</div><span className="on"><i></i></span><span><i></i></span><span><i></i></span><span><i></i></span></nav>
              <div className="tw">
                <div className="th"><b>O que estudar</b></div>
                <div className="tb cols">
                  <div className="tcard" style={{ padding: "8px 12px" }}>
                    <table className="ttbl"><thead><tr><th>Assunto</th><th>Acerto de primeira</th><th>Situação</th><th></th></tr></thead><tbody>
                      <tr><td><b>Frações</b><div className="tm">Matemática</div></td><td className="mono">41%</td><td><span className="stag r">Reforçar</span></td><td><span className="tbtn" style={{ height: "32px" }}>Praticar</span></td></tr>
                      <tr><td><b>Porcentagem</b><div className="tm">Matemática</div></td><td className="mono">52%</td><td><span className="stag w">Atenção</span></td><td><span className="tbtn" style={{ height: "32px" }}>Praticar</span></td></tr>
                      <tr><td><b>Interpretação</b><div className="tm">Linguagens</div></td><td className="mono">78%</td><td><span className="stag g">Bom</span></td><td><span className="tbtn" style={{ height: "32px" }}>Praticar</span></td></tr>
                      <tr><td><b>Óptica</b><div className="tm">Natureza</div></td><td className="mono">—</td><td><span className="stag n">Poucos dados</span></td><td><span className="tbtn" style={{ height: "32px" }}>Praticar</span></td></tr>
                    </tbody></table>
                  </div>
                  <div className="tcard">
                    <div className="tov">SEU PLANO DE REFORÇO</div>
                    <ol className="plan"><li><em>1</em><span><b>Frações</b> · 10 questões</span></li><li><em>2</em><span><b>Porcentagem</b> · 8 questões</span></li><li><em>3</em><span><b>Óptica</b> · 3 questões para começar</span></li></ol>
                    <span className="tbtn p" style={{ width: "100%", justifyContent: "center", marginTop: "14px" }}>Praticar o plano · 21 questões</span>
                  </div>
                </div>
              </div>
            </div></div>
          </div>

          {/* 5 Agenda */}
          <div className={slideClass(4)} role="group" aria-roledescription="slide" aria-label="5 de 6: Agenda">
            <div className="tab-dev"><div className="tsc">
              <nav className="sd-rail" aria-hidden="true"><div className="lg">CH</div><span className="on"><i></i></span><span><i></i></span><span><i></i></span><span><i></i></span></nav>
              <div className="tw">
                <div className="th"><b>Agenda · outubro 2026</b></div>
                <div className="tb cols">
                  <div className="tcard">
                    <div className="cal">
                      <span className="h">D</span><span className="h">S</span><span className="h">T</span><span className="h">Q</span><span className="h">Q</span><span className="h">S</span><span className="h">S</span>
                      <span className="x">27</span><span className="x">28</span><span className="x">29</span><span className="x">30</span><span>1</span><span>2</span><span>3</span>
                      <span>4</span><span>5<i className="ac"></i></span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>
                      <span>11</span><span>12</span><span>13</span><span className="sel">14</span><span>15</span><span>16</span><span>17</span>
                      <span>18<i className="ac"></i></span><span>19</span><span>20</span><span>21<i className="ne"></i></span><span>22</span><span>23<i className="ac"></i></span><span>24</span>
                      <span>25</span><span>26</span><span>27</span><span>28<i className="ne"></i></span><span>29</span><span>30</span><span>31</span>
                    </div>
                  </div>
                  <div className="tcard">
                    <div className="tov">PRÓXIMOS 7 DIAS</div>
                    <div className="ev"><div className="d">18<small>SEX</small></div><div><b>Simulado Geral · 3ª ed.</b><span className="m">Até 18:00</span></div><span className="tbtn" style={{ height: "30px", padding: "0 10px" }}>Abrir</span></div>
                    <div className="ev"><div className="d">21<small>SEG</small></div><div><b>Aula de revisão</b><span className="m">Frações · 14:00</span></div><span></span></div>
                    <div className="ev"><div className="d">23<small>QUA</small></div><div><b>Entrega da redação</b><span className="m">Tema 6</span></div><span className="tbtn" style={{ height: "30px", padding: "0 10px" }}>Abrir</span></div>
                    <div className="leg" style={{ marginTop: "8px", color: "#636B77" }}><span><i style={{ background: "#FF6A1A", borderRadius: "50%" }}></i>Pede ação sua</span><span><i style={{ background: "#8A929C", borderRadius: "50%" }}></i>Informativo</span></div>
                  </div>
                </div>
              </div>
            </div></div>
          </div>

          {/* 6 Ranking */}
          <div className={slideClass(5)} role="group" aria-roledescription="slide" aria-label="6 de 6: Ranking">
            <div className="tab-dev"><div className="tsc">
              <nav className="sd-rail" aria-hidden="true"><div className="lg">CH</div><span className="on"><i></i></span><span><i></i></span><span><i></i></span><span><i></i></span></nav>
              <div className="tw">
                <div className="th"><b>Ranking da turma</b><div className="r"><div className="tseg"><span className="on">Desempenho</span><span>Dedicação</span></div></div></div>
                <div className="tb">
                  <div className="tcard trow"><span className="tbig" style={{ fontSize: "32px" }}>4º</span><div style={{ flex: "1" }}><div className="tt">Sua posição na Turma A <span className="stag g" style={{ marginLeft: "6px" }}>▲ 2</span></div><div className="tm">Faltam 35 pontos para passar o 3º lugar.</div></div><span className="tbtn p">Praticar</span></div>
                  <div className="tcard" style={{ padding: "6px 12px" }}>
                    <table className="ttbl"><thead><tr><th style={{ width: "40px" }}>#</th><th>Aluno</th><th style={{ textAlign: "right" }}>Pontos</th></tr></thead><tbody>
                      <tr><td className="mono">1</td><td>Isadora L.</td><td className="pt">1.240</td></tr>
                      <tr><td className="mono">2</td><td>Theo B.</td><td className="pt">1.185</td></tr>
                      <tr><td className="mono">3</td><td>Manuela F.</td><td className="pt">1.120</td></tr>
                      <tr className="me"><td className="mono">4</td><td><b>Helena D.</b><span className="you">você</span></td><td className="pt"><b>1.085</b></td></tr>
                      <tr><td className="mono">5</td><td>Benício P.</td><td className="pt">1.040</td></tr>
                    </tbody></table>
                  </div>
                </div>
              </div>
            </div></div>
          </div>

        </div>
      </div>
    </div>
    <div className="car-cap" aria-live="polite"><b>{slide + 1} de {n} · {SLIDES[slide][0]}</b><span>{SLIDES[slide][1]}</span></div>
    <div className="car-nav">
      <button type="button" className="car-btn" aria-label="Tela anterior" onClick={() => go(slide - 1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg></button>
      <div className="car-dots">
        {SLIDES.map(([title], i) => (
          <button key={title} type="button" className={i === slide ? "car-dot on" : "car-dot"} aria-label={`Ir para ${title}`} aria-current={i === slide ? "true" : undefined} onClick={() => go(i)}></button>
        ))}
      </div>
      <button type="button" className="car-btn" aria-label="Próxima tela" onClick={() => go(slide + 1)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg></button>
    </div>
  </div>
</section>


    </>
  );
}
