import { useState, type FormEvent } from 'react';
import { funcionariosApi, setoresApi, type Funcionario, type Setor } from '../api';
import { CabecalhoPagina, Campo, Carregando, filtroAtivoParaQuery, Interruptor, Modal, SelectAtivo, SeloAtivo, Tabela, type FiltroAtivo, Vazio } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useCarregar, useDebounce } from '../lib/hooks';
import { fmtTelefone, mascaraTelefone, validarTelefoneDigitado } from '../lib/rotulos';

interface FormState {
  nome: string;
  telefone: string;
  setorId: string;
  cargo: string;
  observacoes: string;
  ativo: boolean;
}

const VAZIO: FormState = { nome: '', telefone: '', setorId: '', cargo: '', observacoes: '', ativo: true };

export default function FuncionariosPage() {
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const [setorId, setSetorId] = useState('');
  const [ativo, setAtivo] = useState<FiltroAtivo>('ativos');
  const buscaD = useDebounce(busca.trim());

  const [setores] = useCarregar(() => setoresApi.listar(), [], [] as Setor[]);
  const [lista, carregando, recarregar] = useCarregar(
    () =>
      funcionariosApi.listar({
        busca: buscaD || undefined,
        setorId: setorId ? Number(setorId) : undefined,
        ativo: filtroAtivoParaQuery(ativo),
      }),
    [buscaD, setorId, ativo],
    [] as Funcionario[],
  );

  const [editando, setEditando] = useState<Funcionario | 'novo' | null>(null);
  const [form, setForm] = useState<FormState>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const abrir = (f: Funcionario | 'novo') => {
    setEditando(f);
    if (f === 'novo') {
      const unicoSetor = setores.filter((s) => s.ativo);
      setForm({ ...VAZIO, setorId: unicoSetor.length === 1 ? String(unicoSetor[0].id) : setorId });
    } else {
      setForm({
        nome: f.nome,
        telefone: mascaraTelefone(f.telefone),
        setorId: String(f.setorId),
        cargo: f.cargo ?? '',
        observacoes: f.observacoes ?? '',
        ativo: f.ativo,
      });
    }
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    if (!form.setorId) return toast.erro('Selecione o setor.');
    const erroTelefone = validarTelefoneDigitado(form.telefone);
    if (erroTelefone) return toast.erro(erroTelefone);
    setSalvando(true);
    try {
      const dados = {
        nome: form.nome.trim(),
        telefone: '55' + form.telefone.replace(/\D/g, ''),
        setorId: Number(form.setorId),
        cargo: form.cargo.trim() || null,
        observacoes: form.observacoes.trim() || null,
        ativo: form.ativo,
      };
      if (editando === 'novo') await funcionariosApi.criar(dados);
      else await funcionariosApi.atualizar(editando.id, dados);
      toast.sucesso('Funcionário salvo.');
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
        titulo="Funcionários"
        subtitulo="Quem recebe os lembretes e consulta a escala pelo WhatsApp."
        acoes={
          <button className="btn btn-primario" onClick={() => abrir('novo')}>
            + Novo funcionário
          </button>
        }
      />

      <div className="filtros">
        <input type="search" placeholder="Buscar por nome ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={setorId} onChange={(e) => setSetorId(e.target.value)} aria-label="Setor">
          <option value="">Todos os setores</option>
          {setores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <SelectAtivo valor={ativo} onChange={setAtivo} />
      </div>

      <div className="cartao">
        {carregando && lista.length === 0 ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <Vazio>Nenhum funcionário encontrado.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <Tabela>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>WhatsApp</th>
                  <th>Setor</th>
                  <th>Cargo</th>
                  <th>Situação</th>
                  <th className="acoes" />
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.nome}</strong>
                      {f.observacoes && <div className="texto-suave texto-pequeno">{f.observacoes}</div>}
                    </td>
                    <td className="nowrap">{fmtTelefone(f.telefone)}</td>
                    <td>{f.setor?.nome}</td>
                    <td>{f.cargo || '—'}</td>
                    <td>
                      <SeloAtivo ativo={f.ativo} />
                    </td>
                    <td className="acoes">
                      <button className="btn btn-pequeno" onClick={() => abrir(f)}>
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
        titulo={editando === 'novo' ? 'Novo funcionário' : 'Editar funcionário'}
        aberto={editando !== null}
        onFechar={() => setEditando(null)}
        rodape={
          <>
            <button className="btn" onClick={() => setEditando(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-func" className="btn btn-primario" disabled={salvando}>
              Salvar
            </button>
          </>
        }
      >
        <form id="form-func" className="form" onSubmit={salvar}>
          <Campo rotulo="Nome" obrigatorio>
            <input value={form.nome} onChange={(e) => set('nome', e.target.value)} required autoFocus />
          </Campo>
          <Campo
            rotulo="WhatsApp"
            obrigatorio
            dica={
              form.telefone && !validarTelefoneDigitado(form.telefone) ? (
                <>
                  Será salvo como <strong>{fmtTelefone('55' + form.telefone.replace(/\D/g, ''))}</strong> — confira o DDD.
                </>
              ) : (
                <>
                  DDD + número do celular com o 9 na frente, ex.: <code>(51) 99999-8888</code>. O +55 é colocado
                  automaticamente.
                </>
              )
            }
          >
            <input
              type="tel"
              value={form.telefone}
              onChange={(e) => set('telefone', mascaraTelefone(e.target.value))}
              required
              maxLength={15}
              placeholder="(51) 99999-8888"
              inputMode="tel"
            />
          </Campo>
          <div className="alerta alerta-info texto-pequeno">
            Oriente o funcionário a <strong>salvar o número do WhatsApp do sistema na agenda do celular</strong>. Isso evita
            que as mensagens caiam como desconhecidas e reduz o risco de bloqueio do número.
          </div>
          <div className="grade-2">
            <Campo rotulo="Setor" obrigatorio>
              <select value={form.setorId} onChange={(e) => set('setorId', e.target.value)} required>
                <option value="">Selecione…</option>
                {setores
                  .filter((s) => s.ativo || String(s.id) === form.setorId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo rotulo="Cargo">
              <input value={form.cargo} onChange={(e) => set('cargo', e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="Observações">
            <textarea rows={3} value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
          </Campo>
          <Interruptor
            marcado={form.ativo}
            onChange={(v) => set('ativo', v)}
            rotulo="Ativo (inativo não recebe lembretes nem respostas do bot)"
          />
        </form>
      </Modal>
    </div>
  );
}
