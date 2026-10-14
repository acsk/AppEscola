import { PAINEL_URL } from "../config";

/** Seção do protótipo "Landing Page Cursinho Hub" (dados fictícios). */
export default function Footer() {
  return (
    <>
<footer className="ftr">
  <div className="wrap">
    <div className="fgrid">
      <div><a className="logo" href="#topo"><i>CH</i>Cursinho Hub</a><p>Gestão, avaliação e aprendizagem para cursinhos preparatórios, em uma só plataforma.</p></div>
      <div><h5>Produto</h5><ul><li><a href="#alunos">Gestão de alunos</a></li><li><a href="#turmas">Turmas</a></li><li><a href="#pagamentos">Pagamentos</a></li><li><a href="#simulados">Simulados</a></li><li><a href="#banco">Banco de questões</a></li><li><a href="#area-do-aluno">Área do aluno</a></li></ul></div>
      <div><h5>Empresa</h5><ul><li><a href="#sobre">[Sobre nós]</a></li><li><a href="#demo">Solicitar demonstração</a></li><li><a href={PAINEL_URL}>Entrar</a></li></ul></div>
      <div><h5>Contato</h5><ul><li><a href="#contato">[E-MAIL DE CONTATO]</a></li><li><a href="#contato">[WHATSAPP]</a></li><li><a href="#contato">[CIDADE/UF]</a></li></ul></div>
    </div>
    <div className="legal"><span>© 2026 Cursinho Hub · [RAZÃO SOCIAL] · [CNPJ]</span><div><a href="#termos">Termos de uso</a><a href="#privacidade">Privacidade</a></div></div>
  </div>
</footer>


    </>
  );
}
