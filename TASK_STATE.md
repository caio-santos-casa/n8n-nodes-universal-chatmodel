# Task State: Native Web Search Support & VM Compatibility

## Objetivo
Implementar suporte nativo a Web Search (Google Search Grounding para Gemini e Anthropic Web Search tool para Claude) e corrigir incompatibilidade de registro de credenciais com o n8n na VM, preparando a branch para Pull Request.

## Status do Progresso
- [x] Passo 1: Criar branch `feat/native-web-search` a partir da `main`.
- [x] Passo 2: Adicionar propriedades de UI para Web Search em `geminiOptions` e `anthropicOptions` em `UniversalChatModel.node.ts`.
- [x] Passo 3: Implementar suporte a Google Search Grounding em `GeminiChatModel.ts`.
- [x] Passo 4: Criar `AnthropicChatModel.ts` com suporte à ferramenta nativa `web_search_20250305`.
- [x] Passo 5: Ajustar resolução de credencial `anthropicApi` (aceitar `url` e `baseUrl`) e remover colisão de registro em `package.json`.
- [x] Passo 6: Adicionar testes unitários para as novas funcionalidades.
- [x] Passo 7: Executar validação final única (`npm test` e `npm run verify:package`).
