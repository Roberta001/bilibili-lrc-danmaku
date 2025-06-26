// src/bilibili-api.ts
import axios, { AxiosInstance } from 'axios';
import qrcode from 'qrcode-terminal';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const COOKIE_PATH = path.resolve(process.cwd(), 'cookie.json');

// WBI签名的mixin-key，这些值可能会随B站更新而改变
// 可通过访问 https://api.bilibili.com/x/web-interface/nav 的wbi_img字段获取最新值
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52
];

// 定义弹幕对象的结构
export interface Danmaku {
  progress: number; // 弹幕出现时间，单位毫秒
  mode: number;     // 弹幕模式
  text: string;     // 弹幕文本
  color: number;    // 新增：弹幕颜色 (十进制)
}

export class BilibiliApi {
  private cookie: string = '';
  private csrf: string = '';
  private axios: AxiosInstance;

  constructor() {
    this.axios = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
      }
    });
  }

  private getMixinKey(imgKey: string, subKey: string): string {
    const s = imgKey + subKey;
    let key = '';
    for (const i of MIXIN_KEY_ENC_TAB) {
      if (s[i]) {
        key += s[i];
      }
    }
    return key.slice(0, 32);
  }

  private async wbiSign(params: Record<string, any>): Promise<Record<string, any>> {
    const navRes = await this.axios.get('https://api.bilibili.com/x/web-interface/nav');
    const { img_url, sub_url } = navRes.data.data.wbi_img;
    const imgKey = img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
    const subKey = sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));
    const mixinKey = this.getMixinKey(imgKey, subKey);

    const wts = Math.round(Date.now() / 1000);
    const newParams: Record<string, any> = { ...params, wts };

    const query = Object.keys(newParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(newParams[key])}`)
      .join('&');

    const w_rid = crypto.createHash('md5').update(query + mixinKey).digest('hex');

    return { ...newParams, w_rid };
  }

  private saveCookie(headers: any) {
    const cookieStr = headers['set-cookie']
      .map((c: string) => c.split(';')[0])
      .join('; ');
    this.cookie = cookieStr;
    const biliJct = this.cookie.match(/bili_jct=([^;]+)/);
    if (biliJct) {
      this.csrf = biliJct[1];
    }
    fs.writeFileSync(COOKIE_PATH, JSON.stringify({ cookie: this.cookie, csrf: this.csrf }, null, 2));
    this.axios.defaults.headers.Cookie = this.cookie;
  }

  private loadCookie(): boolean {
    if (fs.existsSync(COOKIE_PATH)) {
      const data = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
      this.cookie = data.cookie;
      this.csrf = data.csrf;
      this.axios.defaults.headers.Cookie = this.cookie;
      return true;
    }
    return false;
  }

  public async ensureLogin(): Promise<void> {
    if (this.loadCookie()) {
      console.log('检测到已保存的Cookie，正在验证...');
      const res = await this.axios.get('https://api.bilibili.com/x/web-interface/nav');
      if (res.data.code === 0) {
        console.log(`登录验证成功！当前用户: ${res.data.data.uname}`);
        return;
      }
      console.log('Cookie已失效，请重新登录。');
    }

    await this.loginByQRCode();
  }

  private async loginByQRCode(): Promise<void> {
    console.log('正在获取登录二维码...');
    const qrGenRes = await this.axios.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
    const { qrcode_key, url } = qrGenRes.data.data;

    console.log('请使用Bilibili手机客户端扫描下方二维码：');
    qrcode.generate(url, { small: true });

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        const pollRes = await this.axios.get(`https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`);
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
      }, 2000);
    });
  }

  public async getVideoInfo(bvid: string): Promise<{ cid: number, title: string }> {
    console.log(`正在获取视频信息 (BVID: ${bvid})...`);
    const res = await this.axios.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
    if (res.data.code !== 0) {
      throw new Error(`获取视频信息失败: ${res.data.message}`);
    }
    const { cid, title } = res.data.data;
    console.log(`视频标题: ${title}, CID: ${cid}`);
    return { cid, title };
  }

   public async sendDanmaku(
    text: string, 
    time: number, 
    bvid: string, 
    cid: number,
    color: number // 新增：颜色参数，十进制
  ): Promise<void> {
    const params = {
      type: 1,
      mode: 4,      // 4=底部弹幕
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
    const signedParams = await this.wbiSign(params);

    const formData = new URLSearchParams();
    for(const key in signedParams) {
        formData.append(key, signedParams[key]);
    }

    const res = await this.axios.post(
      'https://api.bilibili.com/x/v2/dm/post',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (res.data.code !== 0) {
      throw new Error(`弹幕发送失败: ${res.data.message} (Code: ${res.data.code})`);
    }
  }
  public async getDanmakuList(cid: number): Promise<Danmaku[]> {
    try {
      // ... a lot of code is the same ...
      const url = `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`;
      const response = await this.axios.get(url, { responseType: 'text' });
      const danmakuList: Danmaku[] = [];
      const xmlContent: string = response.data;
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
    } catch (error) {
      console.error('获取弹幕列表失败:', error);
      return [];
    }
  }

  public async getAnonymousDanmakuList(cid: number): Promise<Danmaku[]> {
    try {
        // ... a lot of code is the same ...
        const anonymousAxios = axios.create({ /* ... */ });
        const url = `https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`;
        const response = await anonymousAxios.get(url, { responseType: 'text' });
        const danmakuList: Danmaku[] = [];
        const xmlContent: string = response.data;
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
    } catch (error) {
        console.error('获取匿名弹幕列表失败:', error);
        return [];
    }
  }
}