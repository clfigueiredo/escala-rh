import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { mensagemDeErro } from '../api';
import { Marca } from '../components/icones';
import { Campo } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { usuario, carregando, entrar } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const destino = (local.state as { de?: string } | null)?.de || '/';

  if (!carregando && usuario) return <Navigate to={destino} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      navegar(destino, { replace: true });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login-fundo">
      <section className="login-painel">
        <div className="marca">
          <Marca className="marca-logo" />
          <span>Escala RH</span>
        </div>
        <div>
          <h1>Cada turno no lugar, cada pessoa avisada.</h1>
          <p>Monte a escala da equipe e o sistema lembra cada funcionário pelo WhatsApp antes do plantão.</p>
        </div>
        <span className="login-painel-rodape">Acesso restrito ao RH e aos gestores de setor.</span>
      </section>
      <div className="login-lado">
        <form className="login-cartao" onSubmit={enviar}>
          <h2>Entrar no painel</h2>
          <p className="subtitulo">Use o e-mail e a senha cadastrados pelo administrador.</p>
          {erro && <div className="alerta alerta-erro">{erro}</div>}
          <Campo rotulo="E-mail">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" />
          </Campo>
          <Campo rotulo="Senha">
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" />
          </Campo>
          <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
