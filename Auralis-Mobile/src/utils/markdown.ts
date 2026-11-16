import { Marked, Renderer } from 'marked'

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const renderer = new Renderer()
renderer.html = ({ text }) => escapeHtml(text)
renderer.link = ({ href, text }) => `<span style="color:#8B9A6E;text-decoration:underline;">${text}</span>`
  + (href ? '' : '')

const markedInstance = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer,
})

function applyZenRichTextStyles(html: string): string {
  return html
    .replaceAll('<h1', '<h1 style="font-size:20px;font-weight:700;color:#1C1C1A;margin:14px 0 8px;line-height:1.35;"')
    .replaceAll('<h2', '<h2 style="font-size:18px;font-weight:700;color:#1C1C1A;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,0.08);line-height:1.35;"')
    .replaceAll('<h3', '<h3 style="font-size:16px;font-weight:700;color:#1C1C1A;margin:12px 0 6px;line-height:1.4;"')
    .replaceAll('<h4', '<h4 style="font-size:15px;font-weight:600;color:#2C2C28;margin:10px 0 6px;line-height:1.4;"')
    .replaceAll('<p>', '<p style="margin:0 0 8px;line-height:1.68;color:#2C2C28;">')
    .replaceAll('<ul>', '<ul style="margin:6px 0 10px;padding-left:18px;color:#2C2C28;">')
    .replaceAll('<ol>', '<ol style="margin:6px 0 10px;padding-left:20px;color:#2C2C28;">')
    .replaceAll('<li>', '<li style="margin:4px 0;line-height:1.62;">')
    .replaceAll('<blockquote>', '<blockquote style="margin:8px 0;padding:6px 12px;border-left:3px solid #8B9A6E;background-color:#F7F2EB;color:#5F5E5C;border-radius:0 8px 8px 0;">')
    .replaceAll('<pre>', '<pre style="margin:8px 0;padding:10px 12px;background-color:#F7F2EB;border:1px solid rgba(0,0,0,0.06);border-radius:10px;overflow-x:auto;font-family:monospace;font-size:13px;line-height:1.55;color:#1C1C1A;">')
    .replaceAll('<code>', '<code style="font-family:monospace;background-color:#F7F2EB;padding:1px 5px;border-radius:4px;font-size:13px;color:#76855B;">')
    .replaceAll('<strong>', '<strong style="font-weight:700;color:#1C1C1A;">')
    .replaceAll('<table>', '<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:13px;">')
    .replaceAll('<th', '<th style="border:1px solid rgba(0,0,0,0.1);padding:6px 8px;background-color:#F7F2EB;text-align:left;font-weight:600;"')
    .replaceAll('<td', '<td style="border:1px solid rgba(0,0,0,0.08);padding:6px 8px;"')
}

export function renderMarkdownHtml(markdownText: string): string {
  if (!markdownText) return ''
  const parsed = markedInstance.parse(markdownText, { async: false }) as string
  const styled = applyZenRichTextStyles(parsed)
  return `<div style="font-size:15px;line-height:1.68;color:#2C2C28;word-break:break-word;">${styled}</div>`
}
