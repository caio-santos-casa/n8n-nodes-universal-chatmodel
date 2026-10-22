import { ChatAnthropic, tools } from '@langchain/anthropic';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
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

      if (Array.isArray((block as any).citations)) {
        for (const citation of (block as any).citations) {
          if (!citation || typeof citation !== 'object') continue;
          addSource(citation.url ?? citation.uri, citation.title);
        }
      }

      const type = (block as any).type;
      const name = (block as any).name;
      const input = (block as any).input;

      if (
        (type === 'tool_use' || type === 'server_tool_use') &&
        typeof name === 'string'
      ) {
        if (name.includes('web_search')) {
          if (typeof input?.query === 'string' && input.query.trim()) {
            queries.add(input.query.trim());
          }
        } else if (name.includes('web_fetch')) {
          if (typeof input?.url === 'string' && input.url.trim()) {
            addSource(input.url.trim(), input.title);
          }
        } else if (name.includes('code_execution')) {
          if (typeof input?.code === 'string') {
            codeExecutions.push({
              language: 'python',
              code: input.code,
            });
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
    const args = tc.args;
    if (typeof name === 'string' && args && typeof args === 'object') {
      if (name.includes('web_search') && typeof args.query === 'string') {
        queries.add(args.query.trim());
      } else if (name.includes('web_fetch') && typeof args.url === 'string') {
        addSource(args.url.trim(), args.title);
      } else if (name.includes('code_execution') && typeof args.code === 'string') {
        codeExecutions.push({
          language: 'python',
          code: args.code,
        });
      }
    }
  }

  // Inspect response_metadata.citations
  const resMeta = message.response_metadata;
  if (resMeta && typeof resMeta === 'object') {
    if (Array.isArray(resMeta.citations)) {
      for (const citation of resMeta.citations) {
        if (!citation || typeof citation !== 'object') continue;
        addSource(citation.url ?? citation.uri, citation.title);
      }
    }
  }

  if (queries.size > 0 || sources.length > 0) {
    const grounding: Record<string, any> = {};
    if (queries.size > 0) grounding.queries = Array.from(queries);
    if (sources.length > 0) grounding.sources = sources;

    message.response_metadata = {
      ...(message.response_metadata ?? {}),
      grounding,
    };
  }

  if (codeExecutions.length > 0) {
    message.response_metadata = {
      ...(message.response_metadata ?? {}),
      codeExecutions,
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
}
