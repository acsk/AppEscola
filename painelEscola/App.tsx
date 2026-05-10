import "./global.css";
import { useState, useEffect } from "react";
import { loadAsync } from "expo-font";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import api from "./services/api";
import buildInfo from "./buildInfo.json";
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
import SchoolClassAttendanceScreen from "./screens/turmas/SchoolClassAttendanceScreen";
import EnrollmentsScreen from "./screens/matriculas";
import EnrollmentFormScreen from "./screens/matriculas/EnrollmentFormScreen";
import InvoicesScreen from "./screens/InvoicesScreen";
import { ExamsScreen, ExamFormScreen, ExamAttemptsScreen } from "./screens/simulados";
import TenantsScreen from "./screens/tenants/TenantsScreen";
import TenantFormScreen from "./screens/tenants/TenantFormScreen";
import { UsersScreen, UserFormScreen } from "./screens/users";
import FirstAccessPasswordScreen from "./screens/FirstAccessPasswordScreen";

type NavState = { screen: string; params?: Record<string, any> };

const CURRENT_BUILD_VERSION = String((buildInfo as any)?.version ?? "-");

const compareBuildVersions = (left: string, right: string) => {
  const normalize = (value: string) =>
    String(value || "")
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const max = Math.max(leftParts.length, rightParts.length);

  for (let i = 0; i < max; i++) {
    const a = leftParts[i] ?? 0;
    const b = rightParts[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }

  return 0;
};

let iconFontsPromise: Promise<void> | null = null;

function ensureIconFontsLoaded() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!iconFontsPromise) {
    iconFontsPromise = loadAsync({
      ionicons: require("./assets/fonts/Ionicons.ttf"),
      feather: require("./assets/fonts/Feather.ttf"),
    }).then(() => undefined);
  }

  return iconFontsPromise;
}

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
  "tenants",
  "users",
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
    if (!isNaN(id)) {
      const [,, seg2] = path.split("/").filter(Boolean);
      if (seg2 === "frequencia") return { screen: "turmas-frequencia", params: { classId: id } };
      return { screen: "turmas-form", params: { classId: id } };
    }
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

  if (seg0 === "tenants") {
    if (!seg1) return { screen: "tenants" };
    if (seg1 === "novo") return { screen: "tenants-form", params: { tenantId: null } };
    const id = parseInt(seg1, 10);
    if (!isNaN(id)) return { screen: "tenants-form", params: { tenantId: id } };
    return { screen: "tenants" };
  }

  if (seg0 === "users") {
    if (!seg1) return { screen: "users" };
    if (seg1 === "novo") return { screen: "users-form", params: { userId: null } };
    const id = parseInt(seg1, 10);
    if (!isNaN(id)) return { screen: "users-form", params: { userId: id } };
    return { screen: "users" };
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
  if (nav.screen === "turmas-frequencia") {
    const id = nav.params?.classId;
    return id != null ? `#/turmas/${id}/frequencia` : "#/turmas";
  }
  if (nav.screen === "tenants-form") {
    const id = nav.params?.tenantId;
    return id != null ? `#/tenants/${id}` : "#/tenants/novo";
  }
  if (nav.screen === "users-form") {
    const id = nav.params?.userId;
    return id != null ? `#/users/${id}` : "#/users/novo";
  }
  return `#/${nav.screen}`;
}

// ── App ────────────────────────────────────────────────────────────────────────

