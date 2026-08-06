import { ChatInputCommandInteraction, SlashCommandBuilder, GuildMember } from 'discord.js';
import { distube } from './index';

export const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube, Spotify, or SoundCloud')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('The song name or URL to play')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),
    new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current song'),
    new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the current song'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the player and disconnect'),
    new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue'),
    new SlashCommandBuilder()
        .setName('nowplay')
        .setDescription('Show the currently playing song and progress'),
    new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Adjust the volume')
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('Volume amount (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a song from the queue by its number')
        .addIntegerOption(option => 
            option.setName('number')
                .setDescription('The number of the song in the queue (e.g. 1 for the first Up Next)')
                .setMinValue(1)
                .setRequired(true)
        )
];

export async function executeCommand(interaction: ChatInputCommandInteraction) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;

    if (!voiceChannel) {
        return interaction.reply({ content: 'You need to join a voice channel first!', ephemeral: true });
    }

    try {
        await interaction.deferReply();
        if (interaction.commandName === 'play') {
            let query = interaction.options.getString('query', true);
            
            // 自動過濾 YouTube 的「合輯 (Mix)」播放清單 (list=RD...)
            try {
                const url = new URL(query);
                if ((url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) && url.searchParams.get('list')?.startsWith('RD')) {
                    url.searchParams.delete('list');
                    url.searchParams.delete('start_radio');
                    url.searchParams.delete('index');
                    query = url.toString();
                }
            } catch (e) {
                // 如果是純文字搜尋而不是網址，就略過不處理
            }

            const searchMessage = await interaction.followUp(`🔍 正在搜尋並載入 **${query}**... 請稍候！`);

            try {
                // Distube play
                await distube.play(voiceChannel, query, {
                    member: member,
                    textChannel: interaction.channel as any,
                    interaction
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
            return interaction.followUp('There is no music playing right now!');
        }

        if (interaction.commandName === 'skip') {
            if (queue.songs.length === 1 && !queue.autoplay) {
                await queue.stop();
                return interaction.followUp('Skipped the last song. Queue is now empty.');
            } else {
                await queue.skip();
                return interaction.followUp('Skipped the current song!');
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
            return interaction.followUp('Stopped the music and cleared the queue!');
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
                queueString += nextSongs.map((song, i) => `${i + 1}. ${song.name} - \`${song.formattedDuration}\``).join('\n');
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
