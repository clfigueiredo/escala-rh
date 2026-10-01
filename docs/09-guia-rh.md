# 9. Guia de uso para o RH e gestores

Guia prático do painel **Escala RH**. Não é preciso conhecimento técnico.

- **Endereço:** https://escala.seudominio.com.br
- **Quem usa o painel:** administradores (veem e configuram tudo) e gestores (veem só os setores vinculados a eles).
- **Funcionários não entram no painel.** Eles recebem os lembretes e consultam a escala pelo WhatsApp.

O menu fica à esquerda (no celular e no tablet, no botão ☰ do canto superior esquerdo), em três grupos:

| Grupo | Itens | Quem vê |
|---|---|---|
| **Escala** | Calendário · Gerar escala · Ausências | todos |
| **Cadastros** | Funcionários · Setores · Turnos · Padrões de escala · Usuários | todos (Usuários só admin; Setores, Turnos e Padrões o gestor só consulta) |
| **WhatsApp** | Mensagens · Conexão · Regras de lembrete · Configurações do bot | Mensagens: todos; o resto só admin |
| **Administração** | Documentação (tutorial ilustrado, este guia e a documentação técnica) | só admin |

No topo aparece o status do WhatsApp (**Conectado**, **Desconectado**...) e o seu nome, com as opções **Trocar senha** e **Sair**. No celular o status vira só uma bolinha (verde = conectado) e o nome fica no botão redondo com a sua inicial. Se o WhatsApp cair, uma faixa preta aparece no alto de todas as telas.

**Pelo celular:** o painel funciona inteiro no navegador do celular. As listas (funcionários, turnos, mensagens...) aparecem como cartões, um embaixo do outro. O calendário abre em **Lista** da semana; use **Dia** ou **Mês** para mudar a visão. No celular não dá para arrastar plantões: toque no plantão e altere o horário na janela de edição.

---

## 1. Primeiro acesso e troca de senha

1. Abra o endereço do painel e entre com o e-mail e a senha recebidos.
   (O primeiro administrador recebe os dados de quem instalou o sistema.)
2. Clique no seu nome, no canto superior direito › **Trocar senha**.
3. Informe a **Senha atual**, a **Nova senha** (mínimo de 8 caracteres) e a confirmação › **Salvar**.

Observações:
- A sessão dura 12 horas; depois disso é preciso entrar de novo.
- Após 5 tentativas de login erradas em 1 minuto, espere um minuto antes de tentar de novo.
- Esqueceu a senha? Peça a um administrador para definir uma nova em **Usuários** (veja o item 4.4).

## 2. Conectar o WhatsApp (administrador)

Use um **número dedicado** ao sistema (um chip só para isso, com o WhatsApp instalado num celular). Não use o número
pessoal de ninguém nem o número principal da empresa: a conexão usada não é a oficial do WhatsApp e existe risco de bloqueio.

1. Menu **WhatsApp › Conexão** › **Conectar**.
2. Aparece um QR Code. No celular do número dedicado, abra o WhatsApp › **Configurações › Aparelhos conectados › Conectar um aparelho**.
3. Aponte a câmera para o código. A tela muda sozinha para **Conectado** e mostra o número.
4. O código expira rápido. Se expirar, clique em **Gerar novo QR Code**.

**Boas práticas para evitar bloqueio do número**
- Coloque **foto e nome da empresa** no perfil do WhatsApp do número dedicado.
- Peça a **todos os funcionários que salvem o número na agenda** do celular (o painel lembra disso no cadastro de funcionário).
- Mantenha mensagens personalizadas (com nome e horário, como os modelos já fazem) e poucas regras de lembrete.
- Não use o número dedicado para disparos em massa, grupos ou propaganda.
- Mantenha o celular do número ligado e com internet de vez em quando; não desconecte o aparelho em "Aparelhos conectados".

