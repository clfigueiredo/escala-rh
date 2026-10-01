import { useEffect, useState, type FormEvent } from 'react';
import { configuracoesApi, type Configuracoes } from '../api';
import { CabecalhoPagina, Campo, Carregando } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useCarregar } from '../lib/hooks';

const VAZIO: Configuracoes = {
  'bot.menu': '',
  'bot.sem_turno': '',
  'bot.numero_desconhecido': { acao: 'ignorar', texto: '' },
};

export default function ConfiguracoesPage() {
  const toast = useToast();
  const [dados, carregando, recarregar] = useCarregar(() => configuracoesApi.obter(), [], null as Configuracoes | null);
  const [form, setForm] = useState<Configuracoes>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (dados) {
      setForm({
        'bot.menu': dados['bot.menu'] ?? '',
        'bot.sem_turno': dados['bot.sem_turno'] ?? '',
        'bot.numero_desconhecido': {
          acao: dados['bot.numero_desconhecido']?.acao ?? 'ignorar',
          texto: dados['bot.numero_desconhecido']?.texto ?? '',
        },
      });
    }
  }, [dados]);

  const nd = form['bot.numero_desconhecido'];
  const setNd = (v: Partial<Configuracoes['bot.numero_desconhecido']>) =>
    setForm((f) => ({ ...f, 'bot.numero_desconhecido': { ...f['bot.numero_desconhecido'], ...v } }));

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (nd.acao === 'responder' && !nd.texto.trim()) return toast.erro('Escreva a mensagem para números desconhecidos.');
    setSalvando(true);
    try {
      await configuracoesApi.salvar(form);
      toast.sucesso('Configurações salvas.');
      void recarregar();
    } catch (err) {
      toast.erro(err);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando && !dados) return <Carregando />;

  return (
    <div>
      <CabecalhoPagina titulo="Configurações do bot" subtitulo="Textos e comportamento do bot de consulta pelo WhatsApp." />
      <form className="cartao cartao-padding form form-largo" onSubmit={salvar}>
        <Campo
          rotulo="Menu do bot"
          dica={
            <>
              Enviado quando o funcionário manda qualquer mensagem que não seja uma opção. As opções são fixas:{' '}
              <strong>1</strong> próximo turno, <strong>2</strong> escala da semana, <strong>3</strong> escala do mês.
            </>
          }
        >
          <textarea
            rows={7}
            className="textarea-mensagem"
            value={form['bot.menu']}
            onChange={(e) => setForm((f) => ({ ...f, 'bot.menu': e.target.value }))}
            placeholder={'Olá! Sou o assistente de escala.\n1 - Meu próximo turno\n2 - Minha escala da semana\n3 - Minha escala do mês'}
          />
        </Campo>

        <Campo rotulo="Mensagem quando não há turno no período" dica="Usada nas opções 1, 2 e 3 quando não houver plantões.">
          <textarea
            rows={3}
            className="textarea-mensagem"
            value={form['bot.sem_turno']}
            onChange={(e) => setForm((f) => ({ ...f, 'bot.sem_turno': e.target.value }))}
            placeholder="Você não tem turnos agendados neste período."
          />
        </Campo>

        <fieldset className="grupo">
          <legend>Número desconhecido</legend>
          <p className="texto-suave texto-pequeno">
            O que fazer quando alguém que não é funcionário ativo cadastrado manda mensagem para o número do sistema.
            Só a primeira mensagem de cada número é registrada e respondida; as seguintes são ignoradas.
          </p>
          <div className="opcoes-radio opcoes-radio-bloco">
            <label>
              <input type="radio" checked={nd.acao === 'ignorar'} onChange={() => setNd({ acao: 'ignorar' })} />
              <span>
                <strong>Ignorar</strong> — não responde nada.
              </span>
            </label>
            <label>
              <input type="radio" checked={nd.acao === 'responder'} onChange={() => setNd({ acao: 'responder' })} />
              <span>
                <strong>Responder</strong> uma única vez com a mensagem padrão abaixo.
              </span>
            </label>
          </div>
          {nd.acao === 'responder' && (
            <Campo rotulo="Mensagem padrão">
              <textarea
                rows={3}
                className="textarea-mensagem"
                value={nd.texto}
                onChange={(e) => setNd({ texto: e.target.value })}
                placeholder="Este número é de uso exclusivo para escalas de funcionários."
              />
            </Campo>
          )}
        </fieldset>

        <div className="botoes">
          <button type="submit" className="btn btn-primario" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </div>
  );
}
