import { useState, type ReactElement } from "react";
import { ICON, Icon } from "../components/icons";

type TabId = "q" | "s" | "a";

const TABS: { id: TabId; title: string; text: string; icon: keyof typeof ICON; panel: string }[] = [
  { id: "q", title: "IA para questões", text: "Geração de novas questões com classificação por assunto e dificuldade.", icon: "questions", panel: "Gerador de questões" },
  { id: "s", title: "IA para simulados", text: "Criação de avaliações personalizadas conforme os objetivos pedagógicos.", icon: "clock", panel: "Montagem de simulado" },
  { id: "a", title: "IA para aprendizagem", text: "Identificação de dificuldades e sugestão de exercícios direcionados.", icon: "chart", panel: "Diagnóstico e reforço" },
];

/** Exemplo ilustrativo de cada capacidade de IA (dados fictícios). */
const PANELS: Record<TabId, () => ReactElement> = {
  q: () => (
    <div className="st-body">
                <div className="st-form">
                  <div className="fld"><span>Disciplina</span><div>Matemática</div></div>
                  <div className="fld"><span>Assunto</span><div>Frações e porcentagem</div></div>
                  <div className="fld"><span>Dificuldade</span><div className="seg"><span>Fácil</span><span className="on">Média</span><span>Difícil</span></div></div>
                  <div className="fld"><span>Estilo da prova</span><div>Vestibular</div></div>
                  <div className="fld"><span>Quantidade</span><div className="mono">5 questões</div></div>
                  <div className="gen"><Icon name="sparkle" />Gerar questões</div>
                </div>
                <div className="st-out">
                  <div className="oq">
                    <div className="hd"><span className="pill p-vio">Gerada pela IA</span><span className="pill p-blue">Frações</span><span className="pill p-amb">Média</span><span className="mono" style={{ marginLeft: "auto", fontSize: "12px", color: "var(--subtle)" }}>1 de 5</span></div>
                    <p>Em uma turma, 3/5 dos alunos fizeram o simulado de sábado. Dos que fizeram, 25% acertaram todas as questões de frações. Que fração da turma acertou todas essas questões?</p>
                    <div className="alts"><span><b>A</b>1/4</span><span className="ok"><b>B</b>3/20 · gabarito</span><span><b>C</b>3/5</span><span><b>D</b>2/5</span></div>
                  </div>
                  <div className="oq ghost"><div className="hd"><span className="pill p-vio">Gerada pela IA</span><span className="pill p-blue">Porcentagem</span></div><p style={{ marginBottom: "0" }}>Uma mensalidade de R$ 180,00 teve desconto de 15%…</p></div>
                  <div className="note">Toda questão gerada passa pela revisão do professor antes de entrar no banco.</div>
                </div>
              </div>
  ),
  s: () => (
    <div className="st-body">
                <div className="st-form">
                  <div className="fld"><span>Objetivo</span><div>Revisão de fim de bimestre</div></div>
                  <div className="fld"><span>Turma</span><div>Turma B · Tarde</div></div>
                  <div className="fld"><span>Duração</span><div className="mono">90 min</div></div>
                  <div className="fld"><span>Foco</span><div className="seg"><span className="on">Reforço</span><span>Equilíbrio</span></div></div>
                  <div className="gen">Montar simulado</div>
                </div>
                <div className="st-out">
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>Proposta montada a partir do banco de questões da sua escola:</div>
                  <div className="rows">
                    <div className="srow"><b>Matemática</b><span className="pill p-amb">reforço em frações</span><span className="mono">12</span></div>
                    <div className="srow"><b>Linguagens</b><span className="pill p-blue">interpretação</span><span className="mono">10</span></div>
                    <div className="srow"><b>Ciências da Natureza</b><span className="pill p-blue">óptica</span><span className="mono">8</span></div>
                  </div>
                  <div className="dist"><i style={{ width: "30%", background: "#9FE0C6" }}></i><i style={{ width: "50%", background: "#F0B45C" }}></i><i style={{ width: "20%", background: "var(--violet)" }}></i></div>
                  <div className="leg"><span><i style={{ background: "#9FE0C6" }}></i>Fácil 30%</span><span><i style={{ background: "#F0B45C" }}></i>Média 50%</span><span><i style={{ background: "var(--violet)" }}></i>Difícil 20%</span></div>
                  <div className="note">Você ajusta, troca questões e publica quando quiser.</div>
                </div>
              </div>
  ),
  a: () => (
    <div className="st-out" style={{ padding: "24px" }}>
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>Dificuldades identificadas após o Simulado Geral · 3ª edição</div>
                <div className="rec"><span className="av">TB</span><div><b>Turma B · Frações e porcentagem</b><small>Errou mais que a média da escola nas últimas 3 avaliações</small></div><span className="pill p-vio">Lista de 12 questões</span></div>
                <div className="rec"><span className="av">IL</span><div><b>Isadora L. · Interpretação de texto</b><small>Acertos caíram nas questões com texto longo</small></div><span className="pill p-vio">Lista de 8 questões</span></div>
                <div className="rec"><span className="av">TN</span><div><b>Turma Noturna · Óptica</b><small>Assunto ainda não revisado em aula</small></div><span className="pill p-vio">Aula de revisão</span></div>
                <div className="note">As recomendações chegam ao app do aluno depois da aprovação do coordenador.</div>
              </div>
  ),
};

/** "Uma nova inteligência para o seu cursinho": abas com exemplos de IA. */
export default function AiSection() {
  const [tab, setTab] = useState<TabId>("q");
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Panel = PANELS[current.id];

  return (
    <section className="sec ai" id="ia">
      <div className="wrap">
        <span className="eyebrow"><Icon name="sparkle" />Inteligência Artificial</span>
        <h2 className="h2">Uma nova inteligência para o seu cursinho.</h2>
        <p className="lead">Automatize a criação de avaliações e transforme o desempenho dos alunos em oportunidades de aprendizagem.</p>
        <div className="ai-grid">
          <div className="tabs" role="tablist" aria-label="Capacidades de IA">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`ia-tab-${t.id}`} aria-controls="ia-painel" aria-selected={t.id === tab}
                className={`tab ${t.id === tab ? "on" : ""}`} onClick={() => setTab(t.id)}>
                <b><i><Icon name={t.icon} /></i>{t.title}</b>
                <span>{t.text}</span>
              </button>
            ))}
          </div>
          <div className="studio" role="tabpanel" id="ia-painel" aria-labelledby={`ia-tab-${current.id}`}>
            <div className="st-top">
              <span style={{ color: "var(--violet)", display: "inline-flex" }}><Icon name="sparkle" size={18} /></span>
              <b>{current.panel}</b>
              <span className="r demo">Exemplo ilustrativo</span>
            </div>
            <Panel />
          </div>
        </div>
      </div>
    </section>
  );
}
