import { CheckMark } from "../components/icons";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function QuestionBank() {
  return (
    <>
<section className="feat t-ink" id="banco">
  <div className="glow" aria-hidden="true"></div>
  <div className="wrap" style={{ position: "relative" }}>
    <div className="top">
      <div>
        <span className="eyebrow"><span className="num">05</span>Banco de questões</span>
        <h2>Todas as suas questões, classificadas e medidas.</h2>
        <p className="lead">Busque por número, enunciado ou tag, filtre por disciplina, assunto, banca e ano, e veja quanto cada questão derruba os alunos.</p>
      </div>
      <ul className="pts">
        <li><CheckMark /><span><b>Taxa de erro real</b>Calculada com as respostas dos alunos.</span></li>
        <li><CheckMark /><span><b>Selos claros</b>Questão de simulado oficial e revalidada.</span></li>
        <li><CheckMark /><span><b>Ações em lote</b>Classifique, atualize com IA e monte simulados.</span></li>
      </ul>
    </div>
    <div className="stage">
      <div className="shot" role="img" aria-label="Banco de questões com filtros, selos de simulado oficial, dificuldade, taxa de erro e revalidação, dados fictícios">
        <div className="bar"><i></i><i></i><i></i><span>app.cursinhohub.com.br/banco-de-questoes</span><em>Dados fictícios</em></div>
        <div className="k">
          <aside className="knav"><div className="b"><i>CH</i>Cursinho Hub</div><div className="g">ACADÊMICO</div><a href="#banco"><i></i>Disciplinas</a><a href="#banco"><i></i>Turmas</a><a href="#banco"><i></i>Simulados</a><a className="on" href="#banco"><i></i>Banco de questões</a><a href="#banco"><i></i>Avaliações</a><a href="#banco"><i></i>Provas e materiais</a></aside>
          <div className="kmain">
            <div className="ktop"><div className="s">Buscar aluno, turma, curso…</div><div className="u">Coordenação<i>CO</i></div></div>
            <div className="kc">
              <div className="kh"><div><h5>Banco de questões</h5><p>Questões avulsas e de simulados, classificadas para busca e montagem.</p></div><div className="kb"><span className="kbtn sq">⋯</span><span className="kbtn">Importar PDF com IA</span><span className="kbtn p">+ Nova questão</span></div></div>
              <div className="ktabs"><span className="on">Todas<em>1.248</em></span><span>Regulares<em>1.231</em></span><span>Anuladas<em>6</em></span><span>Sem classificação<em>11</em></span></div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}><span className="kchip on">Disciplina: Matemática ×</span><span className="kchip">+ Assunto</span><span className="kchip">+ Banca</span><span className="kchip">+ Ano</span><span className="kchip">+ Dificuldade</span><span className="kchip">Mais filtros</span></div>
              <div className="kp"><table className="kt"><thead><tr><th style={{ paddingLeft: "14px" }}>Nº</th><th>Enunciado</th><th>Dificuldade</th><th>Erros</th><th>Banca · ano</th><th>Revisão</th></tr></thead><tbody>
                <tr><td style={{ paddingLeft: "14px" }}><span className="knum">#1208</span><br /><span className="klk">Oficial</span></td><td><div className="kstem">Uma papelaria registrou no gráfico a venda de cadernos em quatro…</div><small>Simulado Geral · 3ª edição · Matemática › Leitura de gráficos</small></td><td><span className="kpips"><i className="f"></i><i></i><i></i></span>Fácil</td><td><div className="kerr"><b>18%</b><div><i style={{ width: "18%" }}></i></div></div></td><td>Banca Exemplo<small className="m">2025</small></td><td><span className="kR">R</span></td></tr>
                <tr><td style={{ paddingLeft: "14px" }}><span className="knum">#1207</span><br /><span className="klk">Oficial</span></td><td><div className="kstem">Uma loja oferece 15% de desconto em uma mochila de R$ 120,00…</div><small>Simulado Geral · 3ª edição · Matemática › Porcentagem</small></td><td><span className="kpips"><i className="f"></i><i className="f"></i><i></i></span>Média</td><td><div className="kerr"><b>42%</b><div><i style={{ width: "42%" }}></i></div></div></td><td>Banca Exemplo<small className="m">2025</small></td><td><span className="kR">R</span></td></tr>
                <tr><td style={{ paddingLeft: "14px" }}><span className="knum">#1186</span></td><td><div className="kstem">Um terreno retangular tem 12 m de frente e área de 180 m²…</div><small>Avulsa · Matemática › Geometria plana</small></td><td><span className="kpips"><i className="f"></i><i className="f"></i><i className="f"></i></span>Difícil</td><td><div className="kerr hi"><b>64%</b><div><i style={{ width: "64%" }}></i></div></div></td><td style={{ color: "#5f6878" }}>—</td><td><span className="kR">R</span></td></tr>
                <tr><td style={{ paddingLeft: "14px" }}><span className="knum">#1175</span></td><td><div className="kstem">A razão entre meninos e meninas de uma turma é 3 para 5…</div><small>Avulsa · Matemática › Razão e proporção</small></td><td><span className="kpips"><i className="f"></i><i className="f"></i><i></i></span>Média</td><td><div className="kerr"><b>37%</b><div><i style={{ width: "37%" }}></i></div></div></td><td>Instituto Alfa<small className="m">2024</small></td><td><span className="kR">R</span></td></tr>
              </tbody></table></div>
            </div>
          </div>
        </div>
      </div>
      <div className="callout" style={{ right: "-16px", bottom: "60px" }}>
        <div className="t" style={{ color: "var(--red-ink)" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20h16M7 16v-5M12 16V7M17 16v-8"></path></svg>Questão #1186 · 64% de erro</div>
        <p>A mais difícil da semana. Vale uma revisão em aula antes de reaplicar.</p>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
