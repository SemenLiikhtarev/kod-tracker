import { useEffect } from "react";
import { useAuth } from "./auth.jsx";
import Layout from "./Layout.jsx";
import Login from "./pages/Login.jsx";
import MyTasks from "./pages/MyTasks.jsx";
import Board from "./pages/Board.jsx";
import Projects from "./pages/Projects.jsx";
import ProjectDetail from "./pages/ProjectDetail.jsx";
import Analytics from "./pages/Analytics.jsx";
import Users from "./pages/Users.jsx";
import Integrations from "./pages/Integrations.jsx";
import { navigate, useRoute } from "./lib.js";

const HOME = { manager: "board", executor: "my", observer: "board" };

const ROUTES = {
  my: { title: "Мои задачи", page: MyTasks, roles: ["executor"] },
  board: { title: "Канбан-доска конвейера", page: Board, roles: ["manager", "observer"] },
  projects: { title: "Проекты", page: Projects, roles: ["manager", "executor", "observer"] },
  analytics: { title: "Аналитика", page: Analytics, roles: ["manager", "observer"] },
  users: { title: "Сотрудники", page: Users, roles: ["manager"] },
  integrations: { title: "Интеграции и очередь", page: Integrations, roles: ["manager", "observer"] },
};

export default function App() {
  const { user, loading } = useAuth();
  const { parts } = useRoute();

  const section = parts[0] || (user ? HOME[user.role] : "");

  useEffect(() => {
    if (!user) return;
    const route = ROUTES[section];
    if (!route || !route.roles.includes(user.role)) {
      navigate(`/${HOME[user.role]}`);
    }
  }, [user, section]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-muted">
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        Загрузка КОД…
      </div>
    );
  }

  if (!user) return <Login />;

  if (section === "project" && parts[1]) {
    return (
      <Layout active="projects" title="Карточка проекта">
        <ProjectDetail id={parts[1]} />
      </Layout>
    );
  }

  const route = ROUTES[section];
  if (!route || !route.roles.includes(user.role)) {
    return <Layout active={HOME[user.role]} title="КОД">{null}</Layout>;
  }

  const Page = route.page;
  return (
    <Layout active={section} title={route.title}>
      <Page />
    </Layout>
  );
}
