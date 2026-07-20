'use strict';

(function initArchitectAiPolicy(root) {
  const POLICY_VERSION = 1;
  const DEFAULT_TIMEOUT_MS = 60000;
  const MAX_OUTPUT_CHARS = 24000;
  const TASK_MAX_TOKENS = Object.freeze({
    react: 512,
    deeper: 256,
    prompts: 800,
    digest: 1200,
    map: 800,
    analysis: 2000,
    chat: 1200,
    psy: 2400,
    other: 2048,
  });
  const TASKS = Object.freeze(Object.keys(TASK_MAX_TOKENS));

  class AIPolicyError extends Error {
    constructor(code, message, details = null) {
      super(message);
      this.name = 'AIPolicyError';
      this.code = code;
      this.details = details;
      if (code.startsWith('invalid_') || code === 'unsafe_output') this.invalidOutput = true;
      if (code === 'timeout') this.timeout = true;
    }
  }

  const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function policyError(code, message, details) {
    return new AIPolicyError(code, message, details);
  }

  function taskName(value) {
    const task = String(value || 'other');
    if (!TASKS.includes(task)) throw policyError('invalid_request', `Неизвестный тип AI-задачи: ${task}`);
    return task;
  }

  function prepareRequest(input = {}) {
    if (!plainObject(input)) throw policyError('invalid_request', 'AI-запрос должен быть объектом');
    const task = taskName(input.task);
    const cap = TASK_MAX_TOKENS[task];
    const maxTokens = Number(input.maxTokens == null ? 1024 : input.maxTokens);
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > cap) {
      throw policyError('invalid_request', `Недопустимый лимит токенов для ${task}: ${maxTokens}; максимум ${cap}`);
    }
    const system = input.system == null ? '' : String(input.system);
    const user = input.user == null ? '' : String(input.user);
    let messages = null;
    if (input.messages != null) {
      if (!Array.isArray(input.messages) || !input.messages.length) throw policyError('invalid_request', 'messages должен быть непустым массивом');
      messages = input.messages.map((message, index) => {
        if (!plainObject(message)) throw policyError('invalid_request', `messages[${index}] должен быть объектом`);
        const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : '';
        if (!role) throw policyError('invalid_request', `Недопустимая роль messages[${index}]`);
        if (typeof message.content !== 'string' || !message.content.trim()) throw policyError('invalid_request', `Пустой messages[${index}].content`);
        return { role, content: message.content };
      });
    } else if (!user.trim()) {
      throw policyError('invalid_request', 'AI-запрос не содержит пользовательского текста');
    }
    const schema = input.schema == null ? null : input.schema;
    if (schema != null && !plainObject(schema)) throw policyError('invalid_request', 'JSON Schema должна быть объектом');
    return Object.freeze({
      task,
      system,
      user,
      messages,
      maxTokens,
      schema,
      reasoning: input.reasoning == null ? null : !!input.reasoning,
    });
  }

  function schemaFail(path, message) {
    throw policyError('invalid_schema_output', `Некорректный structured output в ${path}: ${message}`, { path, message });
  }

  function validateSchema(value, schema, path = '$') {
    if (!plainObject(schema)) schemaFail(path, 'схема отсутствует');
    if (Array.isArray(schema.anyOf)) {
      const errors = [];
      for (const variant of schema.anyOf) {
        try { validateSchema(value, variant, path); return value; }
        catch (error) { errors.push(error.message); }
      }
      schemaFail(path, 'значение не соответствует ни одному варианту anyOf');
    }
    if (Array.isArray(schema.enum) && !schema.enum.some(item => Object.is(item, value))) {
      schemaFail(path, `значение не входит в enum`);
    }
    const type = schema.type;
    if (type === 'object') {
      if (!plainObject(value)) schemaFail(path, 'ожидался object');
      const properties = plainObject(schema.properties) ? schema.properties : {};
      for (const key of schema.required || []) if (!own(value, key)) schemaFail(`${path}.${key}`, 'обязательное поле отсутствует');
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) if (!own(properties, key)) schemaFail(`${path}.${key}`, 'лишнее поле запрещено');
      }
      for (const [key, child] of Object.entries(properties)) if (own(value, key)) validateSchema(value[key], child, `${path}.${key}`);
    } else if (type === 'array') {
      if (!Array.isArray(value)) schemaFail(path, 'ожидался array');
      if (Number.isInteger(schema.minItems) && value.length < schema.minItems) schemaFail(path, `меньше minItems=${schema.minItems}`);
      if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) schemaFail(path, `больше maxItems=${schema.maxItems}`);
      if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`));
    } else if (type === 'string') {
      if (typeof value !== 'string') schemaFail(path, 'ожидалась string');
      if (Number.isInteger(schema.minLength) && value.length < schema.minLength) schemaFail(path, `короче minLength=${schema.minLength}`);
      if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) schemaFail(path, `длиннее maxLength=${schema.maxLength}`);
    } else if (type === 'integer') {
      if (!Number.isInteger(value)) schemaFail(path, 'ожидался integer');
    } else if (type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) schemaFail(path, 'ожидалось конечное number');
    } else if (type === 'boolean') {
      if (typeof value !== 'boolean') schemaFail(path, 'ожидался boolean');
    } else if (type === 'null') {
      if (value !== null) schemaFail(path, 'ожидался null');
    } else if (type != null) {
      schemaFail(path, `неподдерживаемый тип схемы: ${type}`);
    }
    if (typeof value === 'number') {
      if (typeof schema.minimum === 'number' && value < schema.minimum) schemaFail(path, `меньше minimum=${schema.minimum}`);
      if (typeof schema.maximum === 'number' && value > schema.maximum) schemaFail(path, `больше maximum=${schema.maximum}`);
    }
    return value;
  }

  const UNSAFE_OUTPUT_PATTERNS = Object.freeze([
    /<\s*(script|iframe|object|embed|svg)\b/i,
    /javascript\s*:/i,
    /\bon\w+\s*=/i,
    /\bignore\s+(all\s+)?previous\s+instructions\b/i,
    /\breveal\s+(the\s+)?(system|developer)\s+(prompt|message|instructions)\b/i,
    /игнорируй\s+(все\s+)?предыдущие\s+инструкции/i,
    /покажи\s+(системн(?:ый|ые)\s+(?:промпт|инструкции)|developer message)/i,
    /\bsk-(?:ant|proj|live)-[A-Za-z0-9_-]{12,}\b/,
    /\bAIza[0-9A-Za-z_-]{20,}\b/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}\b/i,
  ]);

  function assertSafeString(value, path) {
    if (value.length > MAX_OUTPUT_CHARS) throw policyError('invalid_output', `AI-ответ слишком длинный в ${path}`);
    const matched = UNSAFE_OUTPUT_PATTERNS.find(pattern => pattern.test(value));
    if (matched) throw policyError('unsafe_output', `AI-ответ отклонён политикой безопасности в ${path}`);
  }

  function assertSafeValue(value, path = '$') {
    if (typeof value === 'string') assertSafeString(value, path);
    else if (Array.isArray(value)) value.forEach((item, index) => assertSafeValue(item, `${path}[${index}]`));
    else if (plainObject(value)) Object.entries(value).forEach(([key, item]) => assertSafeValue(item, `${path}.${key}`));
    return value;
  }

  function validateResponse({ task = 'other', text, schema = null } = {}) {
    taskName(task);
    if (typeof text !== 'string') throw policyError('invalid_output', 'AI-провайдер не вернул текст');
    if (schema) {
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (error) { throw policyError('invalid_json', 'AI вернул повреждённый JSON', { cause: error.message }); }
      validateSchema(parsed, schema);
      assertSafeValue(parsed);
      return JSON.stringify(parsed);
    }
    const clean = text.trim();
    if (!clean) throw policyError('invalid_output', 'AI вернул пустой ответ');
    assertSafeString(clean, '$');
    return clean;
  }

  function timeoutMsFor(task = 'other') {
    taskName(task);
    return DEFAULT_TIMEOUT_MS;
  }

  async function runProvider(factory, { task = 'other', timeoutMs = null } = {}) {
    if (typeof factory !== 'function') throw policyError('invalid_request', 'Не задан provider factory');
    const limit = timeoutMs == null ? timeoutMsFor(task) : Number(timeoutMs);
    if (!Number.isFinite(limit) || limit < 1 || limit > 120000) throw policyError('invalid_request', 'Недопустимый AI timeout');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    try {
      return await factory(controller.signal);
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw policyError('timeout', 'Таймаут запроса к ИИ');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  const api = Object.freeze({
    POLICY_VERSION,
    DEFAULT_TIMEOUT_MS,
    MAX_OUTPUT_CHARS,
    TASKS,
    TASK_MAX_TOKENS,
    AIPolicyError,
    prepareRequest,
    validateSchema,
    validateResponse,
    assertSafeValue,
    timeoutMsFor,
    runProvider,
  });

  Object.defineProperty(root, 'ARCH_AI_POLICY', {
    value: api,
    configurable: false,
    enumerable: true,
    writable: false,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
