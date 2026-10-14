import { useEffect } from "react";

/** Blocos que entram com fade + subida ao aparecer na tela. O hero já tem a animação `.rise`. */
const SELECTOR = [
  // cabeçalhos das seções
  "main section:not(.hero) :is(.eyebrow, .ey, h2, .lead, .hd > p, p.l)",
  // listas e cartões
  ".pts li", ".bi", ".step", ".box", ".faq-i", ".pcol", ".see li",
  // telas e blocos grandes
  ".stage", ".scatter", ".hub", ".ai-grid", ".sdesk-cap", ".car", ".car-cap",
  ".marq", ".clients .ft", ".fcard", ".final .alt",
].join(",");

/** Atraso entre itens irmãos (s) e limite para listas longas não demorarem. */
const STEP = 0.08;
const MAX_STAGGER = 5;

/**
 * Marca os blocos com `.rv` e adiciona `.in` quando entram na tela.
 * Depois da transição as classes saem, para não interferir em hover/transições próprias.
 */
export function useReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    const marked = new Set(els);

    els.forEach((el) => {
      let order = 0;
      for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (marked.has(prev as HTMLElement)) order++;
      }
      el.style.setProperty("--rv-d", `${Math.min(order, MAX_STAGGER) * STEP}s`);
      el.classList.add("rv");
    });

    const done = (event: TransitionEvent) => {
      const el = event.currentTarget as HTMLElement;
      if (event.target !== el || event.propertyName !== "opacity") return;
      el.classList.remove("rv", "in");
      el.style.removeProperty("--rv-d");
      el.removeEventListener("transitionend", done);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          el.addEventListener("transitionend", done);
          el.classList.add("in");
          observer.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      els.forEach((el) => {
        el.removeEventListener("transitionend", done);
        el.classList.remove("rv", "in");
        el.style.removeProperty("--rv-d");
      });
    };
  }, []);
}
