# Novidades

Todas as mudanças que você sente na mesa. As versões seguem o formato **X.Y.Z**:

- **X** muda quando algo grande deixa de funcionar como antes (decks, partidas salvas, jeito de jogar).
- **Y** muda quando chegam coisas novas: decks, telas, regras, recursos.
- **Z** muda só com correções.

## [0.8.0] - 2026-10-16

### Novo

- **Commander para 2, 3 ou 4 jogadores**, contra computadores ou com outras pessoas em uma sala. Escolha a quantidade de jogadores antes de iniciar; cada computador pode usar um deck diferente.
- Partidas de Commander começam com **40 pontos de vida**, com zona de comando, custo adicional para conjurar novamente o comandante e registro de dano de combate por comandante. Uma eliminação mantém os demais jogadores na mesa; o último sobrevivente vence.
- O editor de Commander destaca o comandante em uma área própria, separado das outras cartas. A seleção, a troca e as parcerias válidas têm controles próprios; a importação e a exportação preservam essa separação.
- Validação de **100 cartas no total**, identidade de cor, limite de uma cópia, exceções do texto Oracle, comandantes, parcerias e legalidade. Decks incompletos podem ser salvos como rascunhos.
- Quatro decks prontos de Commander: **Triunfo das Fichas**, **Destruição Dracônica**, **Perigo no Cemitério** e **Primeiro Voo**.

### Mudou

- A mesa mostra todos os oponentes, com vida em destaque, permanentes e zona de comando de cada um. Os campos usam toda a largura disponível e mantêm o tamanho quando a pilha ou uma janela aparece por cima. Fileiras cheias têm rolagem horizontal e controles nas bordas; a pilha flutua à direita, com cartas grandes, opção de recolher e galeria central.
- No combate com vários defensores possíveis, escolha a criatura atacante e depois o jogador ou planeswalker que ela vai atacar. Quando há apenas um defensor possível, um clique continua sendo suficiente.
- Salas de Commander mostram os assentos ocupados e as vagas; a partida começa quando todos entram. Reconectar preserva o assento, e jogadores eliminados podem acompanhar o restante da partida sem revelar mãos ocultas.

### Corrigido

- **Atacar com tudo** permite escolher o oponente ou planeswalker antes de atribuir os ataques. Apenas as criaturas que podem atacar o defensor escolhido são selecionadas; a confirmação dos atacantes continua separada.

## [0.7.0] - 2026-10-16

### Novo

- **Pauper** na criação da partida, com decks prontos para o formato e validação de legalidade, cartas banidas, limite de cópias, mínimo de 60 cartas no deck e máximo de 15 no sideboard.
- Séries **melhor de três**, com placar e troca de cartas entre o deck e o sideboard antes da próxima partida. As trocas não são reveladas ao oponente.
- Cartas jogáveis podem ser arrastadas da mão ou do exílio para o campo. O clique continua disponível.
- A pilha ganhou uma galeria central: clique na pilha à direita para ver os efeitos ampliados, rolar horizontalmente e conferir a ordem de resolução e os alvos.
- **Passar automaticamente** nas opções: o jogo passa a prioridade quando não há ações disponíveis, preservando as oportunidades de resposta. A preferência fica salva; o ritmo das animações pode ser ajustado separadamente.
- **14 efeitos sonoros**, com impactos medievais, pequenas variações e sons diferentes para compras, terrenos, mágicas, habilidades, combate e início de cada turno. Dano ao jogador tem animação própria e uma explosão diferente da usada para dano às criaturas.
- **Editar** nos seus decks da tela inicial e **Importar lista** dentro do editor. É possível preencher um deck vazio, somar cartas à lista atual ou substituí-la, mantendo o nome e o formato. A revisão mostra as quantidades do deck e do sideboard antes de salvar.

### Mudou

