import "./global.css";
import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import StudentsScreen from "./screens/alunos";
import StudentFormScreen from "./screens/alunos/StudentFormScreen";
import GuardiansScreen from "./screens/GuardiansScreen";
import CoursesScreen from "./screens/cursos";
import CourseFormScreen from "./screens/cursos/CourseFormScreen";
import BundlesScreen from "./screens/cursos/BundlesScreen";
import BundleFormScreen from "./screens/cursos/BundleFormScreen";
import SubjectsScreen from "./screens/SubjectsScreen";
import SchoolClassesScreen from "./screens/turmas";
import SchoolClassFormScreen from "./screens/turmas/SchoolClassFormScreen";
import EnrollmentsScreen from "./screens/matriculas";
import EnrollmentFormScreen from "./screens/matriculas/EnrollmentFormScreen";
import InvoicesScreen from "./screens/InvoicesScreen";
import { ExamsScreen, ExamFormScreen, ExamAttemptsScreen } from "./screens/simulados";

type NavState = { screen: string; params?: Record<string, any> };

// ── Hash routing helpers ───────────────────────────────────────────────────────

const SCREEN_SLUGS = [
  "responsaveis",
  "cursos",
  "disciplinas",
  "turmas",
  "matriculas",
  "cobrancas",
  "dashboard",
  "pacotes",
  "simulados",
  "simulados-tentativas",
];

