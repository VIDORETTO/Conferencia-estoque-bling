# Todo: Problemas Encontrados no App "Conferência Estoque Bling"

> Data da análise: 20/05/2026
> Total de problemas: **45**

---

## 🔴 CRÍTICOS (Risco alto — podem causar perda de dados, falha grave ou brecha de segurança)

### C1. Endpoint `/api/debug-creds` expõe credenciais públicamente
**Arquivo:** `server.ts:46-48`  
**Problema:** O endpoint retorna `APP_USERNAME` e `APP_PASSWORD` em JSON, está listado em `PUBLIC_API_PATHS` (sem autenticação). Qualquer pessoa com acesso ao servidor pode obter as credenciais de login do app.  
**Impacto:** Permite acesso não autorizado ao sistema.  
**Solução:** Remover o endpoint em produção ou exigir autenticação.

### C2. CSRF do OAuth é ignorado quando falha — fallback inseguro
**Arquivo:** `server.ts:296-306`  
**Problema:** Mesmo quando a verificação de estado (state) falha, o código prossegue com a troca do código OAuth por tokens. O comentário diz "defense-in-depth" mas na prática DESATIVA a proteção anti-CSRF.  
**Impacto:** Permite ataque CSRF onde um atacante pode vincular a conta Bling da vítima ao seu próprio sistema.  
**Solução:** Abortar a troca quando o state for inválido.

### C3. `postMessage` com origin `'*'` vaza tokens OAuth
**Arquivo:** `server.ts:352-356`  
**Problema:** O callback OAuth envia `access_token` e `refresh_token` via `window.opener.postMessage(... , '*')`. O asterisco significa qualquer origem pode receber esses tokens.  
**Impacto:** Um site malicioso pode abrir uma popup para a URL de callback e interceptar os tokens.  
**Solução:** Especificar a origem exata do opener (ex: `window.opener.location.origin` com fallback), ou enviar apenas um código curto e o cliente trocar por tokens.

### C4. JWT_SECRET com fallback inseguro
**Arquivo:** `server.ts:33-34`  
**Problema:** Se `JWT_SECRET` não for definido, o código usa `APP_PASSWORD` como secret. Pior: se nem `APP_PASSWORD` existir, usa a string hardcoded `"some-secure-default-secret"`.  
**Impacto:** Qualquer um que saiba a senha do app pode forjar tokens JWT arbitrários.  
**Solução:** Exigir `JWT_SECRET` no startup e falhar se não estiver definido.

### C5. Tokens OAuth armazenados em `localStorage`
**Arquivo:** `src/App.tsx:121-125`, `src/lib/apiFetch.ts:3-6`  
**Problema:** `bling_access_token` e `bling_refresh_token` são salvos em `localStorage`, vulneráveis a XSS. Embora cookies httpOnly também sejam usados, o código depende de `localStorage` como fallback principal.  
**Impacto:** Qualquer XSS drena tokens OAuth com acesso total ao Bling.  
**Solução:** Usar apenas cookies httpOnly + Secure + SameSite, remover fallback para localStorage.

### C6. Depósito `NaN` enviado ao Bling quando não há depósito definido
**Arquivo:** `server.ts:427-441`  
**Problema:** Quando `depositoId` não é informado e a lista de depósitos está vazia, `targetDeposito` fica `undefined`. `Number(undefined)` resulta em `NaN`, e o payload enviado ao Bling contém `deposito: { id: NaN }`.  
**Impacto:** Operação de balanço de estoque falha silenciosamente ou corrompe dados no Bling.  
**Solução:** Validar `targetDeposito` antes de enviar, retornar erro se não houver depósito.

---

## 🟠 ALTOS (Impacto significativo na funcionalidade, segurança ou experiência)

### A1. Scanner de código de barras não reseta debounce ao trocar câmera
**Arquivo:** `src/App.tsx:1232,1309`  
**Problema:** `isScanning.current` é um ref do componente que persiste entre efeitos. Quando `facingMode` muda, o efeito anterior faz cleanup, mas o novo efeito herda `isScanning.current = true` da sessão anterior. O primeiro código lido após trocar a câmera é ignorado.  
**Solução:** Resetar `isScanning.current = false` no início do efeito ou ao trocar facingMode.

