import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { distube, clearIdleTimer, resetIdleTimer, prefetchNextSong } from './index';
import { commands } from './commandDefinitions';

export { commands };

/**
 * Helper to respond to interactions safely:
 * Uses editReply if deferred, otherwise followUp/reply
 */
async function respond(interaction: ChatInputCommandInteraction, content: any) {
    try {
        if (interaction.deferred && !interaction.replied) {
            return await interaction.editReply(content);
        }
        if (interaction.replied) {
            return await interaction.followUp(content);
        }
        return await interaction.reply(content);
    } catch (e: any) {
        console.error(`[Interaction Response Error]:`, e?.message || e);
        try {
            return await interaction.followUp(content);
        } catch {}
    }
}

export async function executeCommand(interaction: ChatInputCommandInteraction) {
    console.log(`[Interaction] Executing /${interaction.commandName} from ${interaction.user.tag}`);
    try {
        await interaction.deferReply();
    } catch (e: any) {
        console.error(`[Interaction] Failed to deferReply:`, e?.message || e);
        return;
    }

    const member = interaction.member as GuildMember;
    const voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
        return respond(interaction, { content: '❌ 你必須先加入一個語音頻道！' });
    }

    try {
        if (interaction.commandName === 'play') {
            let query = interaction.options.getString('query', true);
            
            // 自動過濾 YouTube 的「合輯 (Mix)」播放清單 (list=RD...)
            try {
                const url = new URL(query);
                if ((url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) && url.searchParams.get('list')?.startsWith('RD')) {
                    ['list', 'start_radio', 'index'].forEach(p => url.searchParams.delete(p));
                    query = url.toString();
                }
            } catch {}

            await respond(interaction, `🔍 正在搜尋並載入 **${query}**... 請稍候！`);

            try {
                // Distube play
                await distube.play(voiceChannel, query, {
                    member: member,
                    textChannel: interaction.channel as any
                });
                
                // Delete or update the loading message once song is queued
                await interaction.deleteReply().catch(() => {});
            } catch (err: any) {
                console.error(`[Play Error]:`, err);
                await respond(interaction, `❌ 無法載入歌曲，請確認網址或名稱是否正確（${err?.message || err}）。`).catch(() => {});
                return;
            }
            
            return;
        }

        const queue = distube.getQueue(interaction.guildId!);

        if (queue) {
            queue.textChannel = interaction.channel as any;
        }

        if (!queue) {
            if (interaction.commandName === 'stop') {
                const voice = distube.voices.get(interaction.guildId!);
                if (voice) {
                    clearIdleTimer(interaction.guildId!);
                    distube.voices.leave(interaction.guildId!);
                    return respond(interaction, '⏹️ 已退出語音頻道！');
                }
            }
            return respond(interaction, '目前沒有正在播放的音樂！');
        }

        if (interaction.commandName === 'skip') {
            if (queue.songs.length === 1 && !queue.autoplay) {
                await queue.stop();
                resetIdleTimer(interaction.guildId!, interaction.channel);
                return respond(interaction, '⏹️ 已跳過最後一首歌曲，播放清單已空。');
            } else {
                const nextSong = queue.songs[1];
                await queue.skip();
                if (nextSong) {
                    return respond(interaction, `⏭️ 已跳過當前歌曲！即將播放：**${nextSong.name}**`);
                }
                return respond(interaction, '⏭️ 已跳過當前歌曲！');
            }
        }

        if (interaction.commandName === 'pause') {
            if (queue.paused) {
                return respond(interaction, '音樂已經處於暫停狀態！');
            }
            queue.pause();
            return respond(interaction, '⏸️ 已暫停播放！');
        }

        if (interaction.commandName === 'resume') {
            if (!queue.paused) {
                return respond(interaction, '音樂目前正在播放中！');
            }
            queue.resume();
            return respond(interaction, '▶️ 已繼續播放！');
        }

        if (interaction.commandName === 'stop') {
            await queue.stop();
            clearIdleTimer(interaction.guildId!);
            distube.voices.leave(interaction.guildId!);
            return respond(interaction, '⏹️ 已停止播放音樂並退出語音頻道！');
        }

        if (interaction.commandName === 'shuffle') {
            if (queue.songs.length <= 1) {
                return respond(interaction, '⚠️ 播放清單中沒有待播的歌曲可供隨機打亂！');
            }
            if (queue.songs.length === 2) {
                return respond(interaction, 'ℹ️ 播放清單中目前只有 1 首待播歌曲，無須打亂順序。');
            }

            await queue.shuffle();
            prefetchNextSong(queue);

            const upcoming = queue.songs.slice(1, 6);
            let previewText = `🔀 **已成功隨機打亂播放清單！**（共 ${queue.songs.length - 1} 首待播歌曲）\n\n**接下來即將播放：**\n`;
            previewText += upcoming.map((s: any, idx: number) => `${idx + 1}. **${s.name}** - \`${s.formattedDuration}\``).join('\n');
            if (queue.songs.length > 6) {
                previewText += `\n...以及其他 ${queue.songs.length - 6} 首歌曲`;
            }

            return respond(interaction, previewText);
        }

        if (interaction.commandName === 'volume') {
            const volume = interaction.options.getInteger('amount', true);
            queue.setVolume(volume);
            return respond(interaction, `🔊 音量已調整為 ${volume}%！`);
        }

        if (interaction.commandName === 'queue') {
            const currentSong = queue.songs[0];
            let queueString = `**目前播放：**\n${currentSong.name} - \`${currentSong.formattedDuration}\`\n\n**待播清單：**\n`;
            
            const nextSongs = queue.songs.slice(1, 10);
            if (nextSongs.length > 0) {
                queueString += nextSongs.map((song: any, i: number) => `${i + 1}. ${song.name} - \`${song.formattedDuration}\``).join('\n');
            } else {
                queueString += '清單中沒有其他待播歌曲。';
            }

            return respond(interaction, queueString);
        }

        if (interaction.commandName === 'nowplay') {
            const currentSong = queue.songs[0];
            const currentTime = queue.currentTime;
            const duration = currentSong.duration;
            
            let progressBar = '';
            if (currentSong.isLive) {
                progressBar = '🔴 直播中';
            } else {
                const barLength = 20;
                const progress = duration === 0 ? 0 : currentTime / duration;
                const pos = Math.min(Math.max(Math.round(barLength * progress), 0), barLength - 1);
                
                for (let i = 0; i < barLength; i++) {
                    progressBar += i === pos ? '🔘' : '▬';
                }
            }

            const message = `🎶 **${currentSong.name}**\n\`${queue.formattedCurrentTime}\` ${progressBar} \`${currentSong.formattedDuration}\``;
            return respond(interaction, message);
        }

        if (interaction.commandName === 'remove') {
            const index = interaction.options.getInteger('number', true);
            if (index < 1 || index >= queue.songs.length) {
                return respond(interaction, `⚠️ 清單編號 ${index} 不存在。請輸入有效編號（1 至 ${queue.songs.length - 1}）。`);
            }
            const removedSong = queue.songs[index];
            queue.songs.splice(index, 1);
            return respond(interaction, `🗑️ 已將 **${removedSong.name}** 從播放清單中移除。`);
        }

    } catch (error) {
        console.error(error);
        try {
            await respond(interaction, '執行指令時發生未預期的錯誤。');
        } catch (e) {
            // ignore fallback errors
        }
    }
}
