# Task State: Server-Side Tool Details in Agent Output (Option 1)

## Objetivo
Expor detalhes estruturados de pesquisas na web (queries, fontes e citações) e execução de código Python (script e resultado) diretamente no JSON de saída do AI Agent (`grounding` e `codeExecutions`).

## Status do Progresso
- [x] Passo 1: Atualizar `GeminiChatModel.ts` para capturar `groundingMetadata` e `codeExecution` dos candidatos e parts.
- [x] Passo 2: Atualizar `AnthropicChatModel.ts` para capturar tool uses e resultados de `web_search`, `web_fetch` e `code_execution`.
- [x] Passo 3: Atualizar `UniversalChatModelTracing.ts` para extrair e encaminhar `grounding` e `codeExecutions`.
- [x] Passo 4: Atualizar `AgentOutputBridge.ts` para mesclar e anexar `grounding` e `codeExecutions` no JSON final do AI Agent.
- [x] Passo 5: Atualizar `UniversalChatModel.node.ts` adicionando `includeServerToolDetailsInOutput` em `sharedModelOptions` e passando para o tracing.
- [x] Passo 6: Atualizar testes em `tests/universal-chat-model.test.cjs` cobrindo extração, mesclagem e bridge.
- [x] Passo 7: Validação final única com `npm test` e `npm run verify:package`.
