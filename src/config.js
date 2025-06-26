"use strict";
// src/config.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const configPath = path_1.default.resolve(process.cwd(), 'config.json');
function loadConfig() {
    if (!fs_1.default.existsSync(configPath)) {
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
    const config = JSON.parse(fs_1.default.readFileSync(configPath, 'utf-8'));
    if (!config.bvid || !config.lrcPath) {
        console.error('错误：config.json 文件缺少 bvid 或 lrcPath 字段。');
        process.exit(1);
    }
    // 设置默认值
    config.sendInterval = config.sendInterval || 8000;
    config.danmakuColor = config.danmakuColor || '#FFFFFF'; // 设置默认颜色
    return config;
}
