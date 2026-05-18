const axios = require('axios');
const config = require('../../config');
const { createContextLogger } = require('../../utils/Logger');

const log = createContextLogger('OpenRouter');

class OpenRouterProvider {
  constructor() {
    this.name = 'openrouter';
    this.displayName = 'OpenRouter';
    this.available = !!config.ai.openrouter.apiKey;

    this.client = axios.create({
      baseURL: config.ai.openrouter.baseUrl,
      timeout: config.ai.timeoutMs,
      headers: {
        'Authorization': `Bearer ${config.ai.openrouter.apiKey}`,
        'HTTP-Referer': 'https://github.com/discord-ai-bot',
        'X-Title': 'Discord AI Bot',
        'Content-Type': 'application/json',
      },
    });
  }

  async complete(messages, options = {}) {
    if (!this.available) throw new Error('OpenRouter API key not configured');

    const payload = {
      model: options.model || config.ai.openrouter.model,
      messages,
      max_tokens: options.maxTokens || config.ai.maxTokens,
      temperature: options.temperature ?? config.ai.temperature,
      top_p: options.topP || 0.95,
      stream: false,
    };

    if (options.jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    const start = Date.now();
    try {
      const response = await this.client.post('/chat/completions', payload);
      const duration = Date.now() - start;

      const choice = response.data?.choices?.[0];
      if (!choice) throw new Error('No choices in OpenRouter response');

      const content = choice.message?.content;
      if (!content) throw new Error('Empty content in OpenRouter response');

      log.debug('OpenRouter request completed', {
        model: payload.model,
        duration,
        promptTokens: response.data.usage?.prompt_tokens,
        completionTokens: response.data.usage?.completion_tokens,
      });

      return {
        content,
        provider: this.name,
        model: response.data.model || payload.model,
        usage: response.data.usage || {},
        duration,
        finishReason: choice.finish_reason,
      };
    } catch (err) {
      const duration = Date.now() - start;

      if (err.response) {
        const status = err.response.status;
        const errorData = err.response.data;

        log.warn('OpenRouter API error', { status, error: errorData?.error?.message, duration });

        const openRouterError = new Error(
          errorData?.error?.message || `OpenRouter returned HTTP ${status}`
        );
        openRouterError.status = status;
        openRouterError.provider = this.name;
        openRouterError.retryable = [429, 500, 502, 503, 504].includes(status);
        throw openRouterError;
      }

      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        const timeoutError = new Error('OpenRouter request timed out');
        timeoutError.code = 'TIMEOUT';
        timeoutError.provider = this.name;
        timeoutError.retryable = true;
        throw timeoutError;
      }

      err.provider = this.name;
      err.retryable = false;
      throw err;
    }
  }

  async ping() {
    try {
      await this.client.get('/models', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  isAvailable() {
    return this.available;
  }
}

module.exports = OpenRouterProvider;
