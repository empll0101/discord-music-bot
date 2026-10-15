import { SlashCommandBuilder } from 'discord.js';

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
        .setName('shuffle')
        .setDescription('隨機打亂佇列中接下來的待播歌曲順序 (Shuffle upcoming songs in queue)'),
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
