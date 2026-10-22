import { ChatAnthropic, tools } from '@langchain/anthropic';

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
}
