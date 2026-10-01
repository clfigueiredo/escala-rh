import { useState, type FormEvent } from 'react';
import { setoresApi, usuariosApi, type Perfil, type Setor, type Usuario, type UsuarioInput } from '../api';
import { CabecalhoPagina, Campo, Carregando, Interruptor, Modal, Selo, SeloAtivo, Tabela, Vazio } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCarregar } from '../lib/hooks';

interface FormState {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
  setorIds: number[];
  ativo: boolean;
}

export default function UsuariosPage() {
  const toast = useToast();
  const { usuario: eu } = useAuth();
  const [usuarios, carregando, recarregar] = useCarregar(() => usuariosApi.listar(), [], [] as Usuario[]);
  const [setores] = useCarregar(() => setoresApi.listar(), [], [] as Setor[]);
  const [editando, setEditando] = useState<Usuario | 'novo' | null>(null);
  const [form, setForm] = useState<FormState>({ nome: '', email: '', senha: '', perfil: 'GESTOR', setorIds: [], ativo: true });
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const nomeSetor = (id: number) => setores.find((s) => s.id === id)?.nome ?? `#${id}`;

  const abrir = (u: Usuario | 'novo') => {
    setEditando(u);
    setForm(
      u === 'novo'
        ? { nome: '', email: '', senha: '', perfil: 'GESTOR', setorIds: [], ativo: true }
        : { nome: u.nome, email: u.email, senha: '', perfil: u.perfil, setorIds: u.setorIds ?? [], ativo: u.ativo },
    );
  };

  const alternarSetor = (id: number) =>
    set('setorIds', form.setorIds.includes(id) ? form.setorIds.filter((x) => x !== id) : [...form.setorIds, id]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    if (editando === 'novo' && form.senha.length < 8) return toast.erro('A senha precisa ter pelo menos 8 caracteres.');
    if (editando !== 'novo' && form.senha && form.senha.length < 8) return toast.erro('A nova senha precisa ter pelo menos 8 caracteres.');
    if (form.perfil === 'GESTOR' && form.setorIds.length === 0) {
      if (!window.confirm('Gestor sem setores vinculados não verá nenhum funcionário nem escala. Salvar mesmo assim?')) return;
    }
    const dados: UsuarioInput = {
      nome: form.nome.trim(),
      email: form.email.trim(),
      perfil: form.perfil,
      setorIds: form.perfil === 'ADMIN' ? [] : form.setorIds,
      ativo: form.ativo,
    };
    if (form.senha) dados.senha = form.senha;
    else if (editando !== 'novo') dados.senha = '';
    setSalvando(true);
    try {
      if (editando === 'novo') await usuariosApi.criar(dados);
      else await usuariosApi.atualizar(editando.id, dados);
      toast.sucesso('Usuário salvo.');
      setEditando(null);
      void recarregar();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <CabecalhoPagina
        titulo="Usuários do painel"
        subtitulo="Administradores veem tudo; gestores só os setores vinculados."
        acoes={
          <button className="btn btn-primario" onClick={() => abrir('novo')}>
            + Novo usuário
          </button>
        }
      />
      <div className="cartao">
        {carregando ? (
          <Carregando />
        ) : usuarios.length === 0 ? (
          <Vazio>Nenhum usuário.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <Tabela>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Setores</th>
                  <th>Situação</th>
                  <th className="acoes" />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.nome}</strong> {u.id === eu?.id && <span className="texto-suave">(você)</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <Selo cor={u.perfil === 'ADMIN' ? 'azul' : 'cinza'}>{u.perfil === 'ADMIN' ? 'Administrador' : 'Gestor'}</Selo>
                    </td>
                    <td>{u.perfil === 'ADMIN' ? <span className="texto-suave">Todos</span> : u.setorIds.map(nomeSetor).join(', ') || '—'}</td>
                    <td>
                      <SeloAtivo ativo={u.ativo} />
                    </td>
                    <td className="acoes">
                      <button className="btn btn-pequeno" onClick={() => abrir(u)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </div>

      <Modal
        titulo={editando === 'novo' ? 'Novo usuário' : 'Editar usuário'}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        rodape={
          <>
            <button className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-usuario" className="btn btn-primario" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-usuario" className="form" onSubmit={salvar} autoComplete="off">
          <Campo rotulo="Nome" obrigatorio>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus />
          </Campo>
          <Campo rotulo="E-mail" obrigatorio>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          </Campo>
          <Campo
            rotulo={editando === 'novo' ? 'Senha' : 'Nova senha'}
            obrigatorio={editando === 'novo'}
            dica={editando === 'novo' ? 'Mínimo de 8 caracteres.' : 'Deixe em branco para manter a senha atual.'}
          >
            <input
              type="password"
              value={form.senha}
              onChange={(e) => set('senha', e.target.value)}
              required={editando === 'novo'}
              autoComplete="new-password"
            />
          </Campo>
          <div className="opcoes-radio">
            <label>
              <input type="radio" checked={form.perfil === 'GESTOR'} onChange={() => set('perfil', 'GESTOR')} /> Gestor
            </label>
            <label>
              <input type="radio" checked={form.perfil === 'ADMIN'} onChange={() => set('perfil', 'ADMIN')} /> Administrador
            </label>
          </div>
          {form.perfil === 'GESTOR' && (
            <Campo rotulo="Setores que este gestor pode ver">
              <div className="lista-check">
                {setores.length === 0 && <span className="texto-suave">Nenhum setor cadastrado.</span>}
                {setores.map((s) => (
                  <label key={s.id}>
                    <input type="checkbox" checked={form.setorIds.includes(s.id)} onChange={() => alternarSetor(s.id)} /> {s.nome}
                    {!s.ativo && <span className="texto-suave"> (inativo)</span>}
                  </label>
                ))}
              </div>
            </Campo>
          )}
          <Interruptor marcado={form.ativo} onChange={(v) => set('ativo', v)} rotulo="Usuário ativo (pode entrar no painel)" />
        </form>
      </Modal>
    </div>
  );
}
