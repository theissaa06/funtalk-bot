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
  const provider = process.env.AI_PROVIDER || 'openai';

  // Формируем системную инструкцию с учётом режима
  const systemPrompt = SYSTEM_PROMPT + (MODE_PROMPTS[mode] || '');

  // Формируем историю сообщений для API
  const messages = history.map(item => ({
    role: item.role === 'user' ? 'user' : 'assistant',
    content: item.message,
  }));
  messages.push({ role: 'user', content: userMessage });

  try {
    let response;

    if (provider === 'openai') {
      response = await askOpenAI(systemPrompt, messages);
    } else if (provider === 'claude') {
      response = await askClaude(systemPrompt, messages);
    } else if (provider === 'gemini') {
      response = await askGemini(systemPrompt, messages);
    } else {
      throw new Error(`Неизвестный провайдер ИИ: ${provider}`);
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
async function askOpenAI(systemPrompt, messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'ВАШ_OPENAI_API_KEY') {
    throw new Error('NO_API_KEY');
  }

  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
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
async function askClaude(systemPrompt, messages) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey || apiKey === 'ВАШ_CLAUDE_API_KEY') {
    throw new Error('NO_API_KEY');
  }

  const model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
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
async function askGemini(systemPrompt, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'ВАШ_GEMINI_API_KEY') {
    throw new Error('NO_API_KEY');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  // Gemini использует другой формат — конвертируем
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Не удалось получить ответ.';
}

module.exports = { askAI };
