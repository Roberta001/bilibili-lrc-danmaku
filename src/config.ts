// src/config.ts

import fs from 'fs';
import path from 'path';

export interface AppConfig {
  bvid: string;
  lrcPath: string;
  sendInterval: number;
  danmakuColor?: string; // 新增：弹幕颜色，十六进制字符串
}

const configPath = path.resolve(process.cwd(), 'config.json');

export function loadConfig(): AppConfig {
  if (!fs.existsSync(configPath)) {
    console.error('错误：根目录下未找到 config.json 文件！');
    console.log('请创建一个 config.json 文件，并填入以下内容：');
    // 更新示例JSON
    console.log(JSON.stringify({
      bvid: "请替换为视频的BV号",
      lrcPath: "./lyrics.lrc",
      sendInterval: 8000,
      danmakuColor: "#FFFFFF" // 新增示例字段 (白色)
    }, null, 2));
    process.exit(1);
  }

  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (!config.bvid || !config.lrcPath) {
    console.error('错误：config.json 文件缺少 bvid 或 lrcPath 字段。');
    process.exit(1);
  }

  // 设置默认值
  config.sendInterval = config.sendInterval || 8000;
  config.danmakuColor = config.danmakuColor || '#FFFFFF'; // 设置默认颜色

  return config;
}