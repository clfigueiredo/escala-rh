import { useState, type FormEvent } from 'react';
import { setoresApi, type Setor } from '../api';
import { CabecalhoPagina, Campo, Carregando, Interruptor, Modal, SeloAtivo, Tabela, Vazio } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCarregar } from '../lib/hooks';

export default function SetoresPage() {
  const { ehAdmin } = useAuth();
  const toast = useToast();
  const [setores, carregando, recarregar] = useCarregar(() => setoresApi.listar(), [], [] as Setor[]);
  const [editando, setEditando] = useState<Setor | 'novo' | null>(null);
  const [nome, setNome] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const abrir = (s: Setor | 'novo') => {
    setEditando(s);
    setNome(s === 'novo' ? '' : s.nome);
    setAtivo(s === 'novo' ? true : s.ativo);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    try {
      const dados = { nome: nome.trim(), ativo };
      if (editando === 'novo') await setoresApi.criar(dados);
      else await setoresApi.atualizar(editando.id, dados);
      toast.sucesso('Setor salvo.');
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
        titulo="Setores"
        subtitulo={ehAdmin ? undefined : 'Setores vinculados ao seu usuário.'}
        acoes={
          ehAdmin && (
            <button className="btn btn-primario" onClick={() => abrir('novo')}>
              + Novo setor
            </button>
          )
        }
      />
      <div className="cartao">
        {carregando ? (
          <Carregando />
        ) : setores.length === 0 ? (
          <Vazio>Nenhum setor cadastrado.</Vazio>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Situação</th>
                {ehAdmin && <th className="acoes" />}
              </tr>
            </thead>
            <tbody>
              {setores.map((s) => (
                <tr key={s.id}>
                  <td>{s.nome}</td>
                  <td>
                    <SeloAtivo ativo={s.ativo} />
                  </td>
                  {ehAdmin && (
                    <td className="acoes">
                      <button className="btn btn-pequeno" onClick={() => abrir(s)}>
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </div>

      <Modal
        titulo={editando === 'novo' ? 'Novo setor' : 'Editar setor'}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        rodape={
          <>
            <button className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-setor" className="btn btn-primario" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-setor" className="form" onSubmit={salvar}>
          <Campo rotulo="Nome" obrigatorio>
            <input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </Campo>
          <Interruptor marcado={ativo} onChange={setAtivo} rotulo="Setor ativo" />
        </form>
      </Modal>
    </div>
  );
}
