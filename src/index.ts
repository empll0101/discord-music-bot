import { Client, GatewayIntentBits, REST, Routes, Events } from 'discord.js';
import { DisTube } from 'distube';
import { SpotifyPlugin } from '@distube/spotify';
import { SoundCloudPlugin } from '@distube/soundcloud';
import { YtDlpPlugin } from '@distube/yt-dlp';
import dotenv from 'dotenv';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import { commands, executeCommand } from './commands';

// Add ffmpeg to PATH so distube can find it
if (ffmpegPath) {
    const ffmpegDir = path.dirname(ffmpegPath);
    process.env.PATH = `${ffmpegDir};${process.env.PATH}`;
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

// Initialize DisTube
export const distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    plugins: [
        new SpotifyPlugin(),
        new SoundCloudPlugin(),
        new YtDlpPlugin({ update: true })
    ]
});

// This function sets up everything
async function bootstrap() {
    try {
        // Register slash commands
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
client.on(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.find(c => c.name === interaction.commandName);
    if (!command) return;

    await executeCommand(interaction);
});

// Handle distube events
distube
    .on('playSong', (queue, song) => {
        queue.textChannel?.send(`Now playing: ${song.name} - \`${song.formattedDuration}\``);
    })
    .on('addSong', (queue, song) => {
        queue.textChannel?.send(`Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}`);
    })
    .on('addList', (queue, playlist) => {
        queue.textChannel?.send(`Added \`${playlist.name}\` playlist (${playlist.songs.length} songs) to the queue!`);
    })
    .on('error', (error, queue) => {
        console.error('Distube error:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        queue?.textChannel?.send(`An error encountered: ${errorMsg.slice(0, 2000)}`).catch(() => {});
    })
    .on('ffmpegDebug', (debug) => {
        console.log(`ffmpeg: ${debug}`);
    })
    .on('disconnect', (queue) => {
        queue.textChannel?.send('Disconnected from the voice channel!');
    })
    .on('empty', queue => {
        queue.textChannel?.send('Voice channel is empty! Leaving the channel...');
    })
    .on('searchNoResult', (message, query) => {
        message.channel.send(`❌ No result found for \`${query}\`!`);
    })
    .on('finish', queue => {
        queue.textChannel?.send('Party is over! No more songs in queue.');
    });

bootstrap();
