import { Client, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import DisTube from 'distube';
import { SpotifyPlugin } from '@distube/spotify';
import { SoundCloudPlugin } from '@distube/soundcloud';
import { YtDlpPlugin } from '@distube/yt-dlp';
import { YouTubePlugin } from './youtubePlugin';
import dotenv from 'dotenv';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import net from 'net';
import { commands } from './commandDefinitions';
import { executeCommand } from './commands';
import { findMatchingEasterEgg, checkCooldown, isSongInQueue } from './easterEggs';

// Single-instance lock: prevents running multiple bots concurrently on the same token
const SINGLE_INSTANCE_PORT = 39280;
const lockServer = net.createServer();
lockServer.once('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
        console.error('\n❌ [錯誤] 偵測到已有另一個音樂機器人實例正在執行中！');
        console.error('請先關閉其他命令提示字元 (CMD) 視窗或工作管理員中的 node.exe / tsx 處理程序，避免兩台機器人互相搶佔語音導致歌曲重複從頭播放。\n');
        process.exit(1);
    }
});
lockServer.listen(SINGLE_INSTANCE_PORT, '127.0.0.1');

// Ensure ffmpeg is in PATH
const ffmpegDir = path.dirname(ffmpegPath!);
if (!process.env.PATH?.includes(ffmpegDir)) {
    process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;
}

dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env file.');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

export const youtubePlugin = new YouTubePlugin();

// Initialize DisTube
export const distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    plugins: [
        youtubePlugin as any,
        new SpotifyPlugin(
            process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
                ? {
                    api: {
                        clientId: process.env.SPOTIFY_CLIENT_ID,
                        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                    },
                }
                : undefined
        ) as any,
        new SoundCloudPlugin() as any,
        new YtDlpPlugin({ update: true }) as any
    ]
});

// This function sets up everything
async function bootstrap() {
    try {
        // Register global slash commands
        const rest = new REST({ version: '10' }).setToken(TOKEN!);
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID!),
            { body: commands.map(c => c.toJSON()) }
        );
        console.log('Successfully reloaded application (/) commands.');

        // Login to Discord
        await client.login(TOKEN);
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
}

// Event listeners
client.on(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    // Immediately sync slash commands to all current guilds so they appear instantly in Discord UI without caching delay
    const rest = new REST({ version: '10' }).setToken(TOKEN!);
    for (const guild of client.guilds.cache.values()) {
        try {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID!, guild.id),
                { body: commands.map(c => c.toJSON()) }
            );
            console.log(`✅ Synced slash commands to guild: ${guild.name}`);
        } catch (e: any) {
            console.warn(`⚠️ Failed to sync commands to guild ${guild.name}:`, e?.message || e);
        }
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.find(c => c.name === interaction.commandName);
    if (!command) return;

    await executeCommand(interaction);
});

client.on(Events.MessageCreate, async (message) => {
    // 忽略機器人自身的訊息、非伺服器群組文字頻道，或缺少成員資訊的訊息
    if (message.author.bot || !message.guild || !message.member) return;

    const egg = findMatchingEasterEgg(message.content);
    if (!egg) return;

    const guildId = message.guild.id;

    // 檢查伺服器冷卻時間
    if (!checkCooldown(guildId, egg)) {
        console.log(`[EasterEgg] ${egg.name} 於 ${message.guild.name} 觸發，但仍在冷卻中。`);
        return;
    }

    const queue = distube.getQueue(guildId);
    const memberVoiceChannel = message.member.voice?.channel;

    if (queue) {
        // 情境 1：機器人目前正在播放音樂中
        // 檢查防重複排隊：若當前清單已包含該曲則不重複插入
        if (isSongInQueue(queue, egg.songUrl)) {
            if (egg.reactionEmoji) {
                await message.react(egg.reactionEmoji).catch(() => {});
            }
            return;
        }

        const voiceChannel = queue.voiceChannel || memberVoiceChannel;
        if (!voiceChannel) return;

        try {
            if (egg.reactionEmoji) {
                await message.react(egg.reactionEmoji).catch(() => {});
            }

            await message.reply({ content: egg.replyMessage }).catch(() => {});

            // 標記此首為彩蛋，避免觸發 addSong 的一般重複提示
            (queue as any)._isInsertingEasterEgg = true;

            await distube.play(voiceChannel, egg.songUrl, {
                member: message.member,
                textChannel: message.channel as any
            });

            // 若目前清單超過 2 首（0 為現正播放，1 為原下一首，剛加入的在最後一首），將其移至第 1 順位（下一首播放）
            if (queue.songs.length > 2) {
                const insertedSong = queue.songs.pop();
                if (insertedSong) {
                    queue.songs.splice(1, 0, insertedSong);
                }
            }

            // 預載下一首音樂緩衝
            prefetchNextSong(queue);
        } catch (error) {
            console.error(`[EasterEgg Error]:`, error);
        } finally {
            (queue as any)._isInsertingEasterEgg = false;
        }
    } else if (memberVoiceChannel) {
        // 情境 2：機器人未在播放，但輸入者在語音頻道內 -> 主動加入語音頻道開始播放
        try {
            if (egg.reactionEmoji) {
                await message.react(egg.reactionEmoji).catch(() => {});
            }

            await message.reply({ content: egg.replyMessage }).catch(() => {});

            await distube.play(memberVoiceChannel, egg.songUrl, {
                member: message.member,
                textChannel: message.channel as any
            });
        } catch (error) {
            console.error(`[EasterEgg Error]:`, error);
        }
    }
    // 情境 3：機器人未在播放且使用者不在語音頻道 -> 保持靜默不干擾
});