### A2. `AudioContext` criado a cada scan sem fechar — vazamento de recursos de áudio
**Arquivo:** `src/App.tsx:819-833, 841-854`  
**Problema:** Cada leitura de código de barras cria um novo `AudioContext` para o beep, mas nunca chama `.close()`. Vários scans rápidos acumulam centenas de contextos de áudio.  
**Impacto:** Consumo excessivo de memória, lentidão progressiva, possível crash em dispositivos móveis.  
**Solução:** Criar um único `AudioContext` reutilizável com `useRef`.

### A3. `handleConfirm` sobrescreve `isSavingDetails` após `saveToBling` já ter completado
**Arquivo:** `src/App.tsx:912-965`  
**Problema:** `saveToBling()` gerencia `isSavingDetails` internamente (linha 699, 908), mas `handleConfirm` seta `setIsSavingDetails(true)` novamente na linha 932 DEPOIS que `saveToBling` já terminou. Isso causa flicker no estado de carregamento.  
**Solução:** Usar uma flag separada ou reestruturar o fluxo.

### A4. Nenhum loading state enquanto busca estoque — usuário vê "0" enganoso
**Arquivo:** `src/App.tsx:685-686, 745-761`  
**Problema:** `expectedQty` começa como `0` e não há estado de "carregando estoque". O usuário vê "0" até a requisição terminar, podendo pensar que o produto tem estoque zero.  
**Solução:** Adicionar estado `isStockLoading` e mostrar indicador de carregamento.

### A5. Botão "Conectar ao Bling" sem fallback para popup bloqueada
**Arquivo:** `src/App.tsx:144-168`  
**Problema:** Se o popup for bloqueado, apenas um toast genérico é mostrado. O usuário não tem como prosseguir.  
**Solução:** Mostrar link manual clicável como fallback quando `authWindow` for `null`.

### A6. Rota `/api/auth/url` e `/api/auth/callback` são públicas (sem auth do app)
**Arquivo:** `server.ts:105-113, 263-285, 287-370`  
**Problema:** Qualquer pessoa que descobrir a URL pode iniciar o fluxo OAuth com o Bling. Embora isso seja necessário para o fluxo, não há proteção contra abuso (rate limiting, etc.).  
**Solução:** Requerer autenticação do app para `/api/auth/url` (o usuário já deve estar logado para conectar ao Bling).

### A7. Atributo `secure: true` em cookies em ambiente HTTP (localhost) pode falhar
**Arquivo:** `server.ts:69-74, 171-186, 268-274, 331-345`  
**Problema:** Cookies com `secure: true` e `sameSite: "none"` não funcionam em conexões HTTP (localhost). O código tenta compensar com headers manuais, mas cookies OAuth podem não ser salvos no desenvolvimento local.  
**Solução:** Usar `secure: !!process.env.VERCEL` condicionalmente para todos os cookies, igual já é feito para `oauth_state`.

---

## 🟡 MÉDIOS (Impacto moderado — bugs, comportamento inesperado, problemas menores)

### M1. Teste `test.js` aponta para endpoint inexistente
**Arquivo:** `test.js:2`  
**Problema:** Faz fetch para `http://127.0.0.1:3000/app-debug` que não existe no servidor. O teste sempre falhará com 404.  
**Solução:** Corrigir URL ou alterar endpoint alvo.

### M2. `test-login.js` depende de `/api/debug-creds` (que expõe senhas)
**Arquivo:** `test-login.js:4`  
**Problema:** Busca credenciais de um endpoint público para fazer login. Isso torna o teste dependente de uma falha de segurança.  
**Solução:** Passar credenciais via env vars para o teste.

### M3. Leitor de código inline não valida EAN com zero à esquerda
**Arquivo:** `src/App.tsx:809-813`  
**Problema:** Produtos podem ter códigos como `"00123"` e `"123"`. A comparação usa `toUpperCase()` que não resolve diferenças de padding. Um código escaneado `"123"` não bateria com `"00123"` do sistema.  
**Solução:** Normalizar removendo zeros à esquerda antes de comparar.

