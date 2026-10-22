import { ChatAnthropic, tools } from '@langchain/anthropic';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';

export interface AnthropicServerToolsOptions {
  enableWebSearch?: boolean;
  webSearchMaxUses?: number;
  webSearchAllowedDomains?: string[];
  webSearchBlockedDomains?: string[];
  // Compatibility aliases
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  enableWebFetch?: boolean;
  webFetchMaxUses?: number;
  enableCodeExecution?: boolean;
}

export type AnthropicWebSearchOptions = AnthropicServerToolsOptions;

function parsePayload(input: unknown): Record<string, any> | undefined {
  if (!input) return undefined;
  if (typeof input === 'object') return input as Record<string, any>;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // String is not valid JSON
    }
  }
  return undefined;
}

export function augmentAnthropicMessage(message: any): void {
  if (!message || typeof message !== 'object') return;

  const queries = new Set<string>();
  const sources: Array<{ title?: string; url?: string }> = [];
  const seenUrls = new Set<string>();
  const codeExecutions: Array<{
    language?: string;
    code?: string;
    outcome?: string;
    output?: string;
  }> = [];

  const addSource = (url?: string, title?: string) => {
    if (!url && !title) return;
    const key = url ?? title ?? '';
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    sources.push({ ...(title ? { title } : {}), ...(url ? { url } : {}) });
  };

  // Inspect content blocks
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (!block || typeof block !== 'object') continue;

      if ((block as any).type === 'text' && (block as any).text === undefined) {
        (block as any).text = '';
      }

      if (Array.isArray((block as any).citations)) {
        for (const citation of (block as any).citations) {
          if (!citation || typeof citation !== 'object') continue;
          addSource(citation.url ?? citation.uri, citation.title ?? citation.document_title);
        }
      }

      const type = (block as any).type;
      const name = (block as any).name;
      const input = (block as any).input;

      if (
        (type === 'tool_use' || type === 'server_tool_use') &&
        typeof name === 'string'
      ) {
        const parsed = parsePayload(input);
        if (name.includes('web_search')) {
          const q = typeof parsed?.query === 'string'
            ? parsed.query
            : typeof input === 'string' && !input.startsWith('{')
              ? input
              : undefined;
          if (q?.trim()) queries.add(q.trim());
          if (Array.isArray(parsed?.queries)) {
            for (const item of parsed.queries) {
              if (typeof item === 'string' && item.trim()) queries.add(item.trim());
            }
          }
        } else if (name.includes('web_fetch')) {
          const u = typeof parsed?.url === 'string' ? parsed.url.trim() : undefined;
          const t = typeof parsed?.title === 'string' ? parsed.title.trim() : undefined;
          if (u || t) addSource(u, t);
        } else if (name.includes('code_execution')) {
          const code = typeof parsed?.code === 'string'
            ? parsed.code
            : typeof input === 'string' && !input.startsWith('{')
              ? input
              : undefined;
          if (code) {
            codeExecutions.push({
              language: parsed?.language ?? 'python',
              code,
            });
          }
        }
      }

      if (type === 'web_search_tool_result') {
        let items = (block as any).content;
        if (typeof items === 'string') {
          try {
            items = JSON.parse(items);
          } catch {}
        }
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item && typeof item === 'object') {
              addSource(item.url ?? item.uri, item.title ?? item.name);
            }
          }
        }
      }
    }
  }

  // Inspect tool_calls
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== 'object') continue;
    const name = tc.name;
    const args = parsePayload(tc.args) ?? tc.args;
    if (typeof name === 'string' && args && typeof args === 'object') {
      if (name.includes('web_search')) {
        if (typeof args.query === 'string' && args.query.trim()) {
          queries.add(args.query.trim());
        }
        if (Array.isArray(args.queries)) {
          for (const item of args.queries) {
            if (typeof item === 'string' && item.trim()) queries.add(item.trim());
          }
        }
      } else if (name.includes('web_fetch') && typeof args.url === 'string') {
        addSource(args.url.trim(), args.title);
      } else if (name.includes('code_execution') && typeof args.code === 'string') {
        codeExecutions.push({
          language: args.language ?? 'python',
          code: args.code,
        });
      }
    }
  }

  // Inspect response_metadata.citations
  const resMeta = message.response_metadata;
  if (resMeta && typeof resMeta === 'object' && Array.isArray(resMeta.citations)) {
    for (const citation of resMeta.citations) {
      if (!citation || typeof citation !== 'object') continue;
      addSource(citation.url ?? citation.uri, citation.title ?? citation.document_title);
    }
  }

  const addKwargs = message.additional_kwargs;
  if (addKwargs && typeof addKwargs === 'object' && Array.isArray(addKwargs.citations)) {
    for (const citation of addKwargs.citations) {
      if (!citation || typeof citation !== 'object') continue;
      addSource(citation.url ?? citation.uri, citation.title ?? citation.document_title);
    }
  }

  if (queries.size > 0 || sources.length > 0) {
    const existingGrounding = message.response_metadata?.grounding ?? {};
    const existingQueries = Array.isArray(existingGrounding.queries) ? existingGrounding.queries : [];
    const mergedQueries = [...new Set([...existingQueries, ...queries])];

    const existingSources = Array.isArray(existingGrounding.sources) ? existingGrounding.sources : [];
    const mergedSources = [...existingSources];
    for (const src of sources) {
      const key = src.url ?? src.title ?? '';
      if (!mergedSources.some((s: any) => (s.url ?? s.title ?? '') === key)) {
        mergedSources.push(src);
      }
    }

    message.response_metadata = {
      ...(message.response_metadata ?? {}),
      grounding: {
        ...(mergedQueries.length > 0 ? { queries: mergedQueries } : {}),
        ...(mergedSources.length > 0 ? { sources: mergedSources } : {}),
      },
    };
  }

  if (codeExecutions.length > 0) {
    const existingCodeExecutions = Array.isArray(message.response_metadata?.codeExecutions)
      ? message.response_metadata.codeExecutions
      : [];
    message.response_metadata = {
      ...(message.response_metadata ?? {}),
      codeExecutions: [...existingCodeExecutions, ...codeExecutions],
    };
  }
}

