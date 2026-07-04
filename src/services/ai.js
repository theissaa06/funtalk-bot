// ============================================================
// src/services/ai.js
// Универсальный ИИ-сервис.
// Поддерживает: OpenAI, Claude (Anthropic), Gemini (Google)
// Провайдер выбирается через AI_PROVIDER в .env
// ============================================================

const fetch = require('node-fetch');
require('dotenv').config();

// Максимальная длина ответа ИИ (в символах)
const MAX_RESPONSE_LENGTH = 2000;

const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'AI_MODEL',
    defaultModel: 'gpt-4o-mini',
  },
  claude: {
    label: 'Claude',
    keyEnv: 'CLAUDE_API_KEY',
    modelEnv: 'CLAUDE_MODEL',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  gemini: {
    label: 'Gemini',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
  },
};

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (value === 'google' || value === 'googleai' || value === 'google-ai') return 'gemini';
  if (value === 'anthropic') return 'claude';
  return value || 'auto';
}

function isRealApiKey(value) {
  if (!value) return false;
  const key = String(value).trim();
  if (!key) return false;
  return !/^(ВАШ_|YOUR_|INSERT_|PASTE_|CHANGE_ME|TODO)/i.test(key);
}

function getAiProviderConfig() {
  function buildConfig(provider) {
    const info = PROVIDERS[provider];
    if (!info) {
      return {
        provider,
        label: provider || 'unknown',
        apiKey: '',
        keyEnv: '',
        model: '',
        configured: false,
        unknown: true,
      };
    }

    const apiKey = process.env[info.keyEnv];
    return {
      provider,
      label: info.label,
      apiKey,
      keyEnv: info.keyEnv,
      model: process.env[info.modelEnv] || info.defaultModel,
      configured: isRealApiKey(apiKey),
    };
  }

  const requested = normalizeProvider(process.env.AI_PROVIDER);
  const explicitProvider = Boolean(process.env.AI_PROVIDER && requested !== 'auto');

  if (explicitProvider) return buildConfig(requested);

  for (const provider of ['gemini', 'openai', 'claude']) {
    const config = buildConfig(provider);
    if (config.configured) return config;
  }

  return buildConfig('gemini');
}

function createAiError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

// Системная инструкция для бота
const SYSTEM_PROMPT = `Ты — дружелюбный Telegram AI-помощник внутри бота FunTalk AI Bot.

Твоя задача — помогать пользователю с общением, знакомствами, мемами, приветствиями, текстами и обычными вопросами.

Отвечай коротко, понятно, дружелюбно и современно.
Можно использовать эмодзи, но не перегружать ими сообщение.
Отвечай на том языке, на котором пишет пользователь.

Строго запрещено:
- помогать со взломом аккаунтов, сайтов, устройств;
- помогать создавать спам или рассылки;
- искать или раскрывать чужие номера телефонов, адреса и личные данные;
- писать угрозы или агрессивные сообщения;
- оскорблять людей или помогать с травлей;
- давать инструкции, опасные для здоровья и жизни;
- нарушать правила Telegram.

Если запрос опасный или нарушает личные границы других людей — откажись и предложи безопасную альтернативу.`;

// Системные добавки для разных режимов
const MODE_PROMPTS = {
  general: '',
  dating: '\n\nСейчас ты работаешь в режиме "Помощник для знакомств". Помогай придумывать первые сообщения, комплименты, вопросы для общения. Будь тёплым, но не навязчивым.',
  meme: '\n\nСейчас ты работаешь в режиме "Мемный помощник". Генерируй смешные фразы, шутки, мемные реакции и прикольные ответы. Юмор должен быть добрым, без оскорблений.',
  explain: '\n\nСейчас ты работаешь в режиме "Объясни простыми словами". Объясняй сложные темы максимально просто, понятно и коротко. Используй аналогии из жизни.',
  text: '\n\nСейчас ты работаешь в режиме "Помощник для текста". Помогай писать сообщения, посты, описания анкет и приветствия. Текст должен быть живым, а не шаблонным.',
};

/**
 * Основная функция отправки запроса к ИИ
 * @param {Array} history - история сообщений [{role, message}]
 * @param {string} userMessage - новое сообщение пользователя
 * @param {string} mode - режим ИИ (general | dating | meme | explain | text)
 * @returns {Promise<string>} - ответ ИИ
 */
async function askAI(history, userMessage, mode = 'general') {
  const providerConfig = getAiProviderConfig();
  const provider = providerConfig.provider;

  if (!PROVIDERS[provider]) {
    throw createAiError('UNKNOWN_AI_PROVIDER', `Неизвестный провайдер ИИ: ${provider}`);
  }

  if (!providerConfig.configured) {
    throw createAiError('NO_API_KEY', `Не найден API-ключ ${providerConfig.keyEnv}`);
  }

  // Формируем системную инструкцию с учётом режима
  const systemPrompt = SYSTEM_PROMPT + (MODE_PROMPTS[mode] || '');

  // Формируем историю сообщений для API
  const safeHistory = Array.isArray(history) ? history : [];
  const messages = safeHistory.map(item => ({
    role: item.role === 'user' ? 'user' : 'assistant',
    content: item.message,
  })).filter(item => item.content);
  messages.push({ role: 'user', content: userMessage });

  try {
    let response;

    if (provider === 'openai') {
      response = await askOpenAI(systemPrompt, messages, providerConfig);
    } else if (provider === 'claude') {
      response = await askClaude(systemPrompt, messages, providerConfig);
    } else if (provider === 'gemini') {
      response = await askGemini(systemPrompt, messages, providerConfig);
    } else {
      throw createAiError('UNKNOWN_AI_PROVIDER', `Неизвестный провайдер ИИ: ${provider}`);
    }

    // Обрезаем ответ если слишком длинный
    if (response && response.length > MAX_RESPONSE_LENGTH) {
      response = response.substring(0, MAX_RESPONSE_LENGTH) + '...';
    }

    return response;
  } catch (error) {
    console.error(`[AI Error] ${error.message}`);
    throw error;
  }
}

// ============================================================
// OpenAI
// ============================================================
async function askOpenAI(systemPrompt, messages, providerConfig) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 800,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'Не удалось получить ответ.';
}

// ============================================================
// Claude (Anthropic)
// ============================================================
async function askClaude(systemPrompt, messages, providerConfig) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': providerConfig.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: providerConfig.model,
      system: systemPrompt,
      messages,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || 'Не удалось получить ответ.';
}

// ============================================================
// Gemini (Google)
// ============================================================
async function askGemini(systemPrompt, messages, providerConfig) {
  // Gemini использует другой формат — конвертируем
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${providerConfig.model}:generateContent?key=${providerConfig.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 800 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || '')
    .join('')
    .trim();

  if (text) return text;
  if (data.promptFeedback?.blockReason) {
    throw createAiError('AI_BLOCKED', `Gemini blocked prompt: ${data.promptFeedback.blockReason}`);
  }

  return 'Не удалось получить ответ.';
}

module.exports = { askAI, getAiProviderConfig, normalizeProvider, isRealApiKey };
