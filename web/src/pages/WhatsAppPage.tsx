import { useState } from 'react';
import { whatsappApi, type WhatsAppStatus } from '../api';
import { CabecalhoPagina } from '../components/ui';
import { useToast } from '../contexts/ToastContext';
import { useIntervalo } from '../lib/hooks';
import { fmtTelefone, ROTULO_ESTADO_WPP } from '../lib/rotulos';

export default function WhatsAppPage() {
  const toast = useToast();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const consultar = () => {
    whatsappApi
      .status()
      .then((s) => {
        setStatus(s);
        if (s.estado === 'open' && qrcode) {
          setQrcode(null);
          toast.sucesso('WhatsApp conectado!');
        }
      })
      .catch((e) => setStatus({ estado: 'erro', erro: e instanceof Error ? e.message : 'Erro ao consultar status.' }));
  };

  // Polling a cada 3 s nesta tela.
  useIntervalo(consultar, 3000);

  const conectar = async () => {
    setOcupado(true);
    try {
      const r = await whatsappApi.conectar();
      setStatus((s) => ({ ...(s ?? {}), estado: r.estado }));
      if (r.qrcode) setQrcode(r.qrcode);
      else if (r.estado === 'open') toast.sucesso('WhatsApp já está conectado.');
      else toast.info('Aguardando QR Code… tente novamente em alguns segundos se ele não aparecer.');
    } catch (e) {
      toast.erro(e);
    } finally {
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    if (
      !window.confirm(
        'Desconectar o WhatsApp? Os lembretes deixarão de ser enviados e o bot deixará de responder até conectar novamente (será preciso ler um novo QR Code).',
      )
    )
      return;
    setOcupado(true);
    try {
      await whatsappApi.desconectar();
      setQrcode(null);
      toast.sucesso('WhatsApp desconectado.');
      consultar();
    } catch (e) {
      toast.erro(e);
    } finally {
      setOcupado(false);
    }
  };

  const estado = status?.estado;
  const conectado = estado === 'open';

  return (
    <div>
      <CabecalhoPagina titulo="Conexão do WhatsApp" subtitulo="Número dedicado usado para enviar lembretes e responder o bot de consulta." />

      <div className="whatsapp-grade">
        <div className="cartao cartao-padding">
          <h3>Status</h3>
          {!status ? (
            <p className="texto-suave">Consultando…</p>
          ) : (
            <>
              <div className={`status-grande wpp-${status.estado}`}>
                <span className="ponto" /> {ROTULO_ESTADO_WPP[status.estado] ?? status.estado}
              </div>
              {status.numero && (
                <p>
                  Número: <strong>{fmtTelefone(status.numero)}</strong>
                </p>
              )}
              {status.erro && <div className="alerta alerta-erro">{status.erro}</div>}
            </>
          )}
          <div className="botoes">
            {!conectado && (
              <button className="btn btn-primario" onClick={() => void conectar()} disabled={ocupado}>
                {qrcode ? 'Gerar novo QR Code' : 'Conectar'}
              </button>
            )}
            {(conectado || estado === 'connecting') && (
              <button className="btn btn-perigo" onClick={() => void desconectar()} disabled={ocupado}>
                Desconectar
              </button>
            )}
          </div>
          <p className="texto-suave texto-pequeno">O status é atualizado automaticamente a cada 3 segundos.</p>
        </div>

        <div className="cartao cartao-padding">
          {conectado ? (
            <>
              <h3>Tudo certo</h3>
              <p>O WhatsApp está conectado. Os lembretes serão enviados automaticamente e o bot responde aos funcionários cadastrados.</p>
              <h4>Boas práticas para evitar bloqueio</h4>
              <ul className="lista">
                <li>Use um número dedicado, com foto e nome da empresa no perfil.</li>
                <li>Peça aos funcionários que salvem o número na agenda.</li>
                <li>Mantenha as mensagens personalizadas (nome, horário) e o volume baixo.</li>
              </ul>
            </>
          ) : qrcode ? (
            <div className="qrcode-bloco">
              <h3>Leia o QR Code</h3>
              <img src={qrcode} alt="QR Code para conectar o WhatsApp" className="qrcode" />
              <ol className="lista">
                <li>Abra o WhatsApp no celular do número dedicado.</li>
                <li>
                  Toque em <strong>Configurações › Aparelhos conectados › Conectar um aparelho</strong>.
                </li>
                <li>Aponte a câmera para este código.</li>
              </ol>
              <p className="texto-suave texto-pequeno">O código expira em poucos segundos; se expirar, clique em “Gerar novo QR Code”.</p>
            </div>
          ) : (
            <>
              <h3>Como conectar</h3>
              <ol className="lista">
                <li>
                  Clique em <strong>Conectar</strong> para gerar o QR Code.
                </li>
                <li>No celular do número dedicado, abra o WhatsApp › Aparelhos conectados › Conectar um aparelho.</li>
                <li>Leia o código. Esta tela detecta a conexão sozinha.</li>
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
