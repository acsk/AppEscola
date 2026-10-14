import "./src/styles.css";
import Header from "./src/sections/Header";
import Hero from "./src/sections/Hero";
import Clients from "./src/sections/Clients";
import Problem from "./src/sections/Problem";
import Students from "./src/sections/Students";
import Classes from "./src/sections/Classes";
import Payments from "./src/sections/Payments";
import Exams from "./src/sections/Exams";
import QuestionBank from "./src/sections/QuestionBank";
import AiSection from "./src/sections/AiSection";
import StudentApp from "./src/sections/StudentApp";
import Learning from "./src/sections/Learning";
import HowItWorks from "./src/sections/HowItWorks";
import Benefits from "./src/sections/Benefits";
import FinalCta from "./src/sections/FinalCta";
import Faq from "./src/sections/Faq";
import Footer from "./src/sections/Footer";
import { useReveal } from "./src/useReveal";

/** Landing page do Cursinho Hub (protótipo "Landing Page Cursinho Hub"). Só web: HTML + CSS, sem primitivas RN. */
export default function App() {
  useReveal();

  return (
    <div className="lp">
      <Header />
      <main>
        <Hero />
        <Clients />
        <Problem />
        <Students />
        <Classes />
        <Payments />
        <Exams />
        <QuestionBank />
        <AiSection />
        <StudentApp />
        <Learning />
        <HowItWorks />
        <Benefits />
        <FinalCta />
        <Faq />
      </main>
      <Footer />
      <div className="sticky-cta"><a className="btn btn-p" href="#demo">Agendar demonstração</a></div>
    </div>
  );
}
