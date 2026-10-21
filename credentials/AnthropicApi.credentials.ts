import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AnthropicApi implements ICredentialType {
  name = 'anthropicApi';
  displayName = 'Anthropic API';
  documentationUrl = 'https://docs.anthropic.com/';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'Anthropic API key from console.anthropic.com',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      placeholder: 'https://api.anthropic.com',
      description: 'Custom base URL for Anthropic proxy or gateway (defaults to https://api.anthropic.com)',
    },
  ];
}
