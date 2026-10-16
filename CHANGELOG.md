# Novidades

Todas as mudanças que você sente na mesa. As versões seguem o formato **X.Y.Z**:

- **X** muda quando algo grande deixa de funcionar como antes (decks, partidas salvas, jeito de jogar).
- **Y** muda quando chegam coisas novas: decks, telas, regras, recursos.
- **Z** muda só com correções.

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
