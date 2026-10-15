import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { distube, clearIdleTimer, resetIdleTimer, prefetchNextSong } from './index';
import { commands } from './commandDefinitions';

export { commands };

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
        return interaction.followUp({ content: 'You need to join a voice channel first!' });
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

            const searchMessage = await interaction.followUp(`🔍 正在搜尋並載入 **${query}**... 請稍候！`);

            try {
                // Distube play
                await distube.play(voiceChannel, query, {
                    member: member,
                    textChannel: interaction.channel as any
                });
                // Delete the "please wait" message once distube finishes adding
                await searchMessage.delete().catch(() => {});
            } catch (err) {
                // Update the message if there was an error
                await searchMessage.edit(`❌ 無法載入歌曲，請確認網址或名稱是否正確。`).catch(() => {});
                throw err;
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
                    return interaction.followUp('⏹️ 已退出語音頻道！');
                }
            }
            return interaction.followUp('There is no music playing right now!');
        }

        if (interaction.commandName === 'skip') {
            if (queue.songs.length === 1 && !queue.autoplay) {
                await queue.stop();
                resetIdleTimer(interaction.guildId!, interaction.channel);
                return interaction.followUp('⏹️ 已跳過最後一首歌曲，播放清單已空。');
            } else {
                const nextSong = queue.songs[1];
                await queue.skip();
                if (nextSong) {
                    return interaction.followUp(`⏭️ 已跳過當前歌曲！即將播放：**${nextSong.name}**`);
                }
                return interaction.followUp('⏭️ 已跳過當前歌曲！');
            }
        }

        if (interaction.commandName === 'pause') {
            if (queue.paused) {
                return interaction.followUp('The music is already paused!');
            }
            queue.pause();
            return interaction.followUp('Paused the music!');
        }

        if (interaction.commandName === 'resume') {
            if (!queue.paused) {
                return interaction.followUp('The music is already playing!');
            }
            queue.resume();
            return interaction.followUp('Resumed the music!');
        }

        if (interaction.commandName === 'stop') {
            await queue.stop();
            clearIdleTimer(interaction.guildId!);
            distube.voices.leave(interaction.guildId!);
            return interaction.followUp('⏹️ 已停止播放音樂並退出語音頻道！');
        }

        if (interaction.commandName === 'shuffle') {
            if (queue.songs.length <= 1) {
                return interaction.followUp('⚠️ 播放清單中沒有待播的歌曲可供隨機打亂！');
            }
            if (queue.songs.length === 2) {
                return interaction.followUp('ℹ️ 播放清單中目前只有 1 首待播歌曲，無須打亂順序。');
            }

            await queue.shuffle();
            prefetchNextSong(queue);

            const upcoming = queue.songs.slice(1, 6);
            let previewText = `🔀 **已成功隨機打亂播放清單！**（共 ${queue.songs.length - 1} 首待播歌曲）\n\n**接下來即將播放：**\n`;
            previewText += upcoming.map((s: any, idx: number) => `${idx + 1}. **${s.name}** - \`${s.formattedDuration}\``).join('\n');
            if (queue.songs.length > 6) {
                previewText += `\n...以及其他 ${queue.songs.length - 6} 首歌曲`;
            }

            return interaction.followUp(previewText);
        }

        if (interaction.commandName === 'volume') {
            const volume = interaction.options.getInteger('amount', true);
            queue.setVolume(volume);
            return interaction.followUp(`Volume set to ${volume}%!`);
        }

        if (interaction.commandName === 'queue') {
            const currentSong = queue.songs[0];
            let queueString = `**Currently Playing:**\n${currentSong.name} - \`${currentSong.formattedDuration}\`\n\n**Up Next:**\n`;
            
            const nextSongs = queue.songs.slice(1, 10);
            if (nextSongs.length > 0) {
                queueString += nextSongs.map((song: any, i: number) => `${i + 1}. ${song.name} - \`${song.formattedDuration}\``).join('\n');
            } else {
                queueString += 'No more songs in the queue.';
            }

            return interaction.followUp(queueString);
        }

        if (interaction.commandName === 'nowplay') {
            const currentSong = queue.songs[0];
            const currentTime = queue.currentTime;
            const duration = currentSong.duration;
            
            let progressBar = '';
            if (currentSong.isLive) {
                progressBar = '🔴 LIVE';
            } else {
                const barLength = 20;
                const progress = duration === 0 ? 0 : currentTime / duration;
                const pos = Math.min(Math.max(Math.round(barLength * progress), 0), barLength - 1);
                
                for (let i = 0; i < barLength; i++) {
                    progressBar += i === pos ? 'o' : '-';
                }
            }

            const message = `**${currentSong.name}**\n\`${queue.formattedCurrentTime} ${progressBar} ${currentSong.formattedDuration}\``;
            return interaction.followUp(message);
        }

        if (interaction.commandName === 'remove') {
            const index = interaction.options.getInteger('number', true);
            if (index >= queue.songs.length) {
                return interaction.followUp(`There is no song at position ${index} in the queue.`);
            }
            const removedSong = queue.songs[index];
            queue.songs.splice(index, 1);
            return interaction.followUp(`🗑️ Removed **${removedSong.name}** from the queue.`);
        }

    } catch (error) {
        console.error(error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp('An error occurred while executing the command.').catch(() => {});
            } else {
                await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true }).catch(() => {});
            }
        } catch (e) {
            // ignore fallback errors
        }
    }
}