### M4. Lista de resultados da busca some ao selecionar produto
**Arquivo:** `src/App.tsx:397`  
**Problema:** `handleSelectProduct` limpa `searchResults` e `searchTerm`. Se o usuário quiser voltar para comparar com outro resultado, precisa pesquisar novamente.  
**Solução:** Manter resultados em cache e permitir navegação de volta.

### M5. `clearSession` usa `confirm()` nativo do navegador
**Arquivo:** `src/App.tsx:420`  
**Problema:** Usa o diálogo nativo do browser, inconsistente com o design do app.  
**Solução:** Substituir por um `Dialog` ou `AlertDialog` do shadcn/ui.

### M6. Sidebar de itens conferidos sempre mostra "cx/un" como unidade
**Arquivo:** `src/App.tsx:549-551`  
**Problema:** Assume que todos os produtos são contados em caixas/unidades. Produtos como quilos, litros ou metros ficariam com unidade errada.  
**Solução:** Buscar unidade do produto da API do Bling e exibir corretamente.

### M7. Relatório em tela não mostra link para foto
**Arquivo:** `src/App.tsx:598-666`  
**Problema:** O Excel exporta o link da foto, mas a tabela em tela não tem coluna de foto/LINK FOTO.  
**Solução:** Adicionar coluna com link ou thumbnail.

### M8. Scanner abre simultaneamente na busca e no editor de produto
**Arquivo:** `src/App.tsx:467, 1118`  
**Problema:** `ConferenceBoard` e `ProductDetailsEditor` cada um tem seu próprio estado `isScannerOpen`. Teoricamente ambos podem estar true ao mesmo tempo (dois scanners rodando concorrentemente).  
**Solução:** Unificar o estado do scanner ou garantir que apenas um exista.

### M9. Nenhum timeout configurado nas chamadas axios ao Bling/ImgBB
**Arquivo:** `server.ts:154-167, 313-327, 381-391, 429-434, 501-503, 607-611, 629-634, 661-669`  
**Problema:** Todas as chamadas à API Bling e ImgBB não têm timeout configurado. Se o Bling ficar lento ou offline, a requisição pode travar indefinidamente.  
**Solução:** Adicionar `timeout: 15000` (15s) em todas as chamadas.

### M10. `express.json({ limit: "50mb" })` registrado duas vezes
**Arquivo:** `server.ts:12, 647`  
**Problema:** O middleware JSON é registrado globalmente com limite de 50mb e novamente no POST `/api/upload-image`. O segundo é redundante.  
**Solução:** Remover o registro duplicado em `/api/upload-image`.

---

## 🔵 BAIXOS (Problemas de qualidade, code smells, melhorias)

### B1. App inteiro em um único arquivo de 1366 linhas
**Arquivo:** `src/App.tsx`  
**Problema:** Componentes `App`, `LoginScreen`, `ConferenceBoard`, `ProductDetailsEditor`, `ExportExcelButton`, `BarcodeScanner` estão todos no mesmo arquivo. Dificulta manutenção, testes e compreensão.  
**Solução:** Separar cada componente em seu próprio arquivo.

### B2. `any` types abundantes no backend e frontend
**Arquivo:** Múltiplos (ex: `server.ts:19,193,396,469,583`, `src/App.tsx:359,362,365,731-735,870`)  
**Problema:** Uso extensivo de `any` derrota o sistema de tipos do TypeScript.  
**Solução:** Tipar corretamente as respostas da API, parâmetros, etc.

### B3. strict mode do TypeScript desabilitado
**Arquivo:** `tsconfig.json`  
**Problema:** Faltam `"strict": true`, `"noImplicitAny": true`, etc. Erros de tipo passam despercebidos.  
**Solução:** Habilitar strict mode e corrigir os erros.

### B4. Dependências não utilizadas
**Arquivo:** `package.json`  
**Problema:** `@google/genai`, `next-themes` (sub-utilizado), `shadcn` (CLI como runtime), `@types/multer` (multer não usado) estão no package.json sem uso real.  
**Solução:** Remover dependências não utilizadas.

### B5. Script `clean` incompatível com Windows
**Arquivo:** `package.json:11`  
**Problema:** `rm -rf dist` falha no Windows PowerShell.  
**Solução:** Usar `rimraf dist` ou `node -e "fs.rmSync('dist',{recursive:true})"`.