**Se desconectar:** aparece uma faixa vermelha no topo do painel ("WhatsApp desconectado... Os lembretes não serão
enviados"). O administrador clica em **Conectar agora** e lê um novo QR Code. O botão **Desconectar** na tela Conexão
só deve ser usado para trocar de número.

## 3. Ordem recomendada de cadastro

1. **Setores** → 2. **Turnos** → 3. **Padrões de escala** (já vêm 12x36, 6x1 e 5x2) → 4. **Usuários** (gestores)
→ 5. **Funcionários** → 6. **Gerar escala** → 7. conferir no **Calendário**.

## 4. Cadastros

Para "remover" um cadastro, edite e desmarque **ativo**. Itens inativos somem das listas de escolha,
mas o histórico continua. Só funcionários têm também o botão **Excluir** (definitivo — veja 4.5).

### 4.1 Setores (administrador)
**Cadastros › Setores › + Novo setor** → Nome › Salvar. Ex.: Recepção, Enfermagem, Portaria.
O gestor vê aqui só os setores vinculados a ele.

### 4.2 Turnos (administrador)
**Cadastros › Turnos › + Novo turno**:
- **Nome** (ex.: Plantão dia), **Hora de início**, **Hora de fim** e **Cor no calendário**.
- Turno que atravessa a meia-noite é aceito: 19:00 às 07:00 termina automaticamente no dia seguinte.

### 4.3 Padrões de escala (administrador)
**Cadastros › Padrões de escala › + Novo padrão**. Dois tipos:
- **Ciclo** — X dias de trabalho e Y de folga, repetindo. Ex.: 12x36 = 1 trabalho / 1 folga; 6x1 = 6 / 1; 4x2 = 4 / 2.
- **Semanal** — dias fixos da semana. Ex.: 5x2 = segunda a sexta; seg a sáb para 6x1 fixo.

O padrão diz **quais dias** a pessoa trabalha; o **horário** vem do turno escolhido na hora de gerar.

### 4.4 Usuários do painel (administrador)
**Cadastros › Usuários › + Novo usuário**: Nome, E-mail, Senha (mínimo 8 caracteres), Perfil e, para gestor, os
**Setores que este gestor pode ver**.
- **Administrador** vê e altera tudo. **Gestor** só vê e altera funcionários, plantões, ausências e mensagens dos setores marcados.
- Para trocar a senha de alguém: **Editar** › preencha **Nova senha** (em branco = mantém a atual).
- Para bloquear o acesso: **Editar** › desmarque **Usuário ativo**. Vale na hora.

### 4.5 Funcionários
**Cadastros › Funcionários › + Novo funcionário**: Nome, **WhatsApp**, Setor, Cargo e Observações (opcionais).

**Formato do telefone:** digite só o DDD e o celular com o 9 na frente — o campo formata sozinho como `(51) 99999-8888`
e o +55 é colocado automaticamente. Antes de salvar, confira a linha **"Será salvo como +55 (DD) ..."** abaixo do campo.
Número sem o 9 na frente ou com DDD inexistente não é aceito. Se aparecer
"Telefone já cadastrado para ...", o número já pertence a outro funcionário.

- Funcionário **inativo** não recebe lembretes nem respostas do bot, e **libera o número**: o mesmo celular pode ser
  cadastrado para outra pessoa (só não pode haver dois funcionários *ativos* com o mesmo número).
- **Excluir** apaga o funcionário de vez, junto com todos os plantões e ausências dele. Não dá para desfazer.
  Para desligamentos, prefira desmarcar **ativo** (mantém o histórico).
- O gestor só cadastra funcionários nos seus setores.
- Use a busca por nome ou telefone e os filtros de setor/situação no topo da lista.

## 5. Gerar a escala do mês

Menu **Escala › Gerar escala**. O período já vem preenchido com o **próximo mês**.

1. **Funcionários:** marque quem vai entrar na escala (filtre por setor ou busque pelo nome). Gere juntos os
   funcionários que seguem o **mesmo padrão, turno e início de ciclo**.
2. **Padrão, turno e período:**
   - **Padrão de escala** e **Turno**.
   - **Período — de / até** (no máximo 93 dias por vez).
   - **Data de início do ciclo** (só importa para ciclo): o **primeiro dia de trabalho** do ciclo. Para continuar
     uma escala que já vem do mês anterior, informe a data do último início de ciclo (ex.: no 12x36, um dia em que a pessoa
     trabalhou) — o sistema calcula a sequência para frente.
   - **Setor dos plantões:** deixe em "Setor de cada funcionário", salvo exceções.
3. Clique em **Pré-visualizar**. Nada é gravado ainda. Aparecem o total de plantões, um resumo por funcionário
   (plantões e horas) e a lista dia a dia. Marque **Mostrar só os plantões com conflito** para conferir os problemas.
4. **Conflitos** possíveis:
   - **Sobreposição** — a pessoa já tem um plantão nesse horário (ou dois plantões gerados se cruzam).
   - **Ausência** — o dia cai em férias, atestado, folga etc.
5. Se houver conflito, escolha o que fazer:
   - **Pular** — não cria os plantões com conflito; os existentes ficam como estão (opção mais segura).
   - **Substituir** — apaga os plantões existentes que se sobrepõem e cria os novos. Dias de ausência são sempre pulados.
6. Clique em **Gerar N plantão(ões)** e confirme. O resultado mostra quantos foram **criados**, **pulados** e **substituídos**.

Gerou errado? Os plantões podem ser corrigidos ou excluídos um a um no Calendário. Evite gerar duas vezes o mesmo
período com "Substituir" sem conferir a prévia.

## 6. Calendário

Menu **Escala › Calendário** (tela inicial). Botões **Mês / Semana / Dia**, setas para navegar e **Hoje**.

- **Filtros:** setor, funcionário e **Mostrar cancelados**.
- Cada plantão tem a cor do turno. **Borda vermelha e ⚠** = conflito; passe o mouse para ver o motivo. No topo aparece
  o total de plantões com conflito.
- **Editar:** clique no plantão → altere Funcionário, Setor, Turno, Início, Fim, Status ou Observação › **Salvar**.
  Ao escolher um turno, o horário é preenchido automaticamente.
- **Mover:** arraste o plantão para outro dia/horário. **Mudar a duração:** puxe a borda de baixo (visões Semana/Dia).
- **Cancelar sem apagar:** edite e mude o **Status** para **Cancelado** (não gera lembrete; some do calendário, a menos
  que "Mostrar cancelados" esteja marcado).
- **Excluir:** abra o plantão › **Excluir** › confirme. Não dá para desfazer.
- **Plantão avulso** (troca, hora extra, cobertura): botão **+ Novo plantão**, ou clique num horário vazio do calendário.
  Em **Turno** escolha um turno ou deixe **Horário avulso** e informe início e fim à mão.
- Todos os horários são de Brasília.
- Se mudar o horário ou a pessoa de um plantão que já foi lembrado, o lembrete é enviado de novo para o novo horário.

## 7. Ausências

Menu **Escala › Ausências › + Nova ausência**: Funcionário, Tipo (**Férias**, **Atestado**, **Folga**, **Outro**),
**Data inicial**, **Data final (inclusive)** e Observação.

- Plantões que caem na ausência **ficam marcados como conflito** no calendário e **não geram lembrete**. Os plantões
  não são apagados automaticamente: decida se exclui, cancela ou passa para outra pessoa.
- No gerador, dias de ausência são sempre pulados.
- O bot mostra as ausências do período para o funcionário.
- A lista pode ser filtrada por setor, funcionário e período; use **Editar** / **Excluir** em cada linha.

## 8. Regras de lembrete (administrador)

Menu **WhatsApp › Regras de lembrete**. Já vem a regra **"1 hora antes"**. Pode haver várias regras ativas ao mesmo
tempo (ex.: uma na véspera e outra 1 hora antes) — cada uma envia uma mensagem. **Sem nenhuma regra ativa, nenhum lembrete é enviado.**

**+ Nova regra** (ou **Editar**):
- **Nome** (ex.: "Véspera 18h").
- Tipo:
  - **Antecedência** — **Minutos antes do início** (60 = 1 hora; 1440 = 1 dia).
  - **Véspera** — **Horário de envio (no dia anterior)**, ex.: 18:00, para quem trabalha no dia seguinte.
- **Texto da mensagem** — clique numa variável para inseri-la:

| Variável | Vira |
|---|---|
| `{nome}` | nome do funcionário |
| `{data}` | data do turno (dd/mm) |
| `{dia_semana}` | dia da semana por extenso |
| `{inicio}` / `{fim}` | hora de início / fim (HH:mm) |
| `{turno}` | nome do turno ("Horário avulso" se não tiver) |
| `{setor}` | setor do plantão |

- Use **Pré-visualizar mensagem** para ver o texto com dados de exemplo. Se uma variável aparecer entre chaves na
  prévia, ela está escrita errado.
- Cuidado com o texto: o modelo de antecedência diz "hoje"; o de véspera diz "amanhã". Ao trocar para Véspera, o painel
  troca o modelo automaticamente se o texto não foi mexido.
- Para pausar uma regra, desmarque **Regra ativa** (melhor que excluir).
- Plantão criado ou alterado **em cima da hora** (depois do momento do lembrete) pode não receber aquele lembrete.

## 9. O que o funcionário pode pedir ao bot

O funcionário manda qualquer mensagem para o número do sistema e recebe o menu. Depois responde só com o número:

| Envia | Recebe |
|---|---|
| **1** | Meu próximo turno (data, dia da semana, horário e setor) |
| **2** | Minha escala dos próximos 7 dias |
| **3** | Minha escala dos próximos 30 dias |
| qualquer outra coisa | o menu de novo |

- As ausências do período aparecem na resposta, e plantões dentro de ausência não são listados.
- O bot só responde a **funcionários ativos cadastrados**. Para outros números, o comportamento é definido em
  **WhatsApp › Configurações do bot** (administrador): **Ignorar** ou **Responder** com uma mensagem padrão
  (o padrão é responder avisando que o número é da empresa e não atende números não cadastrados). Só a
  **primeira** mensagem de cada número desconhecido é registrada e respondida; as seguintes são ignoradas.
- Na mesma tela dá para mudar o texto do **Menu do bot** e a **Mensagem quando não há turno no período**. As opções 1, 2 e 3 são fixas.
- O bot não responde enquanto o WhatsApp estiver desconectado.

## 10. Histórico de mensagens e lembretes que falharam

Menu **WhatsApp › Mensagens**: tudo o que foi enviado (lembretes e respostas do bot) e recebido, do mais recente para
o mais antigo. Filtros: direção, origem (Lembrete/Bot), status (OK/Falhou), funcionário e período. Clique no texto para
ver a mensagem completa. O gestor vê só as mensagens dos funcionários dos seus setores.

**Quando um lembrete aparece como Falhou**, o motivo aparece em vermelho abaixo do texto. Casos comuns:

| Erro | O que fazer |
|---|---|
| "WhatsApp desconectado..." | Reconectar em **WhatsApp › Conexão** (administrador). |
| Número sem WhatsApp / inválido | Conferir o telefone no cadastro do funcionário. |
| "Envio interrompido..." ou tempo esgotado | O sistema foi reiniciado no meio do envio; a mensagem pode ou não ter saído. |

**Importante:** o sistema **não reenvia** um lembrete que falhou (para nunca mandar a mesma mensagem duas vezes).
Depois de resolver a causa, **avise o funcionário por outro meio** (ligação ou mensagem pelo celular do setor), ou peça
que ele consulte o bot (opção **1**). Os próximos lembretes já saem normalmente.

## 11. Perguntas frequentes

**O funcionário diz que não recebeu o lembrete.**
Veja em **Mensagens** (filtre pelo funcionário). Se não houver nada: confira se a regra está ativa, se o plantão está
Agendado (não Cancelado), se não há ausência no dia, se o funcionário está ativo e se o WhatsApp está Conectado.
Se estiver "OK", o envio saiu: peça para ele salvar o número na agenda e conferir se não bloqueou o contato.

**O bot não responde a um funcionário.**
Confira se ele está ativo e se o telefone cadastrado está certo (com DDD). Se ele escreve de outro número, cadastre o número correto.

**Troquei o horário de um plantão. O funcionário recebe outro lembrete?**
Sim, para o horário novo (se ainda der tempo).

**Como faço uma troca de plantão entre duas pessoas?**
No calendário, abra o plantão e troque o **Funcionário**. O lembrete vai para a nova pessoa.

**Um funcionário saiu da empresa.**
Edite o cadastro e desmarque **Ativo**. Exclua ou reatribua os plantões futuros dele no calendário.

**O gestor não vê um funcionário ou setor.**
Um administrador precisa marcar o setor em **Usuários › Editar › Setores que este gestor pode ver**.

**Posso apagar um setor, turno ou padrão?**
Não; desative-o. Os plantões antigos continuam com o nome e a cor.

**Gerei a escala com o ciclo errado.**
Exclua os plantões errados no calendário (ou gere de novo o período com **Substituir**, conferindo a prévia) e ajuste a
**Data de início do ciclo**.

**O painel mostra "WhatsApp desconectado".**
Só o administrador reconecta (tela **Conexão**). Enquanto isso, nenhum lembrete é enviado e o bot fica sem responder.
Lembretes que deveriam ter saído nesse tempo ficam como **Falhou** e não são reenviados.
