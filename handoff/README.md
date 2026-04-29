# passarim — handoff

Pacote pro Claude Code montar o site do passarim e fazer push pro Vercel.

## Estrutura sugerida (Next.js / Vite — adapta como quiser)

```
public/
  icons/
    bemtevi.svg
    sabia.svg
    uirapuru.svg
    azulao.svg
    tiesangue.svg
    sanhacu.svg

src/
  app/page.tsx            # ou pages/index.tsx — usa os components abaixo
  components/
    Header.tsx
    Hero.tsx
    Player.tsx            # card de gravação verde
    HowItWorks.tsx        # 3 passos
    OurSingers.tsx        # nossos cantores
    Footer.tsx
  lib/
    birds.ts              # data dos 6 pássaros (key, name, hex, desc)
  styles/
    tokens.css            # design tokens (cores, fontes, sombras)
    globals.css
```

## Design tokens

Veja `tokens.css`. Resumo:

- **Tipografia**: `Cormorant Garamond` (display serif, 400/500/600 + italic) + `Nunito Sans` (body, 300/400/500/600/700) + `Caveat` (label manuscrito).
  Importar via Google Fonts ou `next/font`.
- **Cores principais**:
  - `--cream: #FAF6EC` (background base)
  - `--halo: #F5F1E5` (halo dos ícones, fundo de chips)
  - `--green: #1A3D2E` (texto, contornos)
  - `--green-deep: #0F2A1F` (player card)
  - `--lime: #B8DA63` (acentos no player, waveform)
  - `--gold: #D4A84B` (detalhes decorativos)
- **Cores dos pássaros** — em `birds.ts`.
- **Radius**: 4px / 18px / 28px / 999px (pill).
- **Shadow**: `0 30px 60px -25px rgba(15, 42, 31, 0.35)`.

## Conteúdo dos pássaros (birds.ts)

```ts
export const birds = [
  { key: 'bemtevi',   name: 'bem-te-vi',   hex: '#F2C94C', desc: 'o guardião da manhã, canto claro que abre o dia na natureza.' },
  { key: 'sabia',     name: 'sabiá',       hex: '#E67E22', desc: 'poeta da paisagem, seu canto é memória e tradição.' },
  { key: 'uirapuru',  name: 'uirapuru',    hex: '#E74C3C', desc: 'raro e misterioso, seu canto ecoa como encantamento da mata.' },
  { key: 'azulao',    name: 'azulão',      hex: '#2D7DD2', desc: 'força e beleza, seu canto é firme e marcante.' },
  { key: 'tiesangue', name: 'tiê-sangue',  hex: '#6BAF6B', desc: 'pequeno notável, seu canto é alegria que contagia.' },
  { key: 'sanhacu',   name: 'sanhaçu',     hex: '#A48DBA', desc: 'cores que cantam, sua presença é pura vibração.' },
];
```

## Seções do site (na ordem)

1. **Header** — logo "passarim" + nav (`como funciona`, `nossos cantores`, `sobre`) + CTA `gravar agora`.
2. **Hero** — título grande "passarim" + tagline + decorativos (folhas, beija-flor outline, bem-te-vi flutuando à esquerda com label manuscrito).
3. **Player** — card verde escuro central. Funcionalidades:
   - waveform (placeholder ok no MVP, depois liga no áudio real)
   - play/pause
   - seletor de pássaro (dropdown com os 6)
   - toggle "incluir minha voz junto"
   - barra de progresso + volume
   - botões "baixar wav" + "nova gravação"
4. **Como funciona** — 3 passos: gravar → escolher → ouvir.
5. **Nossos cantores** — grid 6 colunas com ícone (no halo creme), nome, descrição curta. Embaixo: paleta com os 6 hexes.
6. **Footer** verde escuro com logo, blurb, colunas explore/contato.

## Referência visual

`design-reference.html` — abre no browser pra ver o design completo. Use como north star de layout/espaçamento/copy. **Não** copia o HTML literal — reescreve em React/JSX limpo, dividido nos componentes acima.

## Backend (fora do escopo deste handoff)

A síntese voz→canto-de-pássaro é separada. Endpoint esperado:
`POST /api/synthesize` — recebe `{ audio: Blob, bird: string, includeVoice: boolean }`, retorna `{ url: string }` (wav).

## Deploy

Vercel — deploy padrão do framework escolhido. Configurar domínio `passarim.app` (ou similar) depois.
