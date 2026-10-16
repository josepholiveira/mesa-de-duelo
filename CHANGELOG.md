# Novidades

Todas as mudanças que você sente na mesa. As versões seguem o formato **X.Y.Z**:

- **X** muda quando algo grande deixa de funcionar como antes (decks, partidas salvas, jeito de jogar).
- **Y** muda quando chegam coisas novas: decks, telas, regras, recursos.
- **Z** muda só com correções.

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