### B6. Nome do package é `"react-example"` — não reflete o propósito
**Arquivo:** `package.json:2`  
**Problema:** Nome genérico que não identifica o projeto.  
**Solução:** Renomear para algo como `"conferencia-estoque-bling"`.

### B7. `app/applet/api/[...slug].ts` importa `server.js` (extensão `.js` para arquivo `.ts`)
**Arquivo:** `app/applet/api/[...slug].ts:1`  
**Problema:** Importa `"../server.js"` mas o arquivo real é `server.ts`. Funciona em alguns bundlers mas é inconsistente.  
**Solução:** Usar `"../server.ts"` ou sem extensão.

### B8. Componente `BarcodeScanner` usa `setTimeout(100ms)` frágil para aguardar DOM
**Arquivo:** `src/App.tsx:1246`  
**Problema:** O timeout de 100ms para garantir que o elemento `#reader` exista no DOM é frágil e pode falhar em dispositivos lentos.  
**Solução:** Usar `useEffect` com ref ou `requestAnimationFrame` + MutationObserver.

### B9. Limpeza do scanner no `useEffect` tem lógica complexa e frágil
**Arquivo:** `src/App.tsx:1292-1308`  
**Problema:** A lógica de cleanup lida com estados assíncronos (startPromise, html5QrCode definido em callback). Se o componente desmontar antes do setTimeout(100ms), o código precisa lidar com `html5QrCode` indefinido (já trata, mas frágil).  
**Solução:** Simplificar a lógica, talvez com uma flag `started` adicional.

### B10. A variável `unmounted` é desnecessária dado que o cleanup do `useEffect` sempre executa antes do próximo efeito
**Arquivo:** `src/App.tsx:1241`  
**Problema:** `unmounted` é usada para evitar setState após desmontagem, mas o escopo do efeito já é isolado. O padrão é correto, mas verboso.  
**Solução:** Pode simplificar usando AbortController.

### B11. Refresh token não tem proteção contra race condition
**Arquivo:** `server.ts:136-206`  
**Problema:** Se duas requisições expiradas chegarem simultaneamente, ambas tentarão renovar o token. A segunda renovação pode invalidar a primeira (dependendo do comportamento do Bling).  
**Solução:** Implementar fila de renovação ou lock simples.

### B12. Metadata do AI Studio não inclui permissão de upload de arquivos
**Arquivo:** `metadata.json`  
**Problema:** Só define permissão de câmera, mas o app faz upload de imagens. Se rodar no AI Studio, o upload de arquivos pode ser bloqueado.  
**Solução:** Adicionar `"requestFramePermissions": ["file-upload"]`.

### B13. README.md instrui usar `.env.local` mas o servidor carrega `.env`
**Arquivo:** `README.md:18`  
**Problema:** README diz para configurar `GEMINI_API_KEY` em `.env.local`, mas o servidor usa `dotenv/config` que carrega `.env` por padrão. O `.env.local` não será lido.  
**Solução:** Corrigir README para `.env` ou configurar dotenv para ler `.env.local`.

---

## 📊 RESUMO

| Prioridade | Contagem |
|------------|----------|
| 🔴 Críticos | 6 |
| 🟠 Altos | 7 |
| 🟡 Médios | 10 |
| 🔵 Baixos | 13 |
| **Total** | **36** |

### Checklist rápido agrupado por área:

**Segurança:** C1, C2, C3, C4, C5, A6, B12  
**Backend (server.ts):** C2, C6, M9, M10, B11  
**Frontend (App.tsx):** C5, A1, A2, A3, A4, A5, M3, M4, M5, M6, M7, M8, B8, B9, B10  
**Qualidade de código:** B1, B2, B3, B4, B5, B6, B7, B13  
**Testes:** M1, M2  

### Para começar a corrigir (recomendação de ordem):

1. **C1, C2, C3, C4, C5** — Vulnerabilidades críticas que podem comprometer o sistema
2. **C6, A1, A3, A4** — Bugs que afetam funcionalidades centrais
3. **M1, M2** — Testes quebrados que dão falsa confiança
4. **B1, B2, B3** — Dívida técnica que dificulta manutenção
5. Demais itens conforme disponibilidade
