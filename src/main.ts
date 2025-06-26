// src/main.ts
import { loadConfig } from './config';
import { parseLrc, LrcLine } from './lrc-parser';
import { BilibiliApi, Danmaku } from './bilibili-api';

/**
 * 暂停执行指定的毫秒数。
 * @param ms - 等待的毫秒数。
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检查一条LRC歌词是否已经作为底部弹幕存在于弹幕列表中，
 * 且内容、时间、颜色均匹配。
 * @param lyric - 要检查的LRC歌词行。
 * @param danmakuList - 已有的弹幕列表。
 * @param targetColor - 目标弹幕颜色 (十进制)。
 * @returns 如果存在则返回 true，否则返回 false。
 */
function isLyricExist(lyric: LrcLine, danmakuList: Danmaku[], targetColor: number): boolean {
  const lyricTimeMs = Math.round(lyric.time * 1000);
  const timeTolerance = 500; // 允许0.5秒的时间误差，以兼容服务器记录偏差

  return danmakuList.some(danmaku => 
    danmaku.mode === 4 && // 仅比对底部弹幕 (mode: 4)
    danmaku.text === lyric.text &&
    danmaku.color === targetColor && // 颜色必须匹配
    Math.abs(danmaku.progress - lyricTimeMs) < timeTolerance
  );
}

/**
 * 将十六进制颜色字符串转换为B站API接受的十进制整数。
 * @param hexColor - 十六进制颜色字符串 (例如, "#FFFFFF")。
 * @returns 颜色的十进制表示。
 */
function parseColorToDecimal(hexColor: string): number {
  const hex = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    console.warn(`警告：无效的颜色格式 "${hexColor}"。将使用默认颜色白色。`);
    return 16777215; // 白色 (FFFFFF) 的十进制
  }
  return parseInt(hex, 16);
}

/**
 * 程序主函数
 */
async function main() {
  console.log('--- Bilibili LRC字幕弹幕发送程序 (v3.1 颜色精准匹配版) ---');

  // 1. 加载配置
  const config = loadConfig();
  console.log('配置加载成功！');
  console.log(`  - 视频BVID: ${config.bvid}`);
  console.log(`  - LRC路径: ${config.lrcPath}`);
  console.log(`  - 发送间隔: ${config.sendInterval / 1000}秒`);
  const danmakuColorDecimal = parseColorToDecimal(config.danmakuColor!);
  console.log(`  - 弹幕颜色: ${config.danmakuColor} (十进制: ${danmakuColorDecimal})`);

  // 2. 解析LRC文件
  const allLyrics = parseLrc(config.lrcPath);
  if (allLyrics.length === 0) {
    console.log('LRC文件中没有解析到任何歌词，程序退出。');
    return;
  }
  console.log(`LRC文件解析成功，共 ${allLyrics.length} 条目标歌词。`);

  // 3. 登录并初始化API
  const biliApi = new BilibiliApi();
  await biliApi.ensureLogin();

  // 4. 获取视频信息 (CID)
  const { cid } = await biliApi.getVideoInfo(config.bvid);

  // 5. 获取公共弹幕列表作为操作基准
  console.log('\n--- 步骤1: 获取公共弹幕列表作为基准 ---');
  console.log('正在以游客视角获取弹幕列表，以确保操作基于公开可见的内容...');
  const existingDanmaku = await biliApi.getAnonymousDanmakuList(cid);
  console.log(`获取到 ${existingDanmaku.length} 条公共可见弹幕。`);
  
  const lyricsToSend = allLyrics.filter(
    lyric => !isLyricExist(lyric, existingDanmaku, danmakuColorDecimal)
  );
  
  if (lyricsToSend.length === 0) {
    console.log('所有LRC歌词均已按指定颜色在公共弹幕池中存在，无需发送。程序退出。');
    return;
  }
  console.log(`比对完成！需要发送 ${lyricsToSend.length} 条新字幕以达到配置要求。`);

  // 6. 循环发送缺失的弹幕
  console.log('\n--- 步骤2: 开始发送新字幕 ---');
  for (let i = 0; i < lyricsToSend.length; i++) {
    const lyric = lyricsToSend[i];
    const progress = `(${(i + 1).toString().padStart(lyricsToSend.length.toString().length, ' ')}/${lyricsToSend.length})`;
    const minutes = Math.floor(lyric.time / 60).toString().padStart(2, '0');
    const seconds = (lyric.time % 60).toFixed(3).padStart(6, '0');
    const timeStr = `[${minutes}:${seconds}]`;

    console.log(`${progress} ${timeStr} 准备发送: ${lyric.text}`);
    
    try {
      await biliApi.sendDanmaku(lyric.text, lyric.time, config.bvid, cid, danmakuColorDecimal);
      console.log(`  -> 发送请求成功！`);
    } catch (error: any) {
      console.error(`  -> 发送请求失败: ${error.message}`);
    }
    
    if (i < lyricsToSend.length - 1) {
      console.log(`  ...等待 ${config.sendInterval / 1000} 秒...`);
      await sleep(config.sendInterval);
    }
  }
  
  // 7. 进行最终双重校验
  console.log('\n--- 步骤3: 进行双重校验 ---');
  console.log('所有字幕发送任务已执行。等待50秒让服务器数据充分同步...');
  await sleep(50000); // 等待服务器缓存刷新

  console.log('正在获取用户视角弹幕列表...');
  const finalUserDanmaku = await biliApi.getDanmakuList(cid);
  console.log(`用户视角下有 ${finalUserDanmaku.length} 条弹幕。`);

  console.log('正在获取公共视角弹幕列表 (匿名)...');
  const finalPublicDanmaku = await biliApi.getAnonymousDanmakuList(cid);
  console.log(`公共视角下有 ${finalPublicDanmaku.length} 条弹幕。`);
  
  const successfulSends: LrcLine[] = [];
  const shadowBanned: LrcLine[] = [];
  const failedSends: LrcLine[] = [];

  for (const lyric of lyricsToSend) {
    const existsInUserList = isLyricExist(lyric, finalUserDanmaku, danmakuColorDecimal);
    const existsInPublicList = isLyricExist(lyric, finalPublicDanmaku, danmakuColorDecimal);

    if (existsInUserList && existsInPublicList) {
      successfulSends.push(lyric);
    } else if (existsInUserList && !existsInPublicList) {
      shadowBanned.push(lyric);
    } else {
      failedSends.push(lyric);
    }
  }

  // 8. 打印最终报告
  console.log('\n========== 最终双重校验报告 ==========');
  console.log(`任务目标: ${lyricsToSend.length} 条`);
  console.log(`✅ 真正成功 (公开可见): ${successfulSends.length} 条`);
  console.log(`⚠️ 被风控/Shadow Banned (仅自己可见): ${shadowBanned.length} 条`);
  console.log(`❌ 发送失败 (完全不可见): ${failedSends.length} 条`);

  if (shadowBanned.length > 0) {
    console.log('\n--- 以下字幕被风控 (Shadow Banned) ---');
    shadowBanned.forEach(lyric => {
      console.log(`  - [${lyric.time.toFixed(2)}s] ${lyric.text}`);
    });
  }

  if (failedSends.length > 0) {
    console.log('\n--- 以下字幕发送失败 ---');
    failedSends.forEach(lyric => {
      console.log(`  - [${lyric.time.toFixed(2)}s] ${lyric.text}`);
    });
  }
  
  console.log('\n====================================');
  console.log('程序执行完毕。');
}

main().catch(error => {
  console.error('\n程序出现未处理的异常: ', error.message);
  process.exit(1);
});