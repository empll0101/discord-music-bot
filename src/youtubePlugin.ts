import { spawn } from 'child_process';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';

const distubeModule = require('distube');
const ExtractorPluginClass = distubeModule.ExtractorPlugin;
const SongClass = distubeModule.Song;
const PlaylistClass = distubeModule.Playlist;

export class YouTubePlugin extends (ExtractorPluginClass as { new(): any }) {
    private port = 39281;
    private server: http.Server | null = null;
    private cookiesPath: string | null = null;

    constructor() {
        super();
        this.setupEnvironment();
        this.findCookies();
        this.initServer();
    }

    private setupEnvironment() {
        // Ensure Deno is in PATH for yt-dlp JS challenge solving
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const denoDir = path.join(homeDir, '.deno', 'bin');
        if (fs.existsSync(denoDir) && !process.env.PATH?.includes(denoDir)) {
            process.env.PATH = `${denoDir}${path.delimiter}${process.env.PATH}`;
        }
    }

    private findCookies() {
        const possibleFiles = ['cookies.json', 'cookies.txt'];
        for (const file of possibleFiles) {
            const filePath = path.join(process.cwd(), file);
            if (fs.existsSync(filePath)) {
                this.cookiesPath = filePath;
                console.log(`✅ [YouTubePlugin] Using cookies from ${file}`);
                break;
            }
        }
    }

    private getDenoArgs(): string[] {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const winDeno = path.join(homeDir, '.deno', 'bin', 'deno.exe');
        const linuxDeno = path.join(homeDir, '.deno', 'bin', 'deno');

        if (fs.existsSync(winDeno)) {
            return ['--js-runtimes', `deno:${winDeno}`];
        }
        if (fs.existsSync(linuxDeno)) {
            return ['--js-runtimes', `deno:${linuxDeno}`];
        }
        if (fs.existsSync('/usr/local/bin/deno')) {
            return ['--js-runtimes', 'deno:/usr/local/bin/deno'];
        }
        return ['--js-runtimes', 'deno'];
    }

    private initServer() {
        this.server = http.createServer((req, res) => {
            try {
                req.socket.setNoDelay(true);
                const u = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
                const query = u.searchParams.get('q');
                if (!query) {
                    res.writeHead(400);
                    res.end('Missing query parameter');
                    return;
                }

                if (req.method === 'HEAD') {
                    res.writeHead(200, {
                        'Content-Type': 'audio/webm',
                        'Transfer-Encoding': 'chunked',
                        'Connection': 'keep-alive',
                        'Cache-Control': 'no-cache'
                    });
                    res.end();
                    return;
                }

                let retriedWithoutCookies = false;
                let retriedWithCookies = false;

                const startDownload = (useCookies = false) => {
                    const args = [
                        ...this.getDenoArgs(),
                        '--remote-components', 'ejs:github',
                        '--extractor-args', 'youtube:player_client=web_embedded,android',
                        '-f', 'ba/b',
                        '--no-playlist',
                        '--no-warnings',
                        '--quiet',
                        '--no-progress',
                        '--buffer-size', '2048k',
                        '--retries', '3',
                        '--fragment-retries', '3',
                        '--file-access-retries', '3',
                        '--socket-timeout', '15',
                        '--extractor-retries', '3',
                        '-4',
                        '-o', '-'
                    ];

                    if (useCookies && this.cookiesPath) {
                        args.push('--cookies', this.cookiesPath);
                    }
                    args.push(query);

                    const ytdlp = spawn('yt-dlp', args, {
                        stdio: ['ignore', 'pipe', 'pipe']
                    });
                    
                    const chunks: Buffer[] = [];
                    let totalBytes = 0;
                    let headersSent = false;
                    const PREBUFFER_SIZE = 64 * 1024; // 64 KB

                    const sendHeaders = () => {
                        if (headersSent || res.headersSent) return;
                        headersSent = true;
                        res.writeHead(200, {
                            'Content-Type': 'audio/webm',
                            'Transfer-Encoding': 'chunked',
                            'Connection': 'keep-alive',
                            'Cache-Control': 'no-cache'
                        });
                    };

                    ytdlp.stdout.on('data', (chunk: Buffer) => {
                        totalBytes += chunk.length;
                        if (!headersSent) {
                            chunks.push(chunk);
                            if (totalBytes >= PREBUFFER_SIZE) {
                                sendHeaders();
                                for (const c of chunks) {
                                    res.write(c);
                                }
                                chunks.length = 0;
                                ytdlp.stdout.pipe(res);
                            }
                        }
                    });

                    let stderrMsg = '';
                    ytdlp.stderr.on('data', d => {
                        const msg = d.toString();
                        stderrMsg += msg;
                        if (msg.includes('ERROR:')) {
                            console.error('[yt-dlp stream error]:', msg.trim());
                        }
                    });

                    ytdlp.on('error', err => {
                        console.error('[YouTubePlugin] Failed to spawn yt-dlp:', err);
                        if (!headersSent && !res.destroyed) {
                            res.destroy(err);
                        }
                    });

                    let closed = false;
                    ytdlp.on('close', (code, signal) => {
                        if (closed) return;
                        closed = true;

                        if (code !== 0 && code !== null) {
                            console.error(`[YouTubePlugin] yt-dlp stream failed with code ${code}: ${stderrMsg.trim()}`);
                            if (!headersSent && useCookies && this.cookiesPath && !retriedWithoutCookies) {
                                retriedWithoutCookies = true;
                                console.warn('⚠️ [YouTubePlugin] Stream failed with cookies, retrying without cookies...');
                                startDownload(false);
                                return;
                            }
                            if (!headersSent && !useCookies && this.cookiesPath && !retriedWithCookies && (stderrMsg.includes('Sign in') || stderrMsg.includes('confirm your age'))) {
                                retriedWithCookies = true;
                                console.warn('⚠️ [YouTubePlugin] Stream requires cookies, retrying with cookies...');
                                startDownload(true);
                                return;
                            }
                            if (!res.destroyed) {
                                res.destroy(new Error(`yt-dlp stream exited with code ${code}`));
                            }
                            return;
                        }

                        if (!headersSent) {
                            sendHeaders();
                            for (const c of chunks) {
                                res.write(c);
                            }
                            chunks.length = 0;
                        }
                        if (!res.writableEnded) {
                            res.end();
                        }
                    });

                    req.on('close', () => {
                        if (!ytdlp.killed) {
                            ytdlp.kill();
                        }
                    });
                };

                startDownload();
            } catch (e) {
                console.error('[YouTubePlugin StreamServer] Request error:', e);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end('Internal stream error');
                }
            }
        });

