"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BilibiliApi = void 0;
// src/bilibili-api.ts
const axios_1 = __importDefault(require("axios"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const COOKIE_PATH = path_1.default.resolve(process.cwd(), 'cookie.json');
// WBI签名的mixin-key，这些值可能会随B站更新而改变
// 可通过访问 https://api.bilibili.com/x/web-interface/nav 的wbi_img字段获取最新值
const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
];
class BilibiliApi {
    constructor() {
        this.cookie = '';
        this.csrf = '';
        this.axios = axios_1.default.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com',
            }
        });
    }
    getMixinKey(imgKey, subKey) {
        const s = imgKey + subKey;
        let key = '';
        for (const i of MIXIN_KEY_ENC_TAB) {
            if (s[i]) {
                key += s[i];
            }
        }
        return key.slice(0, 32);
    }
    wbiSign(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const navRes = yield this.axios.get('https://api.bilibili.com/x/web-interface/nav');
            const { img_url, sub_url } = navRes.data.data.wbi_img;
            const imgKey = img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
            const subKey = sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));
            const mixinKey = this.getMixinKey(imgKey, subKey);
            const wts = Math.round(Date.now() / 1000);
            const newParams = Object.assign(Object.assign({}, params), { wts });
            const query = Object.keys(newParams)
                .sort()
                .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(newParams[key])}`)
                .join('&');
            const w_rid = crypto_1.default.createHash('md5').update(query + mixinKey).digest('hex');
            return Object.assign(Object.assign({}, newParams), { w_rid });
        });
    }
    saveCookie(headers) {
        const cookieStr = headers['set-cookie']
            .map((c) => c.split(';')[0])
            .join('; ');
        this.cookie = cookieStr;
        const biliJct = this.cookie.match(/bili_jct=([^;]+)/);
        if (biliJct) {
            this.csrf = biliJct[1];
        }
        fs_1.default.writeFileSync(COOKIE_PATH, JSON.stringify({ cookie: this.cookie, csrf: this.csrf }, null, 2));
        this.axios.defaults.headers.Cookie = this.cookie;
    }
    loadCookie() {
        if (fs_1.default.existsSync(COOKIE_PATH)) {
            const data = JSON.parse(fs_1.default.readFileSync(COOKIE_PATH, 'utf-8'));
            this.cookie = data.cookie;
            this.csrf = data.csrf;
            this.axios.defaults.headers.Cookie = this.cookie;
            return true;
        }
        return false;
    }
    ensureLogin() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.loadCookie()) {
                console.log('检测到已保存的Cookie，正在验证...');
                const res = yield this.axios.get('https://api.bilibili.com/x/web-interface/nav');
                if (res.data.code === 0) {
                    console.log(`登录验证成功！当前用户: ${res.data.data.uname}`);
                    return;
                }
                console.log('Cookie已失效，请重新登录。');
            }
            yield this.loginByQRCode();
        });
    }
    loginByQRCode() {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('正在获取登录二维码...');
            const qrGenRes = yield this.axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
            const { qrcode_key, url } = qrGenRes.data.data;
            console.log('请使用Bilibili手机客户端扫描下方二维码：');
            qrcode_terminal_1.default.generate(url, { small: true });
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                    const pollRes = yield this.axios.get(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`);
                    const data = pollRes.data.data;
                    switch (data.code) {
                        case 0:
                            clearInterval(interval);
                            console.log('登录成功！');
                            this.saveCookie(pollRes.headers);
                            resolve();
                            break;
                        case 86038:
                            clearInterval(interval);
                            console.error('二维码已失效，请重启程序。');
                            reject(new Error('QR code expired'));
                            break;
                        case 86090:
                            console.log('已扫描，等待确认...');
                            break;
                        case 86101:
                            // 等待扫描，不打印信息
                            break;
                        default:
                            console.log(`轮询状态: ${data.message} (${data.code})`);
                    }
                }), 2000);
            });
        });
    }
    getVideoInfo(bvid) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`正在获取视频信息 (BVID: ${bvid})...`);
            const res = yield this.axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
            if (res.data.code !== 0) {
                throw new Error(`获取视频信息失败: ${res.data.message}`);
            }
            const { cid, title } = res.data.data;
            console.log(`视频标题: ${title}, CID: ${cid}`);
            return { cid, title };
        });
    }
    sendDanmaku(text, time, bvid, cid, color // 新增：颜色参数，十进制
    ) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                type: 1,
                mode: 4, // 4=底部弹幕
                fontsize: 25,
                color: color, // 修改：使用传入的颜色参数
                rnd: Math.floor(Date.now() / 1000),
                bvid: bvid,
                oid: cid,
                progress: Math.round(time * 1000),
                msg: text,
                csrf: this.csrf,
            };
            // ... 后续代码保持不变 ...
            const signedParams = yield this.wbiSign(params);
            const formData = new URLSearchParams();
            for (const key in signedParams) {
                formData.append(key, signedParams[key]);
            }
            const res = yield this.axios.post('https://api.bilibili.com/x/v2/dm/post', formData, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            if (res.data.code !== 0) {
                throw new Error(`弹幕发送失败: ${res.data.message} (Code: ${res.data.code})`);
            }
        });
    }
    getDanmakuList(cid) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // ... a lot of code is the same ...
                const url = `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`;
                const response = yield this.axios.get(url, { responseType: 'text' });
                const danmakuList = [];
                const xmlContent = response.data;
                const danmakuRegex = /<d p="([^"]+)">([^<]+)<\/d>/g;
                let match;
                while ((match = danmakuRegex.exec(xmlContent)) !== null) {
                    const attributes = match[1].split(',');
                    const text = match[2];
                    // p属性格式: progress,mode,fontsize,color,...
                    const progress = Math.round(parseFloat(attributes[0]) * 1000);
                    const mode = parseInt(attributes[1], 10);
                    const color = parseInt(attributes[3], 10); // 2. 新增：解析颜色
                    danmakuList.push({ progress, mode, text, color }); // 3. 将颜色加入对象
                }
                return danmakuList;
            }
            catch (error) {
                console.error('获取弹幕列表失败:', error);
                return [];
            }
        });
    }
    getAnonymousDanmakuList(cid) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // ... a lot of code is the same ...
                const anonymousAxios = axios_1.default.create({ /* ... */});
                const url = `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`;
                const response = yield anonymousAxios.get(url, { responseType: 'text' });
                const danmakuList = [];
                const xmlContent = response.data;
                const danmakuRegex = /<d p="([^"]+)">([^<]+)<\/d>/g;
                let match;
                while ((match = danmakuRegex.exec(xmlContent)) !== null) {
                    const attributes = match[1].split(',');
                    const text = match[2];
                    const progress = Math.round(parseFloat(attributes[0]) * 1000);
                    const mode = parseInt(attributes[1], 10);
                    const color = parseInt(attributes[3], 10); // 2. 新增：解析颜色
                    danmakuList.push({ progress, mode, text, color }); // 3. 将颜色加入对象
                }
                return danmakuList;
            }
            catch (error) {
                console.error('获取匿名弹幕列表失败:', error);
                return [];
            }
        });
    }
}
exports.BilibiliApi = BilibiliApi;
