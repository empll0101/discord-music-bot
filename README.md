# Discord Music Bot 🎵

這是一款基於 [Discord.js v14](https://discord.js.org/) 和 [DisTube](https://distube.js.org/) 核心打造的進階 Discord 音樂機器人。
支援直接播放來自 YouTube、Spotify 和 SoundCloud 的音樂與播放清單，並內建了抗封鎖機制與各種實用的音樂控制指令。

## ✨ 核心特色

- 🎧 **多平台支援**：支援 YouTube、Spotify、SoundCloud 的單曲與播放清單。
- 🛡️ **YouTube 防封鎖機制**：內建 `yt-dlp` 自動更新器，能有效避開 YouTube 的 403 阻擋機制與機器人偵測。
- 📊 **視覺化進度條**：使用 `/nowplay` 指令時，會顯示精緻的視覺化播放進度條。
- 🔄 **智慧頻道跟隨**：機器人的自動通知（如「正在播放...」）會自動跟隨您最後下達指令的文字頻道，不會洗版到其他地方。

---

## 🛠️ 可用指令 (Slash Commands)

您可以在 Discord 的任何文字頻道輸入以下指令來控制機器人：

| 指令 | 說明 | 參數範例 |
| :--- | :--- | :--- |
| `/play` | 播放一首歌曲或整個播放清單 | `/play query: <歌名或網址>` |
| `/nowplay` | 顯示目前正在播放的歌曲以及進度條 | 無 |
| `/queue` | 顯示目前的待播清單 (不含超連結以保持版面乾淨) | 無 |
| `/remove` | 從待播清單中刪除指定的歌曲 | `/remove number: 1` |
| `/skip` | 跳過目前的歌曲，播放下一首 | 無 |
| `/pause` | 暫停目前的音樂 | 無 |
| `/resume` | 恢復播放暫停中的音樂 | 無 |
| `/stop` | 停止播放並清空整個播放清單 | 無 |
| `/volume` | 調整機器人的音量大小 (1-100) | `/volume amount: 50` |

> 💡 **小提示**：要使用任何指令前，請確保您**已經加入任何一個語音頻道 (Voice Channel)**。

---

## 🚀 如何在本地端啟動

如果您想要自己架設這個機器人，請按照以下步驟進行：

### 1. 安裝依賴套件
確保您已安裝 [Node.js](https://nodejs.org/) (建議版本 v20 以上)。在專案資料夾中開啟終端機，執行以下指令：
```bash
npm install
```

### 2. 設定環境變數
在專案根目錄下建立一個名為 `.env` 的檔案，並填入您的 Discord 機器人 Token 與 Client ID：
```env
DISCORD_TOKEN=您的_BOT_TOKEN
CLIENT_ID=您的_BOT_CLIENT_ID
```
*(Token 與 Client ID 可至 [Discord Developer Portal](https://discord.com/developers/applications) 取得)*

### 3. 啟動機器人
使用以下指令來啟動機器人。啟動時，機器人會自動向 Discord 註冊最新的 Slash Commands：
```bash
npx tsx src/index.ts
```

看到終端機顯示 `Logged in as 您的機器人名稱` 即代表機器人已成功上線！
