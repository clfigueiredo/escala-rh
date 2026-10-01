/**
 * Payloads no formato real da Evolution API v2.3.7 (webhook.controller.ts + prepareMessage).
 */
import { describe, expect, it } from 'vitest';
import { extrairMensagem, normalizarEvento } from './parser';

function upsert(data: Record<string, unknown>) {
  return {
    event: 'messages.upsert',
    instance: 'escala',
    data,
    destination: 'http://app:3000/api/webhooks/evolution/xxx',
    date_time: '2026-09-30T10:00:00.000Z',
    sender: '5551988887777@s.whatsapp.net',
    server_url: 'http://evolution:8080',
    apikey: null,
  };
}

const base = {
  pushName: 'Maria',
  status: 'DELIVERY_ACK',
  messageTimestamp: 1759226400,
  instanceId: 'fd9c39af-b4dd-48c8-b358-0275eb66e5fa',
  source: 'android',
};

describe('normalizarEvento', () => {
  it('aceita formato da v2 (minúsculo com ponto) e constante', () => {
    expect(normalizarEvento('messages.upsert')).toBe('MESSAGES_UPSERT');
    expect(normalizarEvento('MESSAGES_UPSERT')).toBe('MESSAGES_UPSERT');
    expect(normalizarEvento('connection.update')).toBe('CONNECTION_UPDATE');
    expect(normalizarEvento('qrcode.updated')).toBe('QRCODE_UPDATED');
    expect(normalizarEvento('messages.update')).toBe('OUTRO');
    expect(normalizarEvento(undefined)).toBe('OUTRO');
  });
});

describe('extrairMensagem', () => {
  it('texto simples (conversation)', () => {
    const p = upsert({
      ...base,
      key: { remoteJid: '5551999998888@s.whatsapp.net', fromMe: false, id: '3EB0A1B2C3' },
      message: { conversation: ' 2 ' },
      messageType: 'conversation',
    });
    expect(extrairMensagem(p.data)).toEqual({
      tipo: 'texto',
      telefone: '5551999998888',
      texto: '2',
      msgId: '3EB0A1B2C3',
      timestamp: 1759226400,
    });
  });

  it('extendedTextMessage (caso a Evolution não converta)', () => {
    const r = extrairMensagem({
      ...base,
      key: { remoteJid: '555199998888@s.whatsapp.net', fromMe: false, id: 'X1' },
      message: { extendedTextMessage: { text: 'oi' } },
      messageType: 'extendedTextMessage',
    });
    expect(r).toMatchObject({ tipo: 'texto', telefone: '555199998888', texto: 'oi' });
  });

  it('ignora grupo', () => {
    const r = extrairMensagem({
      ...base,
      key: { remoteJid: '120363025246125888@g.us', fromMe: false, id: 'G1', participant: '5551999998888@s.whatsapp.net' },
      message: { conversation: '1' },
    });
    expect(r).toEqual({ tipo: 'ignorar', motivo: 'grupo' });
  });

  it('ignora fromMe', () => {
    const r = extrairMensagem({
      ...base,
      key: { remoteJid: '5551999998888@s.whatsapp.net', fromMe: true, id: 'M1' },
      message: { conversation: '1' },
    });
    expect(r).toEqual({ tipo: 'ignorar', motivo: 'fromMe' });
  });

  it('ignora status@broadcast', () => {
    const r = extrairMensagem({ ...base, key: { remoteJid: 'status@broadcast', fromMe: false, id: 'S1' }, message: { conversation: 'x' } });
    expect(r.tipo).toBe('ignorar');
  });

  it('ignora mensagem sem texto (imagem sem legenda, áudio)', () => {
    const r = extrairMensagem({
      ...base,
      key: { remoteJid: '5551999998888@s.whatsapp.net', fromMe: false, id: 'A1' },
      message: { audioMessage: { seconds: 3 } },
      messageType: 'audioMessage',
    });
    expect(r).toEqual({ tipo: 'ignorar', motivo: 'sem texto' });
  });

  it('@lid com remoteJidAlt (addressingMode lid)', () => {
    const r = extrairMensagem({
      ...base,
      key: {
        remoteJid: '123456789012345@lid',
        remoteJidAlt: '5551999998888@s.whatsapp.net',
        addressingMode: 'lid',
        fromMe: false,
        id: 'L1',
      },
      message: { conversation: '1' },
    });
    expect(r).toMatchObject({ tipo: 'texto', telefone: '5551999998888' });
  });

  it('@lid com senderPn (Baileys mais antigo)', () => {
    const r = extrairMensagem({
      ...base,
      key: { remoteJid: '123456789012345@lid', senderPn: '5551999998888@s.whatsapp.net', fromMe: false, id: 'L2' },
      message: { conversation: '1' },
    });
    expect(r).toMatchObject({ tipo: 'texto', telefone: '5551999998888' });
  });

  it('@lid sem número alternativo → ignora', () => {
    const r = extrairMensagem({ ...base, key: { remoteJid: '123@lid', fromMe: false, id: 'L3' }, message: { conversation: '1' } });
    expect(r.tipo).toBe('ignorar');
  });

  it('número estrangeiro → ignora', () => {
    const r = extrairMensagem({ ...base, key: { remoteJid: '14155550123@s.whatsapp.net', fromMe: false, id: 'E1' }, message: { conversation: '1' } });
    expect(r.tipo).toBe('ignorar');
  });
});
