import { CheckMark } from "../components/icons";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function Classes() {
  return (
    <>
<section className="feat t-navy" id="turmas">
  <div className="grid-fx" aria-hidden="true"></div>
  <div className="wrap" style={{ position: "relative" }}>
    <div className="top">
      <div>
        <span className="eyebrow"><span className="num">02</span>Turmas</span>
        <h2>Turmas, horários e frequência sem planilha.</h2>
        <p className="lead">Monte a grade semanal com professor e sala, acompanhe o período letivo e saiba na hora quando uma aula está sem professor.</p>
      </div>
      <ul className="pts">
        <li><CheckMark /><span><b>Grade semanal</b>Dia, horário, disciplina, professor e sala.</span></li>
        <li><CheckMark /><span><b>Período letivo visível</b>Semana atual e datas sempre à vista.</span></li>
        <li><CheckMark /><span><b>Frequência por turma</b>Lista de alunos e presença em abas.</span></li>
      </ul>
    </div>
    <div className="stage">
      <div className="shot" role="img" aria-label="Tela de edição de turma com dados, período letivo e grade de horários, dados fictícios">
        <div className="bar"><i></i><i></i><i></i><span>app.cursinhohub.com.br/turmas/turma-a-manha</span><em>Dados fictícios</em></div>
        <div className="k">
          <aside className="knav"><div className="b"><i>CH</i>Cursinho Hub</div><div className="g">PESSOAS</div><a href="#turmas"><i></i>Alunos</a><a href="#turmas"><i></i>Professores</a><div className="g">ACADÊMICO</div><a href="#turmas"><i></i>Disciplinas</a><a className="on" href="#turmas"><i></i>Turmas</a><a href="#turmas"><i></i>Cursos</a><a href="#turmas"><i></i>Simulados</a><a href="#turmas"><i></i>Matrículas</a></aside>
          <div className="kmain">
            <div className="ktop"><div className="s">Buscar aluno, turma, curso…</div><div className="u">Coordenação<i>CO</i></div></div>
            <div className="kc">
              <div className="kh"><div><div className="kcr">Acadêmico / Turmas / Turma A · Manhã</div><h5>Editar turma</h5><p>Dados da turma e horários de aula.</p></div><div className="kb"><span className="kbtn">Cancelar</span><span className="kbtn p">Salvar alterações</span></div></div>
              <div className="ktabs"><span className="on">Dados e horários</span><span>Frequência</span><span>Alunos<em>34</em></span></div>
              <div className="kban"><i></i><span><b>Período letivo em andamento</b> — semana 36 de 42</span><span className="m">03/02/2026 → 30/11/2026</span></div>
              <div className="kp"><div className="hd"><div><b>Dados da turma</b><small>Identificação, curso e período letivo</small></div></div>
                <div className="bd kform">
                  <div className="kf w2"><span>Curso <em>*</em></span><div>Preparatório Federal</div></div>
                  <div className="kf w2"><span>Nome da turma <em>*</em></span><div>Turma A · Manhã</div></div>
                  <div className="kf"><span>Data de início <em>*</em></span><div className="m">03/02/2026</div></div>
                  <div className="kf"><span>Data de término <em>*</em></span><div className="m">30/11/2026</div></div>
                  <div className="kf"><span>Período</span><div>Manhã</div></div>
                  <div className="kf"><span>Vagas</span><div className="m">40</div></div>
                </div></div>
              <div className="kp"><div className="hd"><div><b>Horários de aula</b><small>Grade semanal da turma</small></div><span className="kbtn">+ Adicionar horário</span></div>
                <div className="bd"><table className="kt"><thead><tr><th>Dia</th><th>Horário</th><th>Disciplina</th><th>Professor</th><th>Sala</th><th>Status</th></tr></thead><tbody>
                  <tr><td>Segunda</td><td className="m">07:30–09:10</td><td>Matemática</td><td>Prof. Renato Aguiar</td><td className="m">Sala 3</td><td><span className="kbg ok">Confirmada</span></td></tr>
                  <tr><td>Segunda</td><td className="m">09:30–11:10</td><td>Linguagens</td><td>Profa. Clara Mendes</td><td className="m">Sala 3</td><td><span className="kbg ok">Confirmada</span></td></tr>
                  <tr><td>Terça</td><td className="m">07:30–09:10</td><td>Física</td><td>—</td><td className="m">Lab 1</td><td><span className="kbg w">Sem professor</span></td></tr>
                  <tr><td>Quarta</td><td className="m">07:30–09:10</td><td>Química</td><td>Prof. Otávio Lima</td><td className="m">Lab 1</td><td><span className="kbg ok">Confirmada</span></td></tr>
                </tbody></table></div></div>
            </div>
          </div>
        </div>
      </div>
      <div className="callout" style={{ left: "-16px", bottom: "40px" }}>
        <div className="t" style={{ color: "#8a5200" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3l10 18H2zM12 10v5M12 18v.01"></path></svg>Aula sem professor</div>
        <p>Física de terça, 07:30, ainda não tem professor. A coordenação é avisada antes do início da semana.</p>
      </div>
    </div>
  </div>
</section>


    </>
  );
}
