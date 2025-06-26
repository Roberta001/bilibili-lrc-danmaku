// src/lrc-parser.ts
import fs from 'fs';

export interface LrcLine {
  time: number; // 时间，单位：秒
  text: string;
}

// 正则表达式，用于匹配 [mm:ss.xx] 或 [mm:ss:xx] 格式的时间标签
const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/g;

export function parseLrc(lrcPath: string): LrcLine[] {
  if (!fs.existsSync(lrcPath)) {
    console.error(`错误：LRC文件未找到: ${lrcPath}`);
    process.exit(1);
  }

  const lrcContent = fs.readFileSync(lrcPath, 'utf-8');
  const lines = lrcContent.split('\n');
  const result: LrcLine[] = [];

  for (const line of lines) {
    // 忽略没有时间标签的行
    if (!line.includes('[')) continue;

    const text = line.replace(timeRegex, '').trim();
    if (!text) continue; // 忽略空歌词行

    let match;
    // 使用 exec 循环匹配一行中所有的 时间标签
    timeRegex.lastIndex = 0; // 重置正则的 lastIndex
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10); // 处理两位或三位毫秒
      const time = minutes * 60 + seconds + milliseconds / 1000;

      result.push({ time, text });
    }
  }

  // 按时间排序
  return result.sort((a, b) => a.time - b.time);
}