- **Meus decks** aparecem antes dos decks prontos, com um convite para criar o primeiro deck quando a coleção está vazia. Rascunhos continuam acessíveis para edição.
- **Jogar** e **Meus decks** compartilham o mesmo cabeçalho. A configuração da partida fica em um painel à direita, com modo, formato e duração visíveis; nome e código de sala aparecem apenas nos fluxos de multiplayer que precisam deles.
- O editor destaca o nome e a arte do deck, alinha o seletor de formato e reúne importação, exportação, duplicação e exclusão em **Ações do deck**. Textos redundantes foram removidos; decks vazios mostram apenas os controles necessários para começar.
- A mesa mantém o azul e o dourado, com tipografia, espaçamento e hierarquia visual mais consistentes. As prévias dão prioridade à imagem grande da carta, e criaturas com voar recebem uma indicação visual de flutuação.
- A escolha de quem começa e o mulligan agora acontecem no centro da tela. A mão inicial aparece em leque, cada carta aumenta ao passar o mouse e o botão de manter informa a quantidade de cartas.
- As jogadas do oponente aparecem em sequência na mesa; mágicas e habilidades também aparecem na pilha à direita. Mágicas resolvidas automaticamente continuam visíveis por um breve momento, identificadas como **Jogada recente**, sem exigir confirmação extra nem atrasar suas respostas.
- O turno e todas as fases ficam visíveis no topo, incluindo a etapa específica do combate ou da limpeza. Instruções para selecionar cartas da mão aparecem acima delas, com a quantidade já escolhida e o que falta selecionar.
- Cartas que um efeito permite jogar do exílio ficam separadas ao lado da mão durante todo o prazo, mesmo sem mana ou fora do seu turno. Cartas suspensas mostram os marcadores de tempo; a decisão de conjurar aparece quando o último marcador é removido e a habilidade resolve.
- No topo da partida ficam apenas **Menu** e tela cheia. **Registro** e **Opções** ficam dentro do menu; as opções abrem no centro, com estado visível dos efeitos sonoros, volume e ritmo das jogadas. Animações respeitam a preferência por movimento reduzido.

### Corrigido

- **Labareda Cauterizante** volta a ser reconhecida como jogável quando há mana e alvos válidos, inclusive quando a escolha de um alvo depende do outro.
- **Raio da Fenda** oferece as opções de conjurar normalmente ou suspender quando está na mão. **Explosão de Fogo** distingue o pagamento de mana do sacrifício de duas Montanhas.
- Declarar bloqueadores mantém a ligação entre a criatura selecionada e o atacante escolhido, inclusive com criaturas idênticas. Cartas selecionadas para sacrifício ou descarte recebem contorno, marca de seleção e contagem persistentes.
- Uma escolha de conjuração pendente deixa de travar outras partidas ou dar a impressão de que o oponente parou. Sair de uma série encerra as decisões pendentes, e ações antigas são rejeitadas após mudanças de estado ou reconexão.
- Códigos de sala com números são reconhecidos corretamente. Séries em melhor de três preservam o placar e as preferências ao reconectar ou iniciar a próxima partida.
- Importar listas preserva o sideboard, avisa sobre linhas inválidas e cartas não encontradas e evita sobrescrever alterações feitas em outra aba. Falhas ao salvar mantêm a edição disponível para uma nova tentativa.

## [0.6.0] - 2026-10-16

### Novo
- Setas de alvo: ao escolher o alvo de uma mágica ou habilidade, uma seta azul sai da carta e vai até a criatura, permanente ou jogador escolhido, e continua lá enquanto você paga o custo. Com a mágica na pilha, a seta sai do item da pilha: dourada se for sua, vermelha se for do oponente. Assim dá para ver o que a IA está mirando antes de responder.

## [0.5.1] - 2026-10-16

### Correções
- Publicada na internet, a mesa encontra a ponte sozinha no mesmo endereço do site (`wss://seu-dominio/ws`), sem precisar abrir a porta 7171.

## [0.5.0] - 2026-10-16

