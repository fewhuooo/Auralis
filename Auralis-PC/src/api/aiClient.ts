import request from './request';

export const checkHealth = async (): Promise<boolean> => {
  try {
    const res: any = await request.get('/actuator/health');
    // 如果没有抛异常则认为健康（具体看后端的 actuator/health 返回）
    return !!res;
  } catch (e) {
    console.error("Backend health check failed:", e);
    return false;
  }
}

export async function chatCompletion(systemPrompt: string, userMessage: string, requireJson = false) {
  try {
    const res: any = await request.post('/api/ai/chat', { systemPrompt, message: userMessage, requireJson });
    return res;
  } catch (error) {
    console.error("AI 请求失败:", error);
    throw error;
  }
}

export async function fragmentPDFToAtomBlocks(documentText: string) {
  try {
    const res: any = await request.post('/api/ai/ingest', { content: documentText });
    return res;
  } catch (error) {
    console.error("PDF 碎分化失败:", error);
    throw error;
  }
}

export async function transcribeAndExtractTasks(text: string) {
  try {
    const res: any = await request.post('/api/ai/extract-tasks', { text });
    return res;
  } catch (error) {
    console.error("任务提取失败:", error);
    throw error;
  }
}

export async function convertHandwritingToMarkdown(rawOcrText: string) {
  try {
    const res: any = await request.post('/api/ai/convert-handwriting', { text: rawOcrText });
    return res;
  } catch (error) {
    console.error("Markdown 结构化失败:", error);
    throw error;
  }
}

export async function scheduleSuggest(text: string) {
  try {
    const res: any = await request.post('/api/ai/schedule-suggest', { text });
    return res;
  } catch (error) {
    console.error("AI 日程建议失败:", error);
    throw error;
  }
}

export async function ingestFile(file: File, subject: string = '文档导入') {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subject', subject);
    const res: any = await request.post('/api/ai/ingest/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res;
  } catch (error) {
    console.error("文件入库失败:", error);
    throw error;
  }
}