// 5 minutes idle timeout (in milliseconds)
export const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const idleTimers = new Map<string, NodeJS.Timeout>();

export function resetIdleTimer(guildId: string, textChannel?: any) {
    clearIdleTimer(guildId);
    const timer = setTimeout(() => {
        idleTimers.delete(guildId);
        const voice = distube.voices.get(guildId);
        if (voice) {
            textChannel?.send('⏱️ 已閒置超過 5 分鐘，自動退出語音頻道。').catch(() => {});
            distube.voices.leave(guildId);
        }
    }, IDLE_TIMEOUT_MS);
    idleTimers.set(guildId, timer);
}

export function clearIdleTimer(guildId: string) {
    const timer = idleTimers.get(guildId);
    if (timer) {
        clearTimeout(timer);
        idleTimers.delete(guildId);
    }
}

function configureAudioPlayer(queue: any) {
    // Increase tolerance for audio buffer underruns to 5 seconds (250 frames of 20ms each)
    // This prevents @discordjs/voice AudioPlayer from prematurely stopping on minor network jitter
    if (queue.voice?.audioPlayer?.behaviors) {
        queue.voice.audioPlayer.behaviors.maxMissedFrames = 250;
    }
}

export function prefetchNextSong(queue: any) {
    if (queue?.songs && queue.songs.length > 1) {
        const nextSong = queue.songs[1];
        youtubePlugin.prefetch(nextSong).catch(() => {});
    }
}

// Handle distube events
(distube as any)
    .on('initQueue', (queue: any) => {
        configureAudioPlayer(queue);
    })
    .on('playSong', (queue: any, song: any) => {
        configureAudioPlayer(queue);
        clearIdleTimer(queue.id);
        prefetchNextSong(queue);
        queue.textChannel?.send(`Now playing: ${song.name} - \`${song.formattedDuration}\``);
    })
    .on('addSong', (queue: any, song: any) => {
        clearIdleTimer(queue.id);
        prefetchNextSong(queue);
        if (queue._isInsertingEasterEgg) {
            queue._isInsertingEasterEgg = false;
            return;
        }
        queue.textChannel?.send(`Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}`);
    })
    .on('addList', (queue: any, playlist: any) => {
        clearIdleTimer(queue.id);
        prefetchNextSong(queue);
        queue.textChannel?.send(`Added \`${playlist.name}\` playlist (${playlist.songs.length} songs) to the queue!`);
    })
    .on('error', (error: any, queue?: any) => {
        console.error('Distube error:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        queue?.textChannel?.send(`An error encountered: ${errorMsg.slice(0, 2000)}`).catch(() => { });
    })
    .on('ffmpegDebug', (debug: any) => {
        if (typeof debug === 'string' && (debug.includes('Application provided invalid') || debug.includes('bitrate=') || debug.includes('speed='))) {
            return;
        }
        console.log(`ffmpeg: ${debug}`);
    })
    .on('disconnect', (queue: any) => {
        clearIdleTimer(queue.id);
        queue.textChannel?.send('Disconnected from the voice channel!');
    })
    .on('empty', (queue: any) => {
        queue.textChannel?.send('Voice channel is empty! Leaving the channel...');
        clearIdleTimer(queue.id);
        distube.voices.leave(queue.id);
    })
    .on('finish', (queue: any) => {
        queue.textChannel?.send('Party is over! No more songs in queue.');
        resetIdleTimer(queue.id, queue.textChannel);
    });

bootstrap();