function hashToNav(hash: string): NavState {
  const path = hash.replace(/^#\/?/, "");
  const [seg0, seg1] = path.split("/").filter(Boolean);

  if (seg0 === "alunos") {
    if (!seg1) return { screen: "alunos" };
    if (seg1 === "novo") return { screen: "alunos-form", params: { studentId: null } };
    const id = parseInt(seg1, 10);
    if (!isNaN(id)) return { screen: "alunos-form", params: { studentId: id } };
    return { screen: "alunos" };
  }

  if (seg0 === "cursos") {
    if (!seg1) return { screen: "cursos" };
    if (seg1 === "novo") return { screen: "cursos-form", params: { courseId: null } };
    const id = parseInt(seg1, 10);
    if (!isNaN(id)) return { screen: "cursos-form", params: { courseId: id } };
    return { screen: "cursos" };
  }

  if (seg0 === "pacotes") {
    if (!seg1) return { screen: "pacotes" };
    if (seg1 === "novo") return { screen: "pacotes-form", params: { bundleId: null } };
    const id = parseInt(seg1, 10);
    if (!isNaN(id)) return { screen: "pacotes-form", params: { bundleId: id } };
    return { screen: "pacotes" };
  }

  if (seg0 === "matriculas") {
    if (!seg1) return { screen: "matriculas" };
    if (seg1 === "nova") return { screen: "matriculas-form" };
    return { screen: "matriculas" };
  }

  if (seg0 === "turmas") {
    if (!seg1) return { screen: "turmas" };
    if (seg1 === "nova") return { screen: "turmas-form", params: { classId: null } };
    const id = parseInt(seg1, 10);
    if (!isNaN(id)) return { screen: "turmas-form", params: { classId: id } };
    return { screen: "turmas" };
  }

  if (seg0 === "simulados") {
    if (!seg1) return { screen: "simulados" };
    if (seg1 === "tentativas") {
      const [,, seg2] = path.split("/").filter(Boolean);
      return {
        screen: "simulados-tentativas",
        params: seg2 ? { status: seg2 } : undefined,
      };
    }
    if (seg1 === "novo") return { screen: "simulados-form", params: { examId: null } };
    const id = parseInt(seg1, 10);
    if (!isNaN(id)) return { screen: "simulados-form", params: { examId: id } };
    return { screen: "simulados" };
  }

  if (seg0 && SCREEN_SLUGS.includes(seg0)) return { screen: seg0 };
  return { screen: "dashboard" };
}

function navToHash(nav: NavState): string {
  if (nav.screen === "alunos-form") {
    const id = nav.params?.studentId;
    return id != null ? `#/alunos/${id}` : "#/alunos/novo";
  }
  if (nav.screen === "cursos-form") {
    const id = nav.params?.courseId;
    return id != null ? `#/cursos/${id}` : "#/cursos/novo";
  }
  if (nav.screen === "pacotes-form") {
    const id = nav.params?.bundleId;
    return id != null ? `#/pacotes/${id}` : "#/pacotes/novo";
  }
  if (nav.screen === "matriculas-form") return "#/matriculas/nova";
  if (nav.screen === "simulados-form") {
    const id = nav.params?.examId;
    return id != null ? `#/simulados/${id}` : "#/simulados/novo";
  }
  if (nav.screen === "simulados-tentativas") {
    const status = nav.params?.status;
    return status ? `#/simulados/tentativas/${status}` : "#/simulados/tentativas";
  }
  if (nav.screen === "turmas-form") {
    const id = nav.params?.classId;
    return id != null ? `#/turmas/${id}` : "#/turmas/nova";
  }
  return `#/${nav.screen}`;
}

// ── App ────────────────────────────────────────────────────────────────────────

function AppContent() {
  const { user, isLoading } = useAuth();

  const [nav, setNav] = useState<NavState>(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      return hashToNav(window.location.hash);
    }
    return { screen: "dashboard" };
  });

  const navigate = (screen: string, params?: Record<string, any>) => {
    const next: NavState = { screen, params };
    setNav(next);
    if (typeof window !== "undefined") {
      window.location.hash = navToHash(next);
    }
  };

  // Sync nav when user presses browser back/forward
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => setNav(hashToNav(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // determina item ativo na sidebar (sem sub-rota)
  const activeItem = nav.screen.startsWith("alunos")
    ? "alunos"
    : nav.screen.startsWith("cursos") || nav.screen.startsWith("pacotes")
    ? "cursos"
    : nav.screen.startsWith("matriculas")
    ? "matriculas"
    : nav.screen.startsWith("turmas")
    ? "turmas"
    : nav.screen.startsWith("simulados")
    ? "simulados"
    : nav.screen;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#EEEEFF" }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  const renderScreen = () => {
    switch (nav.screen) {
      case "alunos": return <StudentsScreen navigate={navigate} />;
      case "alunos-form": return <StudentFormScreen navigate={navigate} studentId={nav.params?.studentId ?? null} />;
      case "responsaveis": return <GuardiansScreen />;
      case "cursos": return <CoursesScreen navigate={navigate} />;
      case "cursos-form": return <CourseFormScreen navigate={navigate} courseId={nav.params?.courseId ?? null} />;
      case "pacotes": return <BundlesScreen navigate={navigate} />;
      case "pacotes-form": return <BundleFormScreen navigate={navigate} bundleId={nav.params?.bundleId ?? null} />;
      case "disciplinas": return <SubjectsScreen />;
      case "turmas": return <SchoolClassesScreen navigate={navigate} />;
      case "turmas-form": return <SchoolClassFormScreen navigate={navigate} classId={nav.params?.classId ?? null} />;
      case "matriculas": return <EnrollmentsScreen navigate={navigate} />;
      case "matriculas-form": return <EnrollmentFormScreen navigate={navigate} />;
      case "cobrancas": return <InvoicesScreen />;
      case "simulados": return <ExamsScreen navigate={navigate} />;
      case "simulados-form": return <ExamFormScreen navigate={navigate} examId={nav.params?.examId ?? null} />;
      case "simulados-tentativas": return <ExamAttemptsScreen navigate={navigate} initialStatusFilter={nav.params?.status ?? ""} />;
      default: return <DashboardScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <View className="flex-1 flex-row" style={{ backgroundColor: "#EEEEFF" }}>
        <Sidebar activeItem={activeItem} onSelectItem={(s) => navigate(s)} />
        <View className="flex-1 flex-col overflow-hidden">
          <Header />
          {renderScreen()}
        </View>
      </View>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
