# Discord Music Bot 🎵

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue?logo=discord&logoColor=white)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![DisTube](https://img.shields.io/badge/DisTube-v5-orange)](https://distube.js.org/)
[![yt-dlp](https://img.shields.io/badge/yt--dlp-supported-red?logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)

這是一款專為社群與高穩定性調校的 **Discord 進階音樂機器人**，基於 [Discord.js v14](https://discord.js.org/) 與 [DisTube](https://distube.js.org/) 核心打造。

針對近年 YouTube 頻繁更新的 JavaScript 簽章驗證與 403 Forbidden 封鎖機制，本專案採用了**本地 HTTP Stream Proxy** 與自訂 yt-dlp 串流管線，並加入記憶體快取與彩蛋語音互動功能，在低規格雲端主機（如 1GB RAM VM）亦能順暢長期運行。

---

## ✨ 核心特色

- 🎧 **多平台播放**：支援 YouTube、Spotify、SoundCloud 的單曲與播放清單直接解析。
- 🛡️ **高抗阻串流架構**：自建 Local Stream Proxy，音訊串流直接導向 DisTube / FFmpeg，有效繞過 YouTube 網址時效與 403 阻擋。
- ⚡ **記憶體快取 (In-Memory Cache)**：重複點播之曲目具備 1 小時 TTL 快取，瞬間解析，大幅降低伺服器 CPU / 網路負擔。
- 📊 **精緻播放進度條**：`/nowplay` 具備動態進度條、時長、歌曲資訊與點播者標籤。
- 🔀 **隨機播放 (Shuffle)**：一鍵隨機打亂目前佇列中所有待播歌曲。
- 🔄 **智慧頻道跟隨**：播放通知與提示訊息自動跟隨最新下達指令的文字頻道，不打擾其他討論。
- 🧹 **雙重指令自動清理**：啟動時自動清理伺服器層級殘留指令，確保 Discord 斜線指令清單乾淨不重複。
- 🎭 **社群趣味彩蛋 (Easter Eggs)**：聊天室偵測關鍵字自動觸發表情反應並自動插播經典迷因曲目（內建防洗版冷卻時間）。

---

## 🛠️ 可用指令 (Slash Commands)

您可以在 Discord 的文字頻道輸入 `/` 叫出指令選單：

| 指令 | 說明 | 參數範例 |
| :--- | :--- | :--- |
| `/play` | 播放歌曲或整個播放清單 (YouTube/Spotify/SoundCloud) | `/play query: 歌名或網址` |
| `/nowplay` | 顯示目前正在播放的歌曲、進度條與時長 | *無* |
| `/queue` | 顯示待播清單 (不含外連保持版面簡潔) | *無* |
| `/shuffle` | 隨機打亂佇列中接下來的待播歌曲順序 | *無* |
| `/skip` | 跳過當前歌曲，播放下一首 | *無* |
| `/remove` | 從待播清單中刪除指定序號的歌曲 | `/remove number: 1` |
| `/pause` | 暫停當前音樂播放 | *無* |
| `/resume` | 恢復暫停中的音樂播放 | *無* |
| `/stop` | 停止播放並清空整個待播清單 | *無* |
| `/volume` | 調整機器人音量大小 (1 ~ 100) | `/volume amount: 60` |

> 💡 **小提示**：使用任何音樂指令前，使用者必須已加入伺服器內的任一語音頻道 (Voice Channel)。

---

## 🎭 聊天室彩蛋互動 (Easter Eggs)

當使用者在文字頻道中輸入特定關鍵字時，機器人會自動添加表情反應，並將該彩蛋曲目自動插入至播放佇列的最前方作為下一首！

內建支援的關鍵字（可於 `triggers.json` 自由擴充）：

| 彩蛋主題 | 觸發關鍵字 (範例) | 特色效果 |
| :--- | :--- | :--- |
| **五條悟 × 雨愛** | `41`, `41秒`, `茈發動前的41秒` | 😮‍💨 🪑 詠唱台詞 + 插播雨愛 DJ 版 |
| **喬魯諾處刑曲** | `處刑曲`, `我喬魯諾喬巴拿有一個夢想`, `無駄` | 🎷 3:45 鋼琴聲響起 |
| **瑞克搖 (Rickroll)**| `rickroll`, `瑞克搖`, `never gonna give you up` | 🕺 經典永不放棄你 |
| **黑人抬棺舞** | `抬棺`, `黑人抬棺`, `專業團隊`, `芭比q了` | ⚰️ 專業團隊已就位 |
| **鬼滅之刃 紅蓮華** | `豬油骨`, `豬油骨拿來滷`, `你又忘洗蛋`, `紅蓮華` | 🍜 空耳歌詞 + LiSA 紅蓮華 |
| **JoJo 未完待續** | `to be continued`, `未完待續`, `完蛋`, `出事` | ⏪ 畫面泛黃 Roundabout |
| **張家兄弟** | `張家兄弟`, `兄弟`, `愛哥哥` | 青之居所 迷因版 |
| **怪盜基德** | `等一下`, `基德` | 🕶️ 柯南系列經典迷因 |
| **統神地震** | `地震`, `桃園是台地` | 桃園台地傳奇實況音效 |

*所有彩蛋皆具備預設 60 秒的獨立冷卻時間，防止洗版濫用。*

---

## 🌿 專案分支 (Branches)

- **`main`**：**雲端 Linux 專用版本**。已針對 Ubuntu / Azure VM 最佳化路徑、環境變數與長效背景服務（PM2）。
- **`windows`**：**本地 Windows 版本**。包含一鍵啟動批次檔 (`.bat`) 與 Windows 本機路徑設定。

---

## 🚀 部署與運行教學

### 1. 前置準備
在 [Discord Developer Portal](https://discord.com/developers/applications) 建立 Application，並取得：
- **Bot Token**
- **Client ID** (Application ID)
- 於 OAuth2 / Bot 設定頁面開啟 **Message Content Intent**、**Server Members Intent** 與適當的語音權限。

### 2. 設定環境變數 (`.env`)
在專案根目錄下建立 `.env`：
```env
DISCORD_TOKEN=您的_BOT_TOKEN
CLIENT_ID=您的_BOT_CLIENT_ID
```

---

### 方案 A：Linux 伺服器部署 (Ubuntu / Azure / VPS)

適用於 `main` 分支。特別適合記憶體較小 (如 1GB ~ 2GB RAM) 的雲端虛擬機。

#### 步驟 1：安裝系統依賴
```bash
# 更新套件庫
sudo apt update && sudo apt install -y curl ffmpeg

# 安裝 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安裝 Deno (用於 yt-dlp 的 YouTube JavaScript EJS 挑戰解算)
curl -fsSL https://deno.land/install.sh | sh
echo 'export DENO_INSTALL="$HOME/.deno"' >> ~/.bashrc
echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

#### 步驟 2：啟用 Swap 虛擬記憶體 (強烈推薦 1GB RAM 主機)
yt-dlp 與語音編碼在尖峰時段需要充足的虛擬記憶體以防 OOM (Out Of Memory) 閃退：
```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### 步驟 3：安裝專案依賴與 PM2 背景管理
```bash
npm install
sudo npm install -g pm2

# 使用 PM2 啟動機器人
pm2 start npx --name "music-bot" -- tsx src/index.ts

# 儲存 PM2 狀態並設定開機自啟動
pm2 save
pm2 startup
```

---

### 方案 B：Windows 本地端運行

適用於 `windows` 分支。

1. 確保電腦已安裝 [Node.js](https://nodejs.org/) (建議 v20 以上) 與 [FFmpeg](https://ffmpeg.org/)（需加入環境變數 PATH）。
2. 在專案目錄下執行終端機指令：
   ```cmd
   npm install
   ```
3. 啟動機器人：
   - 直接雙擊專案目錄下的 `啟動音樂機器人.bat`
   - 或於終端機執行：
     ```cmd
     npx tsx src/index.ts
     ```

看到終端機輸出 `Logged in as 機器人名稱` 即代表順利上線！

---

## 📄 License
本專案僅供學習交流與社群自用。音訊內容版權歸原作者及版權方所有。
