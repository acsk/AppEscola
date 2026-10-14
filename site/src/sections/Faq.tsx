import { useState } from "react";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Para que tipo de instituição a plataforma é indicada?",
    a: "Para cursinhos preparatórios — ENEM, vestibulares, institutos federais, colégios militares e concursos — que querem administrar alunos, turmas e financeiro e, no mesmo lugar, criar e aplicar avaliações.",
  },
  {
    q: "A Inteligência Artificial substitui o professor?",
    a: "Não. A IA sugere questões, simulados e listas de reforço. Tudo o que ela produz passa pela revisão de um professor ou coordenador antes de chegar aos alunos.",
  },
  {
    q: "Posso aproveitar as provas e questões que já tenho?",
    a: "Sim. Você importa provas em PDF e a IA separa e classifica as questões por disciplina e assunto. Depois, é só revisar e incluir no banco.",
  },
  {
    q: "Os alunos também usam a plataforma?",
    a: "Sim. Pelo app do aluno, no celular ou no computador, eles praticam questões, fazem simulados, acompanham o desempenho e veem as próprias cobranças.",
  },
  {
    q: "Como funciona a parte financeira?",
    a: "Você define as regras de cobrança, acompanha mensalidades e taxas, vê o que foi recebido, o que está a receber e o que venceu, e exporta relatórios em PDF ou Excel.",
  },
  {
    q: "Quanto custa e como é a implantação?",
    a: "[Descreva aqui os planos, a forma de cobrança e o prazo médio de implantação.]",
  },
];

/** Dúvidas frequentes: uma resposta aberta por vez. */
export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section className="sec t-white" id="faq">
      <div className="wrap faqg">
        <div>
          <span className="eyebrow">Dúvidas frequentes</span>
          <h2 className="h2" style={{ fontSize: "36px" }}>Perguntas que recebemos de diretores e coordenadores.</h2>
          <p className="lead" style={{ fontSize: "16px" }}>Não encontrou a sua? <a href="#demo">Fale com a gente</a>.</p>
        </div>
        <div className="faq">
          {FAQ.map((item, i) => (
            <div className="faq-i" key={item.q}>
              <button type="button" className="faq-q" id={`faq-q-${i}`} aria-expanded={open === i} aria-controls={`faq-a-${i}`}
                onClick={() => setOpen(open === i ? -1 : i)}>
                {item.q}<i aria-hidden="true">+</i>
              </button>
              {open === i ? <div className="faq-a" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}>{item.a}</div> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
