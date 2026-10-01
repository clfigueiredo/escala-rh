import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { Carregando } from './components/ui';
import { useAuth } from './contexts/AuthContext';
import AusenciasPage from './pages/AusenciasPage';
import CalendarioPage from './pages/CalendarioPage';
import ConfiguracoesPage from './pages/ConfiguracoesPage';
import FuncionariosPage from './pages/FuncionariosPage';
import GeradorPage from './pages/GeradorPage';
import LoginPage from './pages/LoginPage';
import MensagensPage from './pages/MensagensPage';
import PadroesPage from './pages/PadroesPage';
import RegrasLembretePage from './pages/RegrasLembretePage';
import SetoresPage from './pages/SetoresPage';
import TurnosPage from './pages/TurnosPage';
import UsuariosPage from './pages/UsuariosPage';
import WhatsAppPage from './pages/WhatsAppPage';

function Protegido({ children }: { children: ReactNode }) {
  const { usuario, carregando } = useAuth();
  const local = useLocation();
  if (carregando) return <Carregando texto="Carregando sessão…" />;
  if (!usuario) return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  return <>{children}</>;
}

function SoAdmin({ children }: { children: ReactNode }) {
  const { ehAdmin } = useAuth();
  if (!ehAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protegido>
            <Layout />
          </Protegido>
        }
      >
        <Route index element={<CalendarioPage />} />
        <Route path="gerador" element={<GeradorPage />} />
        <Route path="ausencias" element={<AusenciasPage />} />
        <Route path="funcionarios" element={<FuncionariosPage />} />
        <Route path="setores" element={<SetoresPage />} />
        <Route path="turnos" element={<TurnosPage />} />
        <Route path="padroes" element={<PadroesPage />} />
        <Route path="mensagens" element={<MensagensPage />} />
        <Route path="usuarios" element={<SoAdmin><UsuariosPage /></SoAdmin>} />
        <Route path="whatsapp" element={<SoAdmin><WhatsAppPage /></SoAdmin>} />
        <Route path="regras-lembrete" element={<SoAdmin><RegrasLembretePage /></SoAdmin>} />
        <Route path="configuracoes" element={<SoAdmin><ConfiguracoesPage /></SoAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
