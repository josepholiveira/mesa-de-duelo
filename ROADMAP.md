# Próximas funcionalidades

## 1. Importar deck por link (Moxfield e Archidekt)

No construtor de decks, um campo **Importar por link** que aceita a URL pública de um deck e cria um deck do usuário com as mesmas cartas.

- [ ] Reconhecer as URLs:
  - Moxfield: `https://moxfield.com/decks/{id}`
  - Archidekt: `https://archidekt.com/decks/{id}` (com ou sem o slug do nome no fim)
- [ ] Buscar a lista nas APIs públicas:
  - Moxfield: `https://api2.moxfield.com/v3/decks/all/{id}` → `boards.mainboard.cards` (e `sideboard`, `commanders`)
  - Archidekt: `https://archidekt.com/api/decks/{id}/` → `cards[]` com `quantity`, `card.oracleCard.name` e `categories` (separar "Sideboard"/"Maybeboard")
- [ ] Contornar CORS: as duas APIs não liberam chamada direta do navegador. Opções:
  - rota de proxy no Vite (`server.proxy` em dev) — simples, mas só funciona no `npm run dev`;
  - endpoint na ponte Java (`/importar?url=...`) — funciona também no build e na partida em rede. **Preferido.**
- [ ] Converter para `DeckData` (`{ name, cards: { name, count }[] }`), usando o nome do deck de origem e um `id` novo; salvar com `saveUserDecks`.
- [ ] Normalizar nomes: cartas de duas faces (`A // B`) e nomes que o Forge não conhece; avisar quais cartas ficaram de fora em vez de falhar o deck inteiro.
- [ ] Pré-carregar as imagens com `fetchByNames` depois de importar.
- [ ] Erros claros: link inválido, deck privado, sem rede, deck vazio.
- [x] Bônus: aceitar também a lista em texto colado (`4 Lightning Bolt`, formato de exportação do Moxfield/Arena), que serve de alternativa quando o link falhar.

## 2. Custo de mana visível no leque de cartas da mão ✅

Hoje as cartas da mão (`.hcard`, `src/style.css`) se sobrepõem em 34% da largura (`margin-left: calc(var(--hcw) * -0.34)`), e a carta seguinte cobre o canto superior direito da anterior, que é justamente onde fica o custo de mana. Só dá para ver o custo passando o mouse.

- [x] Mostrar um selo com o custo de mana no canto **superior esquerdo** de cada carta da mão, saindo pela borda de cima (a parte que fica descoberta no leque), usando `manaHTML` de `src/ui/cardtext.ts` com o `manaCost` que já chega em `FCard`.
- [x] Gerar o selo em `face()`/no `map` da mão em `src/ui/forgeTable.ts` (só para a mão, não para o campo de batalha).
- [x] Estilo: fundo escuro semitransparente, símbolos legíveis no tamanho atual de `--hcw`, sem tapar o nome da carta além do necessário.
- [x] Terrenos e cartas sem custo: não mostrar selo.
- [x] Cartas de duas faces / custo alternativo: mostrar o custo da face da frente.
- [x] Conferir em mão cheia (7+ cartas) e em tela estreita, onde a sobreposição é maior.