export class AnthropicChatModel extends ChatAnthropic {
  readonly serverToolsOptions?: AnthropicServerToolsOptions;

  constructor(fields: any, serverToolsOptions?: AnthropicServerToolsOptions) {
    super(fields);
    this.serverToolsOptions = serverToolsOptions;
  }

  // Backward compatibility getter
  get webSearchOptions(): AnthropicServerToolsOptions | undefined {
    if (!this.serverToolsOptions) return undefined;
    return {
      ...this.serverToolsOptions,
      maxUses: this.serverToolsOptions.webSearchMaxUses ?? this.serverToolsOptions.maxUses,
      allowedDomains: this.serverToolsOptions.webSearchAllowedDomains ?? this.serverToolsOptions.allowedDomains,
      blockedDomains: this.serverToolsOptions.webSearchBlockedDomains ?? this.serverToolsOptions.blockedDomains,
    };
  }

  override invocationParams(options?: any): any {
    const params = super.invocationParams(options);
    if (!this.serverToolsOptions) return params;

    params.tools = Array.isArray(params.tools) ? [...params.tools] : [];

    // 1. Web Search
    if (this.serverToolsOptions.enableWebSearch) {
      const hasWebSearch = params.tools.some(
        (t: any) => t && (t.type === 'web_search_20250305' || t.name === 'web_search'),
      );
      if (!hasWebSearch) {
        const maxUses = this.serverToolsOptions.webSearchMaxUses ?? this.serverToolsOptions.maxUses;
        const allowedDomains = this.serverToolsOptions.webSearchAllowedDomains ?? this.serverToolsOptions.allowedDomains;
        const blockedDomains = this.serverToolsOptions.webSearchBlockedDomains ?? this.serverToolsOptions.blockedDomains;

        if (typeof tools?.webSearch_20250305 === 'function') {
          params.tools.push(
            tools.webSearch_20250305({
              maxUses,
              allowedDomains,
              blockedDomains,
            }) as any,
          );
        } else {
          params.tools.push({
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: maxUses,
            allowed_domains: allowedDomains,
            blocked_domains: blockedDomains,
          } as any);
        }
      }
    }

    // 2. Web Fetch
    if (this.serverToolsOptions.enableWebFetch) {
      const hasWebFetch = params.tools.some(
        (t: any) => t && (t.type === 'web_fetch_20250910' || t.name === 'web_fetch'),
      );
      if (!hasWebFetch) {
        if (typeof tools?.webFetch_20250910 === 'function') {
          params.tools.push(
            tools.webFetch_20250910({
              maxUses: this.serverToolsOptions.webFetchMaxUses,
            }) as any,
          );
        } else {
          params.tools.push({
            type: 'web_fetch_20250910',
            name: 'web_fetch',
            max_uses: this.serverToolsOptions.webFetchMaxUses,
          } as any);
        }
      }
    }

    // 3. Code Execution
    if (this.serverToolsOptions.enableCodeExecution) {
      const hasCodeExecution = params.tools.some(
        (t: any) => t && (t.type === 'code_execution_20250825' || t.name === 'code_execution'),
      );
      if (!hasCodeExecution) {
        if (typeof tools?.codeExecution_20250825 === 'function') {
          params.tools.push(tools.codeExecution_20250825() as any);
        } else {
          params.tools.push({
            type: 'code_execution_20250825',
            name: 'code_execution',
          } as any);
        }
      }
    }

    return params;
  }

  override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const result = await super._generate(messages, options, runManager);
    for (const generation of result.generations) {
      if (generation.message) {
        augmentAnthropicMessage(generation.message);
      }
    }
    return result;
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: any,
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const accumulatedSources: Array<{ title?: string; url?: string }> = [];
    const accumulatedQueries = new Set<string>();
    const accumulatedCodeExecutions: Array<{ language?: string; code?: string }> = [];
    const seenUrls = new Set<string>();
    const blockByIndex = new Map<number, { type?: string; name?: string; input?: string }>();

