import { CheckMark } from "../components/icons";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function Students() {
  return (
    <>
<section className="feat t-gray" id="alunos">
  <div className="wrap">
    <div className="top">
      <div>
        <span className="eyebrow"><span className="num">01</span>Gestão de alunos</span>
        <h2>Cada aluno, do contrato à última parcela.</h2>
        <p className="lead">Matrícula com curso, plano, vigência e turma num só lugar. As parcelas são geradas sozinhas e a secretaria encontra tudo em segundos.</p>
      </div>
      <ul className="pts">
        <li><CheckMark /><span><b>Ficha completa</b>Curso, plano, turma, responsável e histórico.</span></li>
        <li><CheckMark /><span><b>Parcelas automáticas</b>Mensalidades criadas conforme o contrato.</span></li>
        <li><CheckMark /><span><b>Documentos em PDF</b>Boletim e contrato com um clique.</span></li>
      </ul>
    </div>
    <div className="stage">
      <div className="shot" role="img" aria-label="Tela de matrícula do aluno com contrato, cobranças e valores, dados fictícios">
        <div className="bar"><i></i><i></i><i></i><span>app.cursinhohub.com.br/matriculas/MAT-0142</span><em>Dados fictícios</em></div>
        <div className="k">
          <aside className="knav"><div className="b"><i>CH</i>Cursinho Hub</div><div className="g">PESSOAS</div><a href="#alunos"><i></i>Alunos</a><a href="#alunos"><i></i>Responsáveis</a><div className="g">ACADÊMICO</div><a href="#alunos"><i></i>Turmas</a><a href="#alunos"><i></i>Simulados</a><a href="#alunos"><i></i>Banco de questões</a><a className="on" href="#alunos"><i></i>Matrículas</a><div className="g">RELATÓRIOS</div><a href="#alunos"><i></i>Financeiro</a></aside>
          <div className="kmain">
            <div className="ktop"><div className="s">Buscar aluno, turma, curso…</div><div className="u">Secretaria<i>SC</i></div></div>
            <div className="kc">
              <div className="kh"><div><div className="kcr">Matrículas / MAT-0142</div><h5>Helena Duarte Vasconcelos</h5><p><span className="knum" style={{ color: "#4b5463" }}>MAT-0142</span> · <span className="kbg ok">Ativa</span> · Criada em 03/02/2026</p></div><div className="kb"><span className="kbtn">Boletim</span><span className="kbtn p">Editar matrícula</span><span className="kbtn sq">⋯</span></div></div>
              <div className="kfacts"><div><span>Curso e plano</span><b>Preparatório Federal</b><small>Turma regular 2026 · Plano mensal</small></div><div><span>Vigência</span><b className="m">03/02 → 30/11/2026</b><small>10 meses · 10 parcelas</small></div><div><span>Vencimento</span><b>Todo dia 5</b><small>Próximo: 05/11</small></div><div><span>Turma</span><b>Turma A · Manhã</b><small>Seg. a sex.</small></div></div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 270px", gap: "14px" }}>
                <div className="kp"><div className="hd"><div><b>Cobranças</b><small>9 de 10 parcelas geradas</small></div><span className="kbtn p">+ Nova cobrança</span></div>
                  <div className="ksum"><div><span>Em aberto</span><b>R$ 340,00</b></div><div><span>Pago</span><b>R$ 2.720,00</b></div><div><span>Vencido</span><b>R$ 0,00</b></div><div><span>Total do contrato</span><b>R$ 3.400,00</b></div></div>
                  <div className="bd"><table className="kt"><thead><tr><th>Cobrança</th><th>Vencimento</th><th>Pagamento</th><th className="r">Valor</th><th>Status</th><th></th></tr></thead><tbody>
                    <tr><td>Mensalidade · outubro<small>Parcela 9/10</small></td><td className="m">05/10/2026</td><td className="m">—</td><td className="m r">R$ 340,00</td><td><span className="kbg w">Pendente</span></td><td><span className="kbtn">Boleto</span></td></tr>
                    <tr><td>Mensalidade · setembro<small>Parcela 8/10</small></td><td className="m">05/09/2026</td><td className="m">04/09/2026</td><td className="m r">R$ 340,00</td><td><span className="kbg ok">Paga</span></td><td><span className="kbtn">Recibo</span></td></tr>
                    <tr><td>Mensalidade · agosto<small>Parcela 7/10</small></td><td className="m">05/08/2026</td><td className="m">05/08/2026</td><td className="m r">R$ 340,00</td><td><span className="kbg ok">Paga</span></td><td><span className="kbtn">Recibo</span></td></tr>
                    <tr><td style={{ color: "#5f6878" }}>Mensalidade · novembro<small>Parcela 10/10 · gerada em 05/11</small></td><td className="m" style={{ color: "#5f6878" }}>05/11/2026</td><td className="m">—</td><td className="m r" style={{ color: "#5f6878" }}>R$ 340,00</td><td><span className="kbg n">Agendada</span></td><td></td></tr>
                  </tbody></table></div></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div className="kp"><div className="hd"><b>Valores</b></div><div className="bd kdl"><div>Mensalidade base<b>R$ 380,00</b></div><div>Desconto pontualidade<b>− R$ 40,00</b></div><div>Taxa de matrícula<b style={{ color: "#5f6878", fontWeight: "400" }}>Isenta</b></div><div className="tot">Mensalidade líquida<b>R$ 340,00</b></div></div></div>
                  <div className="kp"><div className="hd"><b>Responsável</b></div><div className="bd kdl"><div>Nome<b style={{ fontFamily: "'IBM Plex Sans'" }}>Marcos Vasconcelos</b></div><div>Contato<b>(00) 90000-0000</b></div></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="callout" style={{ right: "-16px", top: "300px" }}>
        <div className="t"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"></path></svg>Parcela gerada automaticamente</div>
        <p>A parcela 10/10 entra em 05/11, já com o desconto de pontualidade aplicado.</p>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
