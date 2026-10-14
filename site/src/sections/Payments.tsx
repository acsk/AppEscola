import { CheckMark } from "../components/icons";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function Payments() {
  return (
    <>
<section className="feat t-white" id="pagamentos">
  <div className="wrap">
    <div className="top">
      <div>
        <span className="eyebrow"><span className="num">03</span>Pagamentos</span>
        <h2>Saiba o que entrou, o que falta e o que venceu.</h2>
        <p className="lead">Mensalidades, taxas e boletos num relatório só, com o recebimento do período em uma barra e exportação em PDF para a reunião.</p>
      </div>
      <ul className="pts">
        <li><CheckMark /><span><b>Recebido, a receber e vencido</b>Os totais do período num olhar.</span></li>
        <li><CheckMark /><span><b>Filtros que importam</b>Período, situação, forma de pagamento e turma.</span></li>
        <li><CheckMark /><span><b>PDF e Excel</b>Relatório, recibo e 2ª via do boleto.</span></li>
      </ul>
    </div>
    <div className="stage">
      <div className="shot" role="img" aria-label="Relatório financeiro com totais, barra de recebimento e lista de cobranças, dados fictícios">
        <div className="bar"><i></i><i></i><i></i><span>app.cursinhohub.com.br/financeiro</span><em>Dados fictícios</em></div>
        <div className="k">
          <aside className="knav"><div className="b"><i>CH</i>Cursinho Hub</div><div className="g">RELATÓRIOS</div><a href="#pagamentos"><i></i>Turmas (alunos)</a><a className="on" href="#pagamentos"><i></i>Financeiro</a><div className="g">FINANCEIRO</div><a href="#pagamentos"><i></i>Gestão de pagamentos</a><a href="#pagamentos"><i></i>Bancos</a><a href="#pagamentos"><i></i>Provedores</a><div className="g">CONFIGURAÇÕES</div><a href="#pagamentos"><i></i>Regras de cobrança</a></aside>
          <div className="kmain">
            <div className="ktop"><div className="s">Buscar aluno, turma, curso…</div><div className="u">Financeiro<i>FN</i></div></div>
            <div className="kc">
              <div className="kh"><div><h5>Relatório financeiro</h5><p>Vencimento em outubro de 2026 · todos os cursos e turmas</p></div><div className="kb"><span className="kbtn">Excel</span><span className="kbtn p">Exportar PDF ▾</span></div></div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}><span className="kseg"><span className="on">Este mês</span><span>3 meses</span><span>6 meses</span><span>Este ano</span></span><span className="krange">Vencimento 01/10 → 31/10/2026</span><span className="kchip">+ Situação</span><span className="kchip">+ Forma</span><span className="kchip">+ Turma</span></div>
              <div className="kstats">
                <div><span>Total no recorte</span><b>R$ 97.240,00</b><small>286 cobranças</small></div>
                <div><span><i style={{ background: "#1c6a45" }}></i>Recebido</span><b>R$ 62.560,00</b><small>184 cobranças</small></div>
                <div><span><i style={{ background: "#8a5200" }}></i>A receber</span><b>R$ 31.280,00</b><small>92 cobranças</small></div>
                <div><span><i style={{ background: "#b0261b" }}></i>Vencido</span><b>R$ 3.400,00</b><small style={{ color: "#8a5200" }}>10 cobranças</small></div>
                <div className="rec">Recebimento do período<div className="kstack"><i style={{ width: "64.3%", background: "#1c6a45" }}></i><i style={{ width: "32.2%", background: "#8a5200" }}></i><i style={{ width: "3.5%", background: "#b0261b" }}></i></div><span className="knum">64,3% recebido</span></div>
              </div>
              <div className="kp"><div className="hd"><div><b>Cobranças</b><small>286 no recorte</small></div><span className="kbtn">PDF desta lista</span></div>
                <table className="kt"><thead><tr><th style={{ paddingLeft: "14px" }}>Aluno</th><th>Turma</th><th>Vencimento</th><th>Pagamento</th><th>Situação</th><th className="r" style={{ paddingRight: "14px" }}>Valor</th></tr></thead><tbody>
                  <tr><td style={{ paddingLeft: "14px" }}>Rafael Moura<small>Parcela 9/10 · Mensalidade</small></td><td>Turma A · Manhã</td><td className="m">05/10/2026</td><td className="m">04/10/2026</td><td><span className="kbg ok">Paga</span></td><td className="m r" style={{ paddingRight: "14px" }}>R$ 340,00</td></tr>
                  <tr><td style={{ paddingLeft: "14px" }}>Lívia Antunes<small>Parcela 9/10 · Mensalidade</small></td><td>Turma B · Tarde</td><td className="m">05/10/2026</td><td className="m">—</td><td><span className="kbg d">Vencida</span></td><td className="m r" style={{ paddingRight: "14px" }}>R$ 340,00</td></tr>
                  <tr><td style={{ paddingLeft: "14px" }}>Caio Bittencourt<small>Parcela 4/6 · Mensalidade</small></td><td>Turma Noturna</td><td className="m">10/10/2026</td><td className="m">09/10/2026</td><td><span className="kbg ok">Paga</span></td><td className="m r" style={{ paddingRight: "14px" }}>R$ 290,00</td></tr>
                  <tr><td style={{ paddingLeft: "14px" }}>Sofia Ramalho<small>Parcela 9/10 · Mensalidade</small></td><td>Turma A · Manhã</td><td className="m">15/10/2026</td><td className="m">—</td><td><span className="kbg w">Pendente</span></td><td className="m r" style={{ paddingRight: "14px" }}>R$ 340,00</td></tr>
                  <tr><td style={{ paddingLeft: "14px" }}>Davi Peixoto<small>Taxa de matrícula</small></td><td>Pré-ENEM Intensivo</td><td className="m">20/10/2026</td><td className="m">—</td><td><span className="kbg w">Pendente</span></td><td className="m r" style={{ paddingRight: "14px" }}>R$ 150,00</td></tr>
                </tbody></table></div>
            </div>
          </div>
        </div>
      </div>
      <div className="callout" style={{ right: "-16px", top: "110px" }}>
        <div className="t"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 3H6v18h12V7zM14 3v4h4"></path></svg>Exportar PDF</div>
        <div className="row"><span>Relatório completo</span><span style={{ color: "var(--subtle)" }}>3–4 págs.</span></div>
        <div className="row"><span>Resumo executivo</span><span style={{ color: "var(--subtle)" }}>1 pág.</span></div>
        <div className="row"><span>Inadimplência por aluno</span><span style={{ color: "var(--subtle)" }}>1 pág.</span></div>
      </div>
    </div>

    {/* Bancos, boleto, Pix e baixa automática */}
    <div className="pay">
      <div>
        <span className="eyebrow">Integração bancária</span>
        <h3>Conectado ao seu banco. Do boleto à baixa, sem planilha.</h3>
        <p className="lead">Emita boletos e cobranças Pix pela conta do cursinho. Quando o aluno paga, o banco avisa a plataforma e a mensalidade é baixada sozinha.</p>
        <div className="banks">
          <div className="bank"><img src="/bancos/cora.svg" alt="Cora" /><span><i></i>Integração disponível</span></div>
          <div className="bank"><img src="/bancos/asaas.svg" alt="Asaas" /><span><i></i>Integração disponível</span></div>
        </div>
        <div className="banks-note">Use a conta que o cursinho já tem em um dos bancos parceiros.</div>
      </div>
      <div className="flow" role="list" aria-label="Como uma mensalidade é cobrada e baixada">
        <div className="fstep" role="listitem"><span className="ic2"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4"></path></svg></span><b>Cobrança gerada</b><small>Mensalidade criada pelo contrato, com vencimento e regras.</small></div>
        <div className="fstep" role="listitem"><span className="ic2"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 2h10v20H7zM11 18h2"></path></svg></span><b>Aluno recebe</b><small>Boleto e Pix no app, por e-mail e com lembrete.</small></div>
        <div className="fstep" role="listitem"><span className="ic2"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"></path></svg></span><b>Banco confirma</b><small>Cora ou Asaas avisam o pagamento.</small></div>
        <div className="fstep ok" role="listitem"><span className="ic2"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg></span><b>Baixa automática</b><small>Mensalidade marcada como paga e recibo emitido.</small></div>
      </div>
    </div>

    <div className="paygrid">
      <div className="pcardx">
        <div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6v12M7 6v12M11 6v12M13 6v12M17 6v12M20 6v12"></path></svg></div>
        <h4>Boleto registrado</h4>
        <p>Emitido pela conta do cursinho, com linha digitável e 2ª via sempre à mão.</p>
        <div className="tags"><span>2ª via</span><span>Em lote</span></div>
      </div>
      <div className="pcardx">
        <div className="ic g"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3l9 9-9 9-9-9zM8.5 12h7"></path></svg></div>
        <h4>Pix</h4>
        <p>QR Code e Pix copia e cola em cada cobrança. O aluno paga pelo app em segundos.</p>
        <div className="tags"><span>QR Code</span><span>Copia e cola</span></div>
      </div>
      <div className="pcardx">
        <div className="ic g"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5M8 12l3 3 5-6"></path></svg></div>
        <h4>Baixa automática</h4>
        <p>Pagamento confirmado pelo banco vira baixa no sistema, sem conferir extrato.</p>
        <div className="tags"><span>Conciliação</span><span>Recibo</span></div>
      </div>
      <div className="pcardx">
        <div className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4"></path></svg></div>
        <h4>Regras de cobrança</h4>
        <p>Juros, multa e desconto de pontualidade aplicados conforme o contrato.</p>
        <div className="tags"><span>Juros e multa</span><span>Desconto</span></div>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