    const addSource = (url?: string, title?: string) => {
      if (!url && !title) return;
      const key = url ?? title ?? '';
      if (seenUrls.has(key)) return;
      seenUrls.add(key);
      accumulatedSources.push({ ...(title ? { title } : {}), ...(url ? { url } : {}) });
    };

    let lastChunk: ChatGenerationChunk | undefined;

    for await (const chunk of super._streamResponseChunks(messages, options ?? ({} as any), runManager)) {
      lastChunk = chunk;

      if (Array.isArray(chunk.message?.content)) {
        for (const block of chunk.message.content) {
          if (!block || typeof block !== 'object') continue;

          // Prevent "undefined" token leakage when @langchain/anthropic emits
          // citation blocks as type: 'text' without a 'text' property.
          if ((block as any).type === 'text' && (block as any).text === undefined) {
            (block as any).text = '';
          }

          if (Array.isArray((block as any).citations)) {
            for (const citation of (block as any).citations) {
              if (citation && typeof citation === 'object') {
                addSource(citation.url ?? citation.uri, citation.title ?? citation.document_title);
              }
            }
          }

          if ((block as any).type === 'web_search_tool_result') {
            let items = (block as any).content;
            if (typeof items === 'string') {
              try {
                items = JSON.parse(items);
              } catch {}
            }
            if (Array.isArray(items)) {
              for (const item of items) {
                if (item && typeof item === 'object') {
                  addSource(item.url ?? item.uri, item.title ?? item.name);
                }
              }
            }
          }

          const index = typeof (block as any).index === 'number' ? (block as any).index : undefined;
          let type = (block as any).type;
          let name = (block as any).name;
          let input = (block as any).input;

          if (index !== undefined) {
            const recorded = blockByIndex.get(index) ?? {};
            if (type && !type.includes('delta')) recorded.type = type;
            if (name) recorded.name = name;
            if (typeof input === 'string') {
              recorded.input = (recorded.input ?? '') + input;
            } else if (input && typeof input === 'object') {
              recorded.input = JSON.stringify(input);
            }
            blockByIndex.set(index, recorded);

            type = recorded.type ?? type;
            name = recorded.name ?? name;
            input = recorded.input ?? input;
          }

          if ((type === 'tool_use' || type === 'server_tool_use') && typeof name === 'string') {
            const parsed = parsePayload(input);
            if (name.includes('web_search')) {
              const q = typeof parsed?.query === 'string'
                ? parsed.query
                : typeof input === 'string' && !input.startsWith('{')
                  ? input
                  : undefined;
              if (q?.trim()) accumulatedQueries.add(q.trim());
              if (Array.isArray(parsed?.queries)) {
                for (const item of parsed.queries) {
                  if (typeof item === 'string' && item.trim()) accumulatedQueries.add(item.trim());
                }
              }
            } else if (name.includes('web_fetch')) {
              const u = typeof parsed?.url === 'string' ? parsed.url.trim() : undefined;
              const t = typeof parsed?.title === 'string' ? parsed.title.trim() : undefined;
              if (u || t) addSource(u, t);
            } else if (name.includes('code_execution')) {
              const code = typeof parsed?.code === 'string'
                ? parsed.code
                : typeof input === 'string' && !input.startsWith('{')
                  ? input
                  : undefined;
              if (code && !accumulatedCodeExecutions.some((c) => c.code === code)) {
                accumulatedCodeExecutions.push({
                  language: parsed?.language ?? 'python',
                  code,
                });
              }
            }
          }
        }
      }

      const msg = chunk.message as any;
      if (Array.isArray(msg?.tool_call_chunks)) {
        for (const tc of msg.tool_call_chunks) {
          if (tc && typeof tc.name === 'string' && tc.name.includes('web_search')) {
            const parsed = parsePayload(tc.args);
            if (typeof parsed?.query === 'string' && parsed.query.trim()) {
              accumulatedQueries.add(parsed.query.trim());
            }
          }
        }
      }

      if (accumulatedQueries.size > 0 || accumulatedSources.length > 0) {
        const grounding: Record<string, any> = {};
        if (accumulatedQueries.size > 0) grounding.queries = Array.from(accumulatedQueries);
        if (accumulatedSources.length > 0) grounding.sources = structuredClone(accumulatedSources);
        if (msg) {
          msg.response_metadata = {
            ...(msg.response_metadata ?? {}),
            grounding,
          };
        }
      }

      if (accumulatedCodeExecutions.length > 0 && msg) {
        msg.response_metadata = {
          ...(msg.response_metadata ?? {}),
          codeExecutions: structuredClone(accumulatedCodeExecutions),
        };
      }

      yield chunk;
    }

    if (lastChunk?.message) {
      augmentAnthropicMessage(lastChunk.message);
    }
  }
}
