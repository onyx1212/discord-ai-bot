const axios = require('axios');
const config = require('../../config');
const { createContextLogger } = require('../../utils/Logger');

const log = createContextLogger('Groq');

class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.displayName = 'Groq';
    this.available = !!config.ai.groq.apiKey;

    this.client = axios.create({
      baseURL: config.ai.groq.baseUrl,
      timeout: config.ai.timeoutMs,
      headers: {
        'Authorization': `Bearer ${config.ai.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async complete(messages, options = {}) {
    if (!this.available) throw new Error('Groq API key not configured');

    const payload = {
      model: options.model || config.ai.groq.model,
      messages,
      max_tokens: Math.min(options.maxTokens || config.ai.maxTokens, 8192),
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
      if (!choice) throw new Error('No choices in Groq response');

      const content = choice.message?.content;
      if (!content) throw new Error('Empty content in Groq response');

      log.debug('Groq request completed', {
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

        log.warn('Groq API error', { status, error: errorData?.error?.message, duration });

        const groqError = new Error(errorData?.error?.message || `Groq returned HTTP ${status}`);
        groqError.status = status;
        groqError.provider = this.name;
        groqError.retryable = [429, 500, 502, 503, 504].includes(status);
        throw groqError;
      }

      if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        const timeoutError = new Error('Groq request timed out');
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

module.exports = GroqProvider;
