# Task State: Native Server-Side Tools (Gemini & Anthropic)

## Objetivo
Agrupar ferramentas nativas de nuvem em "Server-side Tools" (multiOptions) permitindo ao usuário selecionar quais ativar:
- Gemini: Google Search Grounding (`googleSearch`) e Python Code Execution (`codeExecution`).
- Anthropic: Web Search (`webSearch`), Web Fetch (`webFetch`), Code Execution (`codeExecution`).

## Status do Progresso
- [x] Passo 1: Implementação inicial de Web Search e correção de credencial (branch `feat/native-web-search`).
- [x] Passo 2: Atualizar `geminiOptions` e `anthropicOptions` em `UniversalChatModel.node.ts` com campo `serverSideTools` (multiOptions) e opções detalhadas de configuração.
- [x] Passo 3: Atualizar `GeminiChatModel.ts` para suportar `codeExecution` e `googleSearch`.
- [x] Passo 4: Atualizar `AnthropicChatModel.ts` para suportar `web_search_20250305`, `web_fetch_20250910` e `code_execution_20250825`.
- [x] Passo 5: Atualizar testes unitários em `tests/universal-chat-model.test.cjs` cobrindo o seletor `serverSideTools` e as novas ferramentas.
- [x] Passo 6: Validação final única com `npm test` e `npm run verify:package`.
