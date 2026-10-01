import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { authApi, whatsappApi, type WhatsAppStatus } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useIntervalo } from '../lib/hooks';
import { ROTULO_ESTADO_WPP } from '../lib/rotulos';
import {
  IconeAjustes,
  IconeAusencia,
  IconeCalendario,
  IconeCelular,
  IconeChave,
  IconeCiclo,
  IconeGerar,
  IconeLivro,
  IconeMenu,
  IconeMensagens,
  IconePessoas,
  IconeRelogio,
  IconeSetor,
  IconeSino,
  Marca,
} from './icones';
import { Campo, Modal } from './ui';

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: (p: { className?: string }) => ReactNode;
  soAdmin?: boolean;
}

const GRUPOS: { titulo: string; itens: ItemMenu[] }[] = [
  {
    titulo: 'Escala',
    itens: [
      { para: '/', rotulo: 'Calendário', icone: IconeCalendario },
      { para: '/gerador', rotulo: 'Gerar escala', icone: IconeGerar },
      { para: '/ausencias', rotulo: 'Ausências', icone: IconeAusencia },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { para: '/funcionarios', rotulo: 'Funcionários', icone: IconePessoas },
      { para: '/setores', rotulo: 'Setores', icone: IconeSetor },
      { para: '/turnos', rotulo: 'Turnos', icone: IconeRelogio },
      { para: '/padroes', rotulo: 'Padrões de escala', icone: IconeCiclo },
      { para: '/usuarios', rotulo: 'Usuários', icone: IconeChave, soAdmin: true },
    ],
  },
  {
    titulo: 'WhatsApp',
    itens: [
      { para: '/mensagens', rotulo: 'Mensagens', icone: IconeMensagens },
      { para: '/whatsapp', rotulo: 'Conexão', icone: IconeCelular, soAdmin: true },
      { para: '/regras-lembrete', rotulo: 'Regras de lembrete', icone: IconeSino, soAdmin: true },
      { para: '/configuracoes', rotulo: 'Configurações do bot', icone: IconeAjustes, soAdmin: true },
    ],
  },
  {
    titulo: 'Administração',
    itens: [{ para: '/documentacao', rotulo: 'Documentação', icone: IconeLivro, soAdmin: true }],
  },
];

/** Primeira letra ou número do nome (ignora prefixos como "[TESTE]"). */
function inicialDoNome(nome: string | undefined): string {
  return (nome?.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
}

export default function Layout() {
  const { usuario, ehAdmin, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [trocarSenha, setTrocarSenha] = useState(false);
  const [wpp, setWpp] = useState<WhatsAppStatus | null>(null);
  const local = useLocation();

  // Alerta de WhatsApp desconectado (polling a cada 60 s).
  useIntervalo(() => {
    whatsappApi
      .status()
      .then(setWpp)
      .catch(() => setWpp({ estado: 'erro', erro: 'Não foi possível consultar o status do WhatsApp.' }));
  }, 60_000);

  const mostrarAlerta = wpp && wpp.estado !== 'open' && local.pathname !== '/whatsapp';

  // Com o menu aberto no celular, a página de trás não rola e Esc fecha o menu.
  useEffect(() => {
    if (!menuAberto) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [menuAberto]);

  return (
    <div className={`app ${menuAberto ? 'menu-aberto' : ''}`}>
      <aside className="lateral">
        <div className="marca">
          <Marca className="marca-logo" />
          <span>Escala RH</span>
        </div>
        <nav>
          {GRUPOS.map((g) => {
            const itens = g.itens.filter((i) => !i.soAdmin || ehAdmin);
            if (!itens.length) return null;
            return (
              <div className="menu-grupo" key={g.titulo}>
                <div className="menu-grupo-titulo">{g.titulo}</div>
                {itens.map((i) => (
                  <NavLink
                    key={i.para}
                    to={i.para}
                    end={i.para === '/'}
                    className={({ isActive }) => `menu-item ${isActive ? 'ativo' : ''}`}
                    onClick={() => setMenuAberto(false)}
                  >
                    <i.icone className="menu-icone" />
                    {i.rotulo}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="fundo-menu" onClick={() => setMenuAberto(false)} />

      <div className="principal">
        {mostrarAlerta && (
          <div className="faixa-alerta" role="alert">
            <strong>WhatsApp {ROTULO_ESTADO_WPP[wpp.estado]?.toLowerCase() ?? wpp.estado}.</strong> Os lembretes não serão
            enviados e o bot não responderá enquanto a conexão não for restabelecida.
            {wpp.erro && <> ({wpp.erro})</>}{' '}
            {ehAdmin ? <Link to="/whatsapp">Conectar agora</Link> : <span>Avise um administrador.</span>}
          </div>
        )}

        <header className="topo">
          <button type="button" className="btn-icone botao-menu" onClick={() => setMenuAberto((v) => !v)} aria-label="Abrir menu">
            <IconeMenu width={22} height={22} />
          </button>
          <span className="topo-marca">
            <Marca className="marca-logo" />
            Escala RH
          </span>
          <div className="topo-espaco" />
          {wpp && (
            <span className={`wpp-indicador wpp-${wpp.estado}`} title={wpp.erro ?? ''}>
              <span className="ponto" />
              <span className="wpp-texto">WhatsApp: {ROTULO_ESTADO_WPP[wpp.estado] ?? wpp.estado}</span>
            </span>
          )}
          <div className="usuario-menu">
            <button type="button" className="usuario-botao" onClick={() => setMenuUsuario((v) => !v)}>
              <span className="avatar">{inicialDoNome(usuario?.nome)}</span>
              <span className="usuario-nome">
                {usuario?.nome}
                <small>{usuario?.perfil === 'ADMIN' ? 'Administrador' : 'Gestor'}</small>
              </span>
            </button>
            {menuUsuario && (
              <>
                <div className="dropdown-fundo" onClick={() => setMenuUsuario(false)} />
                <div className="dropdown">
                  <div className="dropdown-info">{usuario?.email}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuUsuario(false);
                      setTrocarSenha(true);
                    }}
                  >
                    Trocar senha
                  </button>
                  <button type="button" onClick={() => void sair()}>
                    Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="conteudo">
          <Outlet />
        </main>
      </div>

      <TrocarSenhaModal aberto={trocarSenha} onFechar={() => setTrocarSenha(false)} />
    </div>
  );
}

function TrocarSenhaModal({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const toast = useToast();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [salvando, setSalvando] = useState(false);

  const fechar = () => {
    setAtual('');
    setNova('');
    setConf('');
    onFechar();
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (nova.length < 8) return toast.erro('A nova senha precisa ter pelo menos 8 caracteres.');
    if (nova !== conf) return toast.erro('A confirmação não confere com a nova senha.');
    setSalvando(true);
    try {
      await authApi.trocarSenha(atual, nova);
      toast.sucesso('Senha alterada com sucesso.');
      fechar();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Trocar senha"
      aberto={aberto}
      onFechar={fechar}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" form="form-senha" className="btn btn-primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-senha" onSubmit={enviar} className="form">
        <Campo rotulo="Senha atual" obrigatorio>
          <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} required autoComplete="current-password" />
        </Campo>
        <Campo rotulo="Nova senha" obrigatorio dica="Mínimo de 8 caracteres.">
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Confirmar nova senha" obrigatorio>
          <input type="password" value={conf} onChange={(e) => setConf(e.target.value)} required autoComplete="new-password" />
        </Campo>
      </form>
    </Modal>
  );
}