### Novo
- Cartas que dá para usar fora da mão (flashback no cemitério; tramadas, foretell e Aventura no exílio) aparecem na ponta da sua mão quando você pode usá-las, com uma etiqueta dizendo de onde vêm (**Cemitério**, **Exílio**, **Tramada**). A pilha de onde elas vêm também acende em azul. A mesa ainda não confere se você tem mana para pagar o custo.
- 5 decks novos, tirados de listas que ficaram no top 8 de torneios de Standard em outubro/2026: **Ninho de Dragões** (Boros Dragons), **Teorema de Jace** (Azorius Control), **Banquete Jund** (Jund Sacrifice), **Destreza Izzet** (Izzet Prowess) e **Revelação em Quatro Cores** (4c Control).
- Tela inicial nova, em três passos: escolha o modo (contra a IA ou em rede) em cartões grandes, o deck, e veja a partida montada (**Você vs Oponente**) num painel ao lado, com o botão **Jogar** sempre à vista.
- Busca de decks por nome e filtros por cor e por origem (prontos ou seus).
- Clique duplo num deck começa a partida contra a IA.
- Botão de olho em cada deck da tela inicial abre uma prévia: as cartas separadas por tipo, com custo de mana, a curva de mana e o custo médio. Passe o mouse numa carta para vê-la ampliada (no celular, toque nela). Dá para escolher o deck direto dali.
- A tela inicial lembra o último deck e o oponente escolhidos.
- O endereço da ponte, na partida em rede, fica recolhido em "Endereço da ponte", para não atrapalhar quem só quer entrar numa sala.
- Ícone novo na aba do navegador: o losango dourado da marca da tela inicial.
- No celular a Mesa de Duelo é jogada **deitada**: ao começar uma partida, o jogo entra em tela cheia e trava a tela na horizontal (Android). Com o aparelho em pé, aparece um aviso para girar, com um botão para jogar em tela cheia onde o navegador permite.
- Mesa e tela inicial ajustadas para celular deitado: cartas, mão, retratos, botões e perguntas no tamanho certo para telas baixas; o trilho de fases mostra só o turno e a fase atual; a carta ampliada fica ao lado do texto, em vez de em cima; e na tela inicial o painel da partida fica fixo à direita.
- Botão de tela cheia no topo da mesa, ao lado de **Registro**: liga e desliga a tela cheia a qualquer momento da partida (no celular, também deixa a tela deitada). Não aparece no iPhone, onde o Safari não permite.
- Adicionar o site à tela inicial do celular abre em tela cheia e na horizontal.
- Tela **Gerenciar decks** nova: a lista mostra a capa de cada deck, as cores e o número de cartas, separada em **Meus decks** e **Decks prontos**, com busca por nome. **Novo deck** e **Importar lista** ficam no topo.
- O deck aberto tem a capa no topo, o nome editável, a contagem de criaturas, outras mágicas e terrenos, e a curva de mana. Cada carta da lista tem a miniatura da arte e botões **−** e **+** ao lado da quantidade.
- Decks prontos avisam que não podem ser alterados e oferecem **Duplicar para editar**.
- A busca de cartas do montador ganhou atalhos de cor, tipo e **Standard**, e as dicas de sintaxe ficam recolhidas. Toque na carta para adicioná-la; um selo mostra quantas já estão no deck (ex.: 2/4).

- Criaturas iguais (mesmo P/T, dano, marcadores e palavras-chave) ficam empilhadas no campo, com o contador **×N**, como os terrenos. Quem entra no combate sai da pilha.
- Pilhas de permanentes têm largura máxima: acima de 4 cópias as cartas ficam mais juntas, e o contador continua mostrando o total.
- De quem é o turno fica sempre à vista: etiqueta **Seu turno** / **Turno de…** no trilho de fases, anel dourado ou vermelho no retrato e um brilho na metade da mesa de quem joga.
- Terrenos básicos com a série de vitrais de Magali Villeneuve (Dominaria United), em todas as telas.
- Menos OK para apertar: quando você não tem nada que possa fazer (nenhuma carta jogável nem habilidade que dê para pagar), a prioridade passa sozinha, inclusive com a sua própria mágica ou gatilho na pilha.

### Mudou
- Letras novas, mais limpas: títulos, nomes de decks e banners trocaram a fonte serifada de estilo antigo (Cinzel) por uma sem serifa moderna (Outfit); o texto corrido e os números da mesa (vida, poder/resistência) passaram para Inter.

### Corrigido
- O botão **OK** não fica mais travado quando o Forge recusa a ação (um bloqueio inválido, por exemplo): dá para corrigir e confirmar de novo.
- No celular deitado, o campo do código da sala mostra o que foi digitado e o botão **Entrar** aparece inteiro.
- O fundo da tela inicial e da tela de decks fica parado ao rolar a página, em vez de rolar junto com o conteúdo.
- Os créditos no rodapé da tela inicial e da tela de decks não cobrem mais o conteúdo.
- O painel de **Novidades** abre por cima dos decks, em vez de ficar escondido atrás deles.
- A busca de cartas do montador de decks voltou a ocupar a coluna inteira (tinha ficado espremida depois da tela inicial nova).
- Ao mudar a busca de cartas rápido, a resposta de uma busca antiga não substitui mais a mais recente.
- Decks sem criaturas (como Teorema de Jace) mostram a arte de outra carta do deck, em vez de um quadro vazio.
- Cartas exiladas agora aparecem na mesa: o **exílio** ganhou uma pilha ao lado do cemitério (só quando tem cartas), e as tramadas levam a etiqueta **Tramada**.
- Cartas tramadas (plot) podem ser conjuradas de novo: antes ficavam presas no exílio, sem como usá-las.
- Pagamento manual com a mana já na reserva: se você virou os terrenos antes de conjurar, os símbolos de mana ao lado do seu retrato acendem durante o pagamento; toque em cada um para gastá-lo. Antes só o botão **Automático** conseguia usar essa mana.

