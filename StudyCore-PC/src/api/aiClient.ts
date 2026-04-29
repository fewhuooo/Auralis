/**
 * 基于 OpenAI 兼容接口封装的 AI Client (OpenClaw)
 */

import { invoke } from '@tauri-apps/api/core';

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// 由于采用 Tauri Sidecar 深度集成，baseUrl 不再需要用户手动输入，而是由后端分配
let dynamicBaseUrl = '';

export const getAiConfig = async (): Promise<AiConfig> => {
  if (!dynamicBaseUrl) {
    try {
      dynamicBaseUrl = await invoke<string>('get_openclaw_endpoint');
    } catch (e) {
      console.error("Failed to get endpoint from Tauri backend:", e);
      dynamicBaseUrl = 'https://api.openai.com/v1'; // fallback
    }
  }

  return {
    baseUrl: dynamicBaseUrl,
    apiKey: localStorage.getItem('ai_api_key') || '',
    model: localStorage.getItem('ai_model') || 'gpt-4o-mini',
  }
}

export const setAiConfig = (config: Partial<AiConfig>) => {
  if (config.baseUrl) localStorage.setItem('ai_base_url', config.baseUrl);
  if (config.apiKey) localStorage.setItem('ai_api_key', config.apiKey);
  if (config.model) localStorage.setItem('ai_model', config.model);
}

/**
 * 核心：向兼容 OpenAI 的接口发送请求
 */
async function chatCompletion(systemPrompt: string, userMessage: string, requireJson = false) {
  const config = await getAiConfig();
  if (!config.apiKey) {
    throw new Error('请先在设置中配置 API Key');
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

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI 请求失败: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return content;
}

/**
 * 13.1b PDF 碎分化算法
 * @param documentText PDF 提取的前置文本
 */
export async function fragmentPDFToAtomBlocks(documentText: string) {
  const systemPrompt = `你是一个文档切片引擎。请仔细阅读用户提供的长文本，按语义将其切分为多个独立的“知识块 (Atom Blocks)”。
请必须返回严格的 JSON 格式，结构如下：
{
  "blocks": [
    {
      "heading": "知识块标题",
      "preview": "知识块的核心内容摘要（约50字）",
      "tags": ["标签1", "标签2"]
    }
  ],
  "tasks": [
    {
      "title": "根据该文档推测的一条学习或复习任务",
      "load": "medium", 
      "due": "明天"
    }
  ]
}
注意：load 取值只能是 low, medium, high。due 取值可以是 "今天", "明天", "本周五" 等自然语言。`;

  try {
    const res = await chatCompletion(systemPrompt, `文档内容如下：\n${documentText}`, true);
    const parsed = JSON.parse(res);
    return parsed;
  } catch (error) {
    console.error("PDF 碎分化失败:", error);
    throw error;
  }
}

/**
 * 13.1c 语音/文本转任务
 * @param text 语音转写的文本或用户输入的速记
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
    const res = await chatCompletion(systemPrompt, `备忘录内容：\n${text}`, true);
    const parsed = JSON.parse(res);
    return parsed;
  } catch (error) {
    console.error("任务提取失败:", error);
    throw error;
  }
}

/**
 * 13.1a 手写笔记 -> Markdown 结构化
 * @param rawOcrText 模拟从图片 OCR 得到的杂乱文本
 */
export async function convertHandwritingToMarkdown(rawOcrText: string) {
  const systemPrompt = `你是一个笔记整理专家。请将用户提供的凌乱手写/扫描文本，整理成条理清晰的结构化 Markdown，保留重要标题和列表。直接返回 Markdown 文本，不要加多余的废话。`;
  
  try {
    const res = await chatCompletion(systemPrompt, `杂乱文本如下：\n${rawOcrText}`, false);
    return res;
  } catch (error) {
    console.error("Markdown 结构化失败:", error);
    throw error;
  }
}
