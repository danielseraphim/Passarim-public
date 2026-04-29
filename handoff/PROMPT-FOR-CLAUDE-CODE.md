# Prompt pra colar no Claude Code

```
Olá! Vou montar o site do passarim — um app web de síntese de canto-de-pássaro
a partir do assobio do usuário.

Anexei um pacote de handoff com:
- design-reference.html  → mockup visual completo (referência de layout, copy,
  espaçamento e cores). NÃO copia o HTML literal — reescreve em componentes
  React limpos.
- public/icons/*.svg     → 6 ícones de pássaros (bemtevi, sabia, uirapuru,
  azulao, tiesangue, sanhacu). Usa direto via <img src="/icons/x.svg">.
- src/styles/tokens.css  → design tokens (cores, fontes, radius, shadows).
- src/lib/birds.ts       → data dos 6 pássaros.
- README.md              → estrutura sugerida e descrição de cada seção.

O que eu quero:
1. Inicia um projeto Next.js (App Router) com TypeScript e Tailwind (ou
   CSS Modules — escolhe o que for mais limpo).
2. Cola public/icons/, src/styles/tokens.css e src/lib/birds.ts no lugar.
3. Quebra o site em componentes: Header, Hero, Player, HowItWorks,
   OurSingers, Footer.
4. Monta a page principal usando esses componentes.
5. Fidelidade visual ALTA com design-reference.html — mesma tipografia,
   cores, espaçamento, copy.
6. Mobile responsivo: <720px vira coluna única.
7. O Player é interativo só no front por enquanto (estado local com
   useState). A integração com o backend de síntese vem depois.
8. Faz commit incremental e push pro repo conectado com Vercel.

Quando terminar, me avisa pra eu testar a preview no Vercel.
```
