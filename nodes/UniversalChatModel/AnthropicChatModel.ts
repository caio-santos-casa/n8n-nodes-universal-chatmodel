import { ChatAnthropic, tools } from '@langchain/anthropic';

export interface AnthropicWebSearchOptions {
  enableWebSearch?: boolean;
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
}

export class AnthropicChatModel extends ChatAnthropic {
  readonly webSearchOptions?: AnthropicWebSearchOptions;

  constructor(fields: any, webSearchOptions?: AnthropicWebSearchOptions) {
    super(fields);
    this.webSearchOptions = webSearchOptions;
  }

  override invocationParams(options?: any): any {
    const params = super.invocationParams(options);
    if (this.webSearchOptions?.enableWebSearch) {
      params.tools = Array.isArray(params.tools) ? [...params.tools] : [];
      const hasWebSearch = params.tools.some(
        (t: any) => t && (t.type === 'web_search_20250305' || t.name === 'web_search'),
      );
      if (!hasWebSearch) {
        if (typeof tools?.webSearch_20250305 === 'function') {
          params.tools.push(
            tools.webSearch_20250305({
              maxUses: this.webSearchOptions.maxUses,
              allowedDomains: this.webSearchOptions.allowedDomains,
              blockedDomains: this.webSearchOptions.blockedDomains,
            }) as any,
          );
        } else {
          // Fallback if tools helper is not available
          params.tools.push({
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: this.webSearchOptions.maxUses,
            allowed_domains: this.webSearchOptions.allowedDomains,
            blocked_domains: this.webSearchOptions.blockedDomains,
          } as any);
        }
      }
    }
    return params;
  }
}
