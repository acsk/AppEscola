import { CheckMark, Icon } from "../components/icons";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function Exams() {
  return (
    <>
<section className="feat t-tint" id="simulados">
  <div className="wrap">
    <div className="top">
      <div>
        <span className="eyebrow"><span className="num">04</span>Simulados</span>
        <h2>Do PDF da prova ao simulado online.</h2>
        <p className="lead">Envie a prova em PDF: a IA separa as questões, sugere o gabarito e classifica cada uma. Você revisa ao lado do original e publica para os alunos.</p>
      </div>
      <ul className="pts">
        <li><CheckMark /><span><b>Importação com IA</b>Questões separadas e classificadas.</span></li>
        <li><CheckMark /><span><b>Revisão lado a lado</b>Checklist de pendências e o PDF original.</span></li>
        <li><CheckMark /><span><b>Correção automática</b>Nota e resultado assim que o aluno envia.</span></li>
      </ul>
    </div>
    <div className="stage">
      <div className="shot" role="img" aria-label="Revisão de um simulado importado de PDF com lista de questões, editor e o PDF original, dados fictícios">
        <div className="bar"><i></i><i></i><i></i><span>app.cursinhohub.com.br/simulados/importacao/simulado-geral-3</span><em>Dados fictícios</em></div>
        <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "#111722", background: "#F3F4F6" }}>
          <div className="kimp"><div><small>Simulados · Importação de PDF</small><b>Simulado Geral · 3ª edição</b></div><div className="pg"><div><i></i></div>9/30 revisadas</div><div className="kb"><span className="kbtn">Salvar e sair</span><span className="kbtn p">Concluir importação</span></div></div>
          <div className="krev">
            <div className="l">
              <div className="gr">LINGUAGENS</div>
              <div className="it"><span className="n">08</span><span>Interpretação de tirinha<small>Revisada</small></span><span className="s ok"></span></div>
              <div className="it"><span className="n">09</span><span>Uso da vírgula<small>Revisada</small></span><span className="s ok"></span></div>
              <div className="gr">MATEMÁTICA</div>
              <div className="it"><span className="n">13</span><span>Porcentagem no desconto<small>Revisada</small></span><span className="s ok"></span></div>
              <div className="it on"><span className="n">14</span><span>Gráfico de vendas<small className="w">Falta imagem</small></span><span className="s w"></span></div>
              <div className="it"><span className="n">15</span><span>Equação do 1º grau<small>Pronta para conferir</small></span><span className="s"></span></div>
              <div className="it"><span className="n">16</span><span>Área do terreno<small className="w">Sem assunto</small></span><span className="s w"></span></div>
              <div className="it"><span className="n">17</span><span>Razão e proporção<small>Pronta para conferir</small></span><span className="s"></span></div>
              <div className="it"><span className="n">18</span><span>Média aritmética<small>Pronta para conferir</small></span><span className="s"></span></div>
            </div>
            <div className="c">
              <div className="kchk"><span><b>1 pendência</b> · Falta imagem · ✓ Gabarito sugerido pela IA · ✓ Disciplina</span><span className="kbtn p x">Recortar do PDF</span></div>
              <div className="kq">Uma papelaria registrou no gráfico abaixo a venda de cadernos em quatro semanas. Na semana 2, as vendas caíram pela metade em relação à semana 1. Se na semana 1 foram vendidos 120 cadernos, quantos foram vendidos na semana 2?</div>
              <div className="kalts">
                <div className="kalt"><i></i><b>A</b><span>40</span><span></span></div>
                <div className="kalt on"><i></i><b>B</b><span>60</span><em>✓ Correta · sugerida pela IA</em></div>
                <div className="kalt"><i></i><b>C</b><span>80</span><span></span></div>
                <div className="kalt"><i></i><b>D</b><span>240</span><span></span></div>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}><span style={{ fontSize: "11px", color: "#4b5463" }}>Dificuldade</span><span className="kseg"><span className="on">Fácil</span><span>Média</span><span>Difícil</span></span><span className="kchip on" style={{ marginLeft: "8px" }}>Leitura de gráficos</span></div>
              <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}><span className="kbtn p">✓ Confirmar questão 14</span></div>
            </div>
            <div className="p"><div style={{ fontSize: "11px", fontWeight: "600", marginBottom: "8px" }}>PDF original <span className="knum" style={{ color: "#5f6878", fontWeight: "400" }}>· página 4</span></div>
              <div className="kpage"><p style={{ color: "#777" }}>… 13) Uma loja oferece 15% de desconto em uma mochila de R$ 120,00…</p><div className="hl"><p><b>14)</b> Uma papelaria registrou no gráfico abaixo a venda de cadernos em quatro semanas…</p><div className="cb crop"><i style={{ height: "90%" }}></i><i style={{ height: "45%" }}></i><i style={{ height: "60%" }}></i><i style={{ height: "75%" }}></i></div><p>(A) 40 (B) 60 (C) 80 (D) 240</p></div><p style={{ color: "#777" }}>15) Resolva a equação 2x + 6 = 18…</p></div>
            </div>
          </div>
        </div>
      </div>
      <div className="callout" style={{ right: "240px", bottom: "-24px", borderColor: "var(--violet-100)" }}>
        <div className="t" style={{ color: "var(--violet-ink)" }}><Icon name="sparkle" />Recorte direto do PDF</div>
        <p>O gráfico da questão é recortado do original e anexado sem sair da tela.</p>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
