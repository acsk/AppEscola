import { useState } from "react";
import { Icon } from "../components/icons";

const LINKS = [
  { href: "#alunos", label: "Funcionalidades" },
  { href: "#area-do-aluno", label: "Área do aluno" },
  { href: "#ia", label: "Inteligência Artificial" },
  { href: "#aprendizagem", label: "Aprendizagem" },
  { href: "#faq", label: "Dúvidas" },
];

/** Menu fixo no topo; abaixo de 1080px vira menu sanfona (botão ☰). */
export default function Header() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="hdr">
      <div className="wrap in">
        <a className="logo" href="#topo"><i>CH</i>Cursinho Hub</a>
        <nav className="nav" aria-label="Principal">
          {LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <div className="act">
          <a className="btn btn-p btn-sm" href="#demo">Agendar demonstração</a>
          <button type="button" className="burger" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} aria-controls="menu-movel" onClick={() => setOpen((v) => !v)}>
            <Icon name={open ? "close" : "menu"} size={20} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      {open ? (
        <nav className="mnav" id="menu-movel" aria-label="Menu móvel">
          {LINKS.map((l) => <a key={l.href} href={l.href} onClick={close}>{l.label}</a>)}
          <a className="btn btn-p" href="#demo" onClick={close}>Agendar demonstração</a>
        </nav>
      ) : null}
    </header>
  );
}
