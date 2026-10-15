import fs from 'fs';
import path from 'path';

/**
 * 彩蛋定義介面
 */
export interface EasterEgg {
    /** 彩蛋唯一識別碼 */
    id: string;
    /** 彩蛋名稱說明 */
    name: string;
    /** 觸發關鍵字列表（支援字串或正規表達式，比對時會自動忽略空白） */
    keywords: (string | RegExp)[];
    /** 音樂網址（支援 YouTube 連結等） */
    songUrl: string;
    /** 觸發時在文字頻道回覆的專屬迷因台詞 */
    replyMessage: string;
    /** 觸發訊息要新增的 Emoji 反應（選填） */
    reactionEmoji?: string;
    /** 伺服器冷卻時間（秒），預設為 60 秒 */
    cooldownSeconds?: number;
}

const DEFAULT_EASTER_EGGS: EasterEgg[] = [
    {
        id: 'purple_yu_ai',
        name: '五條悟 虛式「茈」× 楊丞琳《雨愛》',
        keywords: [
            '茈發動前的41秒',
            '茈發動前的 41 秒內',
            '茈發動前41秒',
            '茈發動前 41 秒'
        ],
        songUrl: 'https://youtu.be/oec9R5ypf-o?si=5qhU2Ss_kUxMY7uP',
        replyMessage: '🟣 **「九綱、偏頗、烏與聲明、表裏之間... 虛式「茈」！」**\n🎵 已將 **楊丞琳 Rainie Yang - 雨愛** 自動插入為下一首播放！',
        reactionEmoji: '🟣',
        cooldownSeconds: 60
    }
];

const TRIGGERS_PATH = path.join(process.cwd(), 'triggers.json');

/** 當前載入的所有彩蛋 */
export let easterEggs: EasterEgg[] = [...DEFAULT_EASTER_EGGS];

// 記錄各伺服器各彩蛋的上次觸發時間：Map<`guildId:eggId`, timestamp>
const cooldownMap = new Map<string, number>();

function parseJsonLenient(raw: string): any {
    try {
        return JSON.parse(raw);
    } catch {
        // 自動修復 JSON 字串中直接按 Enter 的未跳脫換行符號
        let inString = false;
        let escaped = false;
        let fixed = '';
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            if (ch === '"' && !escaped) {
                inString = !inString;
                fixed += ch;
            } else if (inString && ch === '\n') {
                fixed += '\\n';
            } else if (inString && ch === '\r') {
                // 忽略 carriage return
            } else {
                fixed += ch;
            }
            escaped = (ch === '\\' && !escaped);
        }
        return JSON.parse(fixed);
    }
}

function extractFirstEmoji(str?: string): string | undefined {
    if (!str) return undefined;
    const trimmed = str.trim();
    if (!trimmed) return undefined;
    try {
        const segmenter = new Intl.Segmenter();
        const segments = Array.from(segmenter.segment(trimmed));
        if (segments.length > 0) {
            return segments[0].segment;
        }
    } catch {
        return trimmed.slice(0, 2);
    }
    return undefined;
}

/**
 * 載入或熱重載 triggers.json 設定檔
 */
export function loadEasterEggs(): void {
    try {
        if (!fs.existsSync(TRIGGERS_PATH)) {
            fs.writeFileSync(TRIGGERS_PATH, JSON.stringify(DEFAULT_EASTER_EGGS, null, 2), 'utf-8');
            console.log(`📄 [Triggers] 已自動建立 triggers.json 設定檔。`);
            easterEggs = [...DEFAULT_EASTER_EGGS];
            return;
        }

        const raw = fs.readFileSync(TRIGGERS_PATH, 'utf-8');
        const parsed = parseJsonLenient(raw);

        if (Array.isArray(parsed)) {
            easterEggs = parsed.map((item: any, idx: number) => ({
                id: item.id || `egg_${idx + 1}`,
                name: item.name || `自訂彩蛋 ${idx + 1}`,
                keywords: Array.isArray(item.keywords) ? item.keywords : (item.keywords ? [item.keywords] : []),
                songUrl: item.songUrl || '',
                replyMessage: item.replyMessage || '🎵 已自動加入彩蛋歌曲！',
                reactionEmoji: extractFirstEmoji(item.reactionEmoji) || '🟣',
                cooldownSeconds: typeof item.cooldownSeconds === 'number' ? item.cooldownSeconds : 60
            }));
            console.log(`🔄 [Triggers] 成功載入 ${easterEggs.length} 個自訂觸發詞設定！`);
        } else {
            console.warn(`⚠️ [Triggers] triggers.json 格式必須為 JSON 陣列，將暫時維持既有設定。`);
        }
    } catch (error: any) {
        console.warn(`⚠️ [Triggers] 讀取 triggers.json 失敗（可能尚未儲存完成或格式有誤）：${error?.message || error}`);
    }
}

// 啟動時立即載入，並啟用檔案即時監控（熱重載）
loadEasterEggs();

let debounceTimer: NodeJS.Timeout | null = null;
try {
    const watcher = fs.watch(TRIGGERS_PATH, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                console.log(`⚡ [Triggers] 偵測到 triggers.json 變更，正在即時重新載入...`);
                loadEasterEggs();
            }, 300);
        }
    });
    watcher.unref();
} catch (e) {
    // 檔案監聽非致命異常忽略
}

/**
 * 從 YouTube 網址中解析出 Video ID
 */
export function extractYouTubeId(url: string): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes('youtu.be')) {
            return parsed.pathname.slice(1).split('?')[0];
        }
        if (parsed.hostname.includes('youtube.com')) {
            return parsed.searchParams.get('v');
        }
    } catch {
        const match = url.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
        if (match) return match[1];
    }
    return null;
}

/**
 * 檢查輸入的訊息文字是否命中任一彩蛋
 */
export function findMatchingEasterEgg(content: string): EasterEgg | null {
    if (!content) return null;
    const cleanContent = content.replace(/\s+/g, '').toLowerCase();

    for (const egg of easterEggs) {
        for (const kw of egg.keywords) {
            if (typeof kw === 'string') {
                const cleanKw = kw.replace(/\s+/g, '').toLowerCase();
                if (cleanKw && cleanContent.includes(cleanKw)) {
                    return egg;
                }
            } else if (kw instanceof RegExp) {
                if (kw.test(content) || kw.test(cleanContent)) {
                    return egg;
                }
            }
        }
    }
    return null;
}

/**
 * 檢查該伺服器冷卻時間是否已過
 */
export function checkCooldown(guildId: string, egg: EasterEgg): boolean {
    const cooldownMs = (egg.cooldownSeconds ?? 60) * 1000;
    const key = `${guildId}:${egg.id}`;
    const now = Date.now();
    const lastTrigger = cooldownMap.get(key) ?? 0;

    if (now - lastTrigger < cooldownMs) {
        return false;
    }

    cooldownMap.set(key, now);
    return true;
}

/**
 * 檢查歌曲是否已經存在於當前播放清單中（包含目前正在播以及待播歌曲）
 */
export function isSongInQueue(queue: any, targetUrl: string): boolean {
    if (!queue || !Array.isArray(queue.songs) || queue.songs.length === 0) {
        return false;
    }

    const targetId = extractYouTubeId(targetUrl);

    return queue.songs.some((song: any) => {
        if (!song) return false;
        if (song.url && song.url.includes(targetUrl)) return true;
        if (targetId) {
            if (song.id === targetId) return true;
            if (song.url && extractYouTubeId(song.url) === targetId) return true;
        }
        return false;
    });
}
