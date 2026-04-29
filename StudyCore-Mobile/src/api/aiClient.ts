/**
 * 基于 OpenAI 兼容接口封装的 AI Client (Mobile)
 */

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const getAiConfig = (): AiConfig => {
  return {
    baseUrl: uni.getStorageSync('ai_base_url') || 'https://api.openai.com/v1',
    apiKey: uni.getStorageSync('ai_api_key') || '',
    model: uni.getStorageSync('ai_model') || 'gpt-4o-mini',
  }
}

export const setAiConfig = (config: Partial<AiConfig>) => {
  if (config.baseUrl) uni.setStorageSync('ai_base_url', config.baseUrl);
  if (config.apiKey) uni.setStorageSync('ai_api_key', config.apiKey);
  if (config.model) uni.setStorageSync('ai_model', config.model);
}

/**
 * 核心：向兼容 OpenAI 的接口发送请求 (使用 uni.request)
 */
function chatCompletion(systemPrompt: string, userMessage: string, requireJson = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const config = getAiConfig();
    if (!config.apiKey) {
      return reject(new Error('请先在设置中配置 API Key'));
    }

    const cleanBaseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
    const endpoint = `${cleanBaseUrl}/chat/completions`;
    const body: any = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3
    };

    if (requireJson) {
      body.response_format = { type: 'json_object' };
    }

    uni.request({
      url: endpoint,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      data: body,
      success: (res: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const content = res.data.choices[0].message.content;
          resolve(content);
        } else {
          reject(new Error(`AI 请求失败: ${res.statusCode} - ${JSON.stringify(res.data)}`));
        }
      },
      fail: (err) => {
        reject(new Error(`网络请求失败: ${err.errMsg}`));
      }
    });
  });
}

/**
 * 13.1c 语音/文本转任务
 */
export async function transcribeAndExtractTasks(text: string) {
  const systemPrompt = `你是一个任务分析助手。请从用户输入的口语化备忘录中提取出具体的“待办任务”。
请必须返回严格的 JSON 格式，结构如下：
{
  "tasks": [
    {
      "title": "具体的行动事项",
      "load": "low" | "medium" | "high",
      "due": "推测的截止时间"
    }
  ],
  "summary": "这段备忘录的一句话总结"
}`;

  try {
    const res = await chatCompletion(systemPrompt, `备忘录内容：\\n${text}`, true);
    const parsed = JSON.parse(res);
    return parsed;
  } catch (error) {
    console.error("任务提取失败:", error);
    throw error;
  }
}

/**
 * 13.1a 手写笔记 -> Markdown 结构化
 */
export async function convertHandwritingToMarkdown(rawOcrText: string) {
  const systemPrompt = `你是一个笔记整理专家。请将用户提供的凌乱手写/扫描文本，整理成条理清晰的结构化 Markdown，保留重要标题和列表。直接返回 Markdown 文本，不要加多余的废话。`;
  
  try {
    const res = await chatCompletion(systemPrompt, `杂乱文本如下：\\n${rawOcrText}`, false);
    return res;
  } catch (error) {
    console.error("Markdown 结构化失败:", error);
    throw error;
  }
}