        this.server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                this.port += 1;
                console.warn(`[YouTubePlugin] Port in use, trying port ${this.port}...`);
                this.server?.listen(this.port, '127.0.0.1');
            } else {
                console.error('[YouTubePlugin StreamServer] Server error:', err);
            }
        });

        this.server.listen(this.port, '127.0.0.1', () => {
            console.log(`✅ [YouTubePlugin] Audio stream proxy ready on http://127.0.0.1:${this.port}`);
        });
    }

    async validate(url: string): Promise<boolean> {
        try {
            const u = new URL(url);
            return (
                u.hostname.includes('youtube.com') ||
                u.hostname.includes('youtu.be') ||
                u.hostname.includes('music.youtube.com')
            );
        } catch {
            return false;
        }
    }

    private async runYtDlpJson(args: string[], useCookies = false): Promise<any> {
        const fullArgs = [
            ...this.getDenoArgs(),
            '--remote-components', 'ejs:github',
            '--extractor-args', 'youtube:player_client=web_embedded,android',
            '--dump-single-json',
            '--flat-playlist',
            '--retries', '3',
            '--socket-timeout', '15',
            '-4'
        ];
        if (useCookies && this.cookiesPath) {
            fullArgs.push('--cookies', this.cookiesPath);
        }
        fullArgs.push(...args);

        const proc = spawn('yt-dlp', fullArgs, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';

        const timeout = setTimeout(() => {
            if (!proc.killed) {
                console.warn('⚠️ [YouTubePlugin] yt-dlp process timed out after 35s, killing...');
                proc.kill('SIGKILL');
            }
        }, 35000);

        proc.stdout.on('data', d => stdout += d.toString());
        proc.stderr.on('data', d => stderr += d.toString());

        return new Promise((resolve, reject) => {
            proc.on('close', async code => {
                clearTimeout(timeout);
                if (code === 0) {
                    try {
                        resolve(JSON.parse(stdout));
                    } catch (e) {
                        reject(new Error(`Failed to parse yt-dlp JSON: ${e}`));
                    }
                } else {
                    if (useCookies && this.cookiesPath) {
                        console.warn('⚠️ [YouTubePlugin] Query failed with cookies. Retrying without cookies...');
                        try {
                            const result = await this.runYtDlpJson(args, false);
                            resolve(result);
                            return;
                        } catch {
                            // fall through
                        }
                    } else if (!useCookies && this.cookiesPath && (stderr.includes('Sign in') || stderr.includes('confirm your age'))) {
                        console.warn('⚠️ [YouTubePlugin] Query requires sign in. Retrying with cookies...');
                        try {
                            const result = await this.runYtDlpJson(args, true);
                            resolve(result);
                            return;
                        } catch {
                            // fall through
                        }
                    }
                    reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
                }
            });
        });
    }

    private async fetchOEmbed(url: string): Promise<{ title: string; author_name: string } | null> {
        return new Promise((resolve) => {
            try {
                let targetUrl = url;
                try {
                    const u = new URL(url);
                    const v = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1) : null);
                    if (v) {
                        targetUrl = `https://www.youtube.com/watch?v=${v}`;
                    }
                } catch {}

                const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;
                const req = https.get(oembedUrl, { timeout: 6000 }, (res) => {
                    if (res.statusCode !== 200) {
                        res.resume();
                        return resolve(null);
                    }
                    let body = '';
                    res.on('data', (c) => body += c);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(body);
                            resolve({
                                title: json.title || '',
                                author_name: json.author_name || ''
                            });
                        } catch {
                            resolve(null);
                        }
                    });
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(null);
                });
            } catch {
                resolve(null);
            }
        });
    }

    async resolve(url: string, options: any): Promise<any> {
        let data: any;
        try {
            data = await this.runYtDlpJson([url]);
        } catch (err: any) {
            const errStr = String(err?.message || err);
            if (errStr.includes('Video unavailable') || errStr.includes('This video is not available') || errStr.includes('403')) {
                console.warn(`⚠️ [YouTubePlugin] Direct resolve failed for ${url} (${errStr.split('\n')[0]}). Attempting oEmbed title fallback...`);
                const info = await this.fetchOEmbed(url);
                if (info && info.title) {
                    const cleanAuthor = info.author_name.replace(/- Topic$/i, '').trim();
                    const searchQuery = `${info.title} ${cleanAuthor}`.trim();
                    console.log(`[YouTubePlugin] 🔄 Fallback searching YouTube for: "${searchQuery}"`);
                    const fallbackSong = await this.searchSong(searchQuery, options);
                    if (fallbackSong) {
                        console.log(`✅ [YouTubePlugin] Fallback successfully found playable song: ${fallbackSong.name} (${fallbackSong.url})`);
                        return fallbackSong;
                    }
                }
            }
            throw err;
        }

        if (data._type === 'playlist' || (data.entries && Array.isArray(data.entries))) {
            const songs = (data.entries || []).map((entry: any) => new SongClass({
                plugin: this,
                source: 'youtube',
                playFromSource: true,
                id: entry.id,
                name: entry.title,
                url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
                duration: entry.duration || 0,
                thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail,
                uploader: {
                    name: entry.uploader || entry.channel,
                    url: entry.uploader_url || entry.channel_url
                }
            }, options));

            return new PlaylistClass({
                source: 'youtube',
                songs,
                id: data.id,
                name: data.title,
                url: data.webpage_url || url,
                thumbnail: data.thumbnails?.[0]?.url || data.thumbnail
            }, options);
        }

        return new SongClass({
            plugin: this,
            source: 'youtube',
            playFromSource: true,
            id: data.id,
            name: data.title,
            url: data.webpage_url || (data.id ? `https://www.youtube.com/watch?v=${data.id}` : url),
            duration: data.duration || 0,
            thumbnail: data.thumbnails?.[0]?.url || data.thumbnail,
            uploader: {
                name: data.uploader || data.channel,
                url: data.uploader_url || data.channel_url
            }
        }, options);
    }

    async searchSong(query: string, options: any): Promise<any> {
        const data = await this.runYtDlpJson([`ytsearch1:${query}`]);
        const entry = data.entries ? data.entries[0] : data;
        if (!entry) return null;

        return new SongClass({
            plugin: this,
            source: 'youtube',
            playFromSource: true,
            id: entry.id,
            name: entry.title,
            url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`,
            duration: entry.duration || 0,
            thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail,
            uploader: {
                name: entry.uploader || entry.channel,
                url: entry.uploader_url || entry.channel_url
            }
        }, options);
    }

    async prefetch(song: any): Promise<void> {
        // Direct stream URLs from googlevideo.com are rejected with HTTP 403 Forbidden by YouTube CDN.
        // Playback is safely and efficiently streamed on-demand via the local proxy.
    }

    async getStreamURL(song: any): Promise<string> {
        const target = song.url || (song.id ? `https://www.youtube.com/watch?v=${song.id}` : null);
        if (!target) {
            throw new Error('Cannot get stream URL: Song has no valid URL or ID');
        }
        return `http://127.0.0.1:${this.port}/stream?q=${encodeURIComponent(target)}`;
    }

    async getRelatedSongs(song: any): Promise<any[]> {
        return [];
    }
}