## [0.4.0] - 2026-10-16

### Novo
- Artefatos e encantamentos que não são criaturas saem da fileira das criaturas: ficam ao lado dos terrenos, num grupo próprio, com cópias iguais empilhadas (Tesouros, Pistas…) e um contador **×N** em cima. Os terrenos também ganharam o contador.
- Fichas em campo aparecem com a imagem oficial (coelhos, tesouros, pistas…), em vez do quadro só com texto.

### Corrigido
- Cartas de duas faces (como The Enigma Jewel) aparecem com imagem no montador e na mesa; depois de transformar, a carta mostra a imagem e o nome do verso.
- A mesa não fica mais pedindo de novo ao Scryfall, a cada atualização, cartas que ele não encontra.

## [0.3.0] - 2026-10-16

### Novo
- No combate, uma seta dourada liga cada bloqueador à criatura que ele está bloqueando.
- Marcadores e palavras-chave (Voar, Iniciativa, Resistência a Magia, Proteção…) nas cartas do campo viram ícones, com o número no caso dos marcadores. Passe o mouse ou toque no ícone para ver o nome.
- O custo de mana de cada carta da mão aparece num selo em cima da carta, sem precisar passar o mouse.
- Emblemas de planeswalker aparecem ao lado do retrato do jogador; passe o mouse para ver o texto.
- **Importar lista** no montador de decks: cole a lista exportada do Arena, MTGO, Moxfield ou Archidekt (nomes em inglês ou português). Sideboard fica de fora, e o deck avisa quais cartas não foram encontradas.
- Símbolos de mana X, híbridos e phyrexianos aparecem desenhados, em vez de bolinhas cinza.

### Corrigido
- Explore e outros efeitos que só revelam cartas não travam mais a partida: a carta aparece com um botão OK.
- Cartas de duas faces e aventuras adicionadas ao deck (como Delver of Secrets ou Bonecrusher Giant) entram na partida normalmente.

## [0.2.0] - 2026-10-16

### Novo
- Deck **Toca dos Coelhos** (branco, Standard): um exército de Hare Apparent com Elspeth, Storm Slayer dobrando as fichas.
- Palavras-chave atuais aparecem em cima de cada carta no campo, inclusive as ganhas por efeitos (Voar da Elspeth, por exemplo).
- Poder/resistência fica **verde** quando a criatura está acima do normal e **vermelho** quando está abaixo.
- Planeswalkers mostram a lealdade no escudo, e dá para ver qual criatura está atacando qual planeswalker.
- Auras e equipamentos aparecem presos atrás da carta que encantam ou equipam.
- Selos de **Ficha** e **Cópia** (Clone e afins mostram de qual carta são cópia).
- Buscar no grimório, reanimar do cemitério e escolher no exílio agora funcionam: as cartas aparecem numa pergunta para você escolher.
- Vidência e efeitos parecidos deixam escolher quais cartas vão para o fundo, e mostram a carta do topo quando é uma só.
- O montador de decks aceita qualquer quantidade de cartas como Hare Apparent, que permitem mais de 4 cópias.

### Mudou
- Todas as partidas agora usam o motor do Forge, com todas as cartas e a IA melhor. Saiu o motor simplificado do navegador e, com ele, a escolha de motor na tela inicial e o aviso "só no Forge" nos decks.
- Para jogar é preciso rodar a ponte do Forge junto com o site (veja o README).
- O atalho `#forge` no endereço deixou de existir; use `#jogar`.

## [0.1.0] - 2026-10-15

Primeira versão.

- Mesa de Magic no navegador, contra a IA ou contra outra pessoa pela rede.
- Dois motores: um simples, direto no navegador, e o do Forge, completo.
- 8 decks prontos: Fúria da Montanha, Coração da Mata, Céu Aberto, Auras Brancas, Elementais Izzet, Landfall Verde, Pesadelos Dimir e Ninjas das Sombras.
- Montador de decks com busca de cartas, imagens e nomes em português (via Scryfall).
- Partidas em rede voltam sozinhas ao mesmo assento se a conexão cair ou a página for recarregada; revanche quando os dois pedirem.