function AppContent() {
  const { user, isLoading, mustChangePassword } = useAuth();
  const { width } = useWindowDimensions();
  const [apiVersion, setApiVersion] = useState<string>("-");
  const [reloadRequiredDialog, setReloadRequiredDialog] = useState<{
    visible: boolean;
    message: string;
  }>({
    visible: false,
    message: "Uma nova versão do painel está disponível. Recarregue para continuar.",
  });
  const [fontsReady, setFontsReady] = useState(typeof window === "undefined");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sessionExpiredDialog, setSessionExpiredDialog] = useState<{
    visible: boolean;
    message: string;
  }>({
    visible: false,
    message: "Sua sessão expirou. Faça login novamente.",
  });
  const [networkIssueDialog, setNetworkIssueDialog] = useState<{
    visible: boolean;
    message: string;
  }>({
    visible: false,
    message: "Sem comunicação com o servidor no momento.",
  });
  const isMobile = width < 768;

  const [nav, setNav] = useState<NavState>(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      return hashToNav(window.location.hash);
    }
    return { screen: "dashboard" };
  });

  const navigate = (screen: string, params?: Record<string, any>) => {
    const next: NavState = { screen, params };
    setNav(next);
    setIsSidebarOpen(false);
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cachedApiVersion = localStorage.getItem("api_version_seen");
    if (cachedApiVersion) {
      setApiVersion(cachedApiVersion);
    }

    let active = true;
    const loadApiMeta = async () => {
      try {
        const metaUrl = `${String(api.defaults.baseURL ?? "").replace(/\/$/, "")}/meta`;
        const response = await fetch(metaUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        const rawData = await response.json().catch(() => ({}));
        const body = rawData?.body ?? rawData ?? {};
        const nextApiVersion =
          body?.api_version ?? response.headers.get("x-api-version") ?? "-";

        if (!active) return;
        setApiVersion(String(nextApiVersion));
        localStorage.setItem("api_version_seen", String(nextApiVersion));
      } catch {
        // mantém valor em cache quando falhar
      }
    };

    loadApiMeta();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let active = true;
    const checkPanelBuildVersion = async () => {
      try {
        const panelVersionUrl = `${String(api.defaults.baseURL ?? "").replace(/\/$/, "")}/version/panel`;
        const response = await fetch(panelVersionUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        const rawData = await response.json().catch(() => ({}));
        const body = rawData?.body ?? rawData ?? {};
        const latestVersion = String(body?.version ?? "-");

        if (!active || !latestVersion || latestVersion === "-") return;

        localStorage.setItem("panel_version_latest", latestVersion);

        if (compareBuildVersions(latestVersion, CURRENT_BUILD_VERSION) > 0) {
          setReloadRequiredDialog({
            visible: true,
            message: `Nova versão do painel detectada (${latestVersion}). Versão atual no navegador: ${CURRENT_BUILD_VERSION}. Recarregue para atualizar.`,
          });
        }
      } catch {
        // Sem bloquear a experiência se não conseguir consultar versão remota.
      }
    };

    checkPanelBuildVersion();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;

    if (typeof document !== "undefined") {
      Array.from(document.body.children).forEach((node) => {
        const element = node as HTMLElement;
        if (element.id !== "root") {
          element.remove();
        }
      });
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }

    ensureIconFontsLoaded()
      .then(() => {
        if (mounted) setFontsReady(true);
      })
      .catch(() => {
        if (mounted) setFontsReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Evita overlay escuro preso ao alternar mobile/desktop.
  useEffect(() => {
    if (!isMobile && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [isMobile, isSidebarOpen]);

  // Garante estado limpo do menu ao trocar autenticação.
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onAuthExpired = (event: Event) => {
      const custom = event as CustomEvent<{ message?: string }>;
      const message =
        custom?.detail?.message ||
        "Sua sessão expirou ou a comunicação com o servidor foi perdida. Faça login novamente.";

      setSessionExpiredDialog({
        visible: true,
        message,
      });
    };

    window.addEventListener("auth:expired", onAuthExpired as EventListener);
    return () => window.removeEventListener("auth:expired", onAuthExpired as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onNetworkIssue = (event: Event) => {
      const custom = event as CustomEvent<{ message?: string }>;
      const message =
        custom?.detail?.message ||
        "Sem comunicação com o servidor no momento. Verifique sua conexão e tente novamente.";

      setNetworkIssueDialog({ visible: true, message });
    };

    window.addEventListener("api:network-issue", onNetworkIssue as EventListener);
    return () =>
      window.removeEventListener("api:network-issue", onNetworkIssue as EventListener);
  }, []);

  const forceBackToLogin = () => {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
    }
    setSessionExpiredDialog((prev) => ({ ...prev, visible: false }));
    if (typeof window !== "undefined") {
      window.location.hash = "#/login";
    }
  };

  const closeNetworkIssueDialog = () => {
    setNetworkIssueDialog((prev) => ({ ...prev, visible: false }));
  };

  const retryNetworkConnection = () => {
    setNetworkIssueDialog((prev) => ({ ...prev, visible: false }));
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const closeReloadRequiredDialog = () => {
    setReloadRequiredDialog((prev) => ({ ...prev, visible: false }));
  };

  const reloadAppNow = () => {
    setReloadRequiredDialog((prev) => ({ ...prev, visible: false }));
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const renderGlobalDialogs = () => {
    if (sessionExpiredDialog.visible) {
      return (
        <View
          className="absolute inset-0 items-center justify-center px-4"
          style={{ backgroundColor: "rgba(17, 24, 39, 0.55)", zIndex: 9999 }}
        >
          <View className="w-full max-w-md rounded-2xl bg-white px-6 py-5 border border-gray-100">
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="warning-outline" size={18} color="#B45309" />
              <Text className="text-base font-bold text-gray-800">Sessão encerrada</Text>
            </View>
            <Text className="text-sm text-gray-600 mb-5">{sessionExpiredDialog.message}</Text>
            <TouchableOpacity
              onPress={forceBackToLogin}
              className="w-full rounded-xl bg-violet-600 py-3 items-center"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-white">Ir para login</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (networkIssueDialog.visible) {
      return (
        <View
          className="absolute inset-0 items-center justify-center px-4"
          style={{ backgroundColor: "rgba(17, 24, 39, 0.45)", zIndex: 9998 }}
        >
          <View className="w-full max-w-md rounded-2xl bg-white px-6 py-5 border border-gray-100">
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
              <Text className="text-base font-bold text-gray-800">Falha de comunicação</Text>
            </View>
            <Text className="text-sm text-gray-600 mb-5">{networkIssueDialog.message}</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={closeNetworkIssueDialog}
                className="flex-1 rounded-xl border border-gray-200 py-3 items-center"
                activeOpacity={0.85}
              >
                <Text className="text-sm font-semibold text-gray-700">Fechar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={retryNetworkConnection}
                className="flex-1 rounded-xl bg-violet-600 py-3 items-center"
                activeOpacity={0.85}
              >
                <Text className="text-sm font-semibold text-white">Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    if (reloadRequiredDialog.visible) {
      return (
        <View
          className="absolute inset-0 items-center justify-center px-4"
          style={{ backgroundColor: "rgba(17, 24, 39, 0.45)", zIndex: 9997 }}
        >
          <View className="w-full max-w-md rounded-2xl bg-white px-6 py-5 border border-gray-100">
            <View className="flex-row items-center gap-2 mb-3">
              <Ionicons name="refresh-outline" size={18} color="#7C3AED" />
              <Text className="text-base font-bold text-gray-800">Atualização disponível</Text>
            </View>
            <Text className="text-sm text-gray-600 mb-5">{reloadRequiredDialog.message}</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={closeReloadRequiredDialog}
                className="flex-1 rounded-xl border border-gray-200 py-3 items-center"
                activeOpacity={0.85}
              >
                <Text className="text-sm font-semibold text-gray-700">Depois</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={reloadAppNow}
                className="flex-1 rounded-xl bg-violet-600 py-3 items-center"
                activeOpacity={0.85}
              >
                <Text className="text-sm font-semibold text-white">Recarregar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return null;
  };

  const canManageTenants = user?.role === "super_admin";
  const canManageUsers = user?.role === "super_admin" || user?.role === "admin";

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
    : nav.screen.startsWith("tenants")
    ? "tenants"
    : nav.screen.startsWith("users")
    ? "users"
    : nav.screen;

  if (isLoading || !fontsReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#EEEEFF" }}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }

  if (!user) {
    if (typeof window !== "undefined" && window.location.hash !== "#/login") {
      window.location.hash = "#/login";
    }
    return (
      <>
        <LoginScreen />
        {renderGlobalDialogs()}
      </>
    );
  }

  if (mustChangePassword) {
    return (
      <>
        <FirstAccessPasswordScreen />
        {renderGlobalDialogs()}
      </>
    );
  }

  const renderScreen = () => {
    if (!canManageTenants && (nav.screen === "tenants" || nav.screen === "tenants-form")) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <View className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 max-w-xl w-full">
            <View className="flex-row items-center mb-2">
              <Ionicons name="shield-outline" size={18} color="#B45309" />
              <View style={{ width: 8 }} />
              <Text className="text-base font-semibold text-amber-800">Acesso negado</Text>
            </View>
            <Text className="text-sm text-amber-700 mb-4">
              Somente usuários com perfil super admin podem acessar a gestão de tenants.
            </Text>
            <TouchableOpacity
              onPress={() => navigate("dashboard")}
              className="self-start px-4 py-2 rounded-xl bg-amber-600"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-white">Voltar ao dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (!canManageUsers && (nav.screen === "users" || nav.screen === "users-form")) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <View className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 max-w-xl w-full">
            <View className="flex-row items-center mb-2">
              <Ionicons name="shield-outline" size={18} color="#B45309" />
              <View style={{ width: 8 }} />
              <Text className="text-base font-semibold text-amber-800">Acesso negado</Text>
            </View>
            <Text className="text-sm text-amber-700 mb-4">
              Seu perfil não possui permissão para acessar a gestão de usuários.
            </Text>
            <TouchableOpacity
              onPress={() => navigate("dashboard")}
              className="self-start px-4 py-2 rounded-xl bg-amber-600"
              activeOpacity={0.85}
            >
              <Text className="text-sm font-semibold text-white">Voltar ao dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

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
      case "turmas-frequencia": return <SchoolClassAttendanceScreen navigate={navigate} classId={nav.params?.classId ?? null} />;
      case "matriculas": return <EnrollmentsScreen navigate={navigate} />;
      case "matriculas-form": return <EnrollmentFormScreen navigate={navigate} />;
      case "cobrancas": return <InvoicesScreen />;
      case "simulados": return <ExamsScreen navigate={navigate} />;
      case "simulados-form": return <ExamFormScreen navigate={navigate} examId={nav.params?.examId ?? null} />;
      case "simulados-tentativas": return <ExamAttemptsScreen navigate={navigate} initialStatusFilter={nav.params?.status ?? ""} />;
      case "tenants": return <TenantsScreen navigate={navigate} flashMessage={nav.params?.success ?? ""} />;
      case "tenants-form": return <TenantFormScreen navigate={navigate} tenantId={nav.params?.tenantId ?? null} />;
      case "users": return <UsersScreen navigate={navigate} flashMessage={nav.params?.success ?? ""} />;
      case "users-form": return <UserFormScreen navigate={navigate} userId={nav.params?.userId ?? null} />;
      default: return <DashboardScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <View className="flex-1 flex-row" style={{ backgroundColor: "#EEEEFF" }}>
        {!isMobile && (
          <Sidebar
            activeItem={activeItem}
            onSelectItem={(s) => navigate(s)}
            canManageTenants={canManageTenants}
            canManageUsers={canManageUsers}
            apiVersion={apiVersion}
          />
        )}
        {isMobile && isSidebarOpen && (
          <View
            className="absolute inset-0"
            style={{ zIndex: 30, backgroundColor: "rgba(17, 24, 39, 0.42)" }}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setIsSidebarOpen(false)}
              className="absolute inset-0"
            />
            <Sidebar
              activeItem={activeItem}
              onSelectItem={(s) => navigate(s)}
              canManageTenants={canManageTenants}
              canManageUsers={canManageUsers}
              apiVersion={apiVersion}
              isMobile
              onClose={() => setIsSidebarOpen(false)}
            />
          </View>
        )}
        <View className="flex-1 flex-col overflow-hidden">
          <Header onOpenMenu={isMobile ? () => setIsSidebarOpen(true) : undefined} isMobile={isMobile} />
          {renderScreen()}
        </View>
      </View>
      {renderGlobalDialogs()}
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
