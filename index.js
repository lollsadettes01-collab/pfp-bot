const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { return { channels: {} }; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ── Client ────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const TYPES = ['pfp', 'gif', 'banner', 'female', 'male', 'anime'];
const TYPE_META = {
  pfp:    { label: 'Random PFP',    emoji: '🖼️', desc: 'Foto profilo casuali dei membri' },
  gif:    { label: 'Random GIF',    emoji: '🎞️', desc: 'Avatar animati dei membri'       },
  banner: { label: 'Random Banner', emoji: '🏞️', desc: 'Banner dei membri'               },
  female: { label: 'Female Icons',  emoji: '👩', desc: 'PFP femminili estetiche'         },
  male:   { label: 'Male Icons',    emoji: '👨', desc: 'PFP maschili estetici'           },
  anime:  { label: 'Anime Icons',   emoji: '🎌', desc: 'PFP anime estetici'              },
};

// ── Subreddit per tipo ────────────────────────────────────────────────────────
const SUBREDDITS = {
  female: [
    'PFP',
    'egirls',
    'DarkAestheticPFP',
    'alternativegirls',
    'GothStyle',
  ],
  male: [
    'PFP',
    'DarkAestheticPFP',
    'streetwear',
    'malefashion',
    'Faces',
  ],
};

// ── Slash Commands ────────────────────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Imposta il canale per un tipo di contenuto')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('tipo').setDescription('Tipo di contenuto').setRequired(true)
        .addChoices(...TYPES.map(t => ({ name: `${TYPE_META[t].emoji} ${TYPE_META[t].label}`, value: t })))
    )
    .addChannelOption(o =>
      o.setName('canale').setDescription('Canale dove inviare i contenuti').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('channels')
    .setDescription('Visualizza e gestisci i canali configurati')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

const pendingRemovals = new Map();

// ── UI Helpers ────────────────────────────────────────────────────────────────
function buildChannelsEmbed(cfg) {
  return new EmbedBuilder()
    .setTitle('⚙️  Configurazione Canali')
    .setColor(0x5865f2)
    .addFields(
      { name: '━━━━━  🧩 INTERACT  ━━━━━', value: '\u200b' },
      ...['pfp', 'gif', 'banner'].map(t => ({
        name: `${TYPE_META[t].emoji} ${TYPE_META[t].label}`,
        value: cfg.channels[t] ? `<#${cfg.channels[t]}>` : '`non impostato`',
        inline: true,
      })),
      { name: '━━━━━  🎸 ICONS  ━━━━━', value: '\u200b' },
      ...['female', 'male', 'anime'].map(t => ({
        name: `${TYPE_META[t].emoji} ${TYPE_META[t].label}`,
        value: cfg.channels[t] ? `<#${cfg.channels[t]}>` : '`non impostato`',
        inline: true,
      })),
    )
    .setFooter({ text: 'Usa il menu qui sotto per rimuovere • /setchannel per impostare' })
    .setTimestamp();
}

function buildRemoveMenu(cfg) {
  const configured = TYPES.filter(t => cfg.channels[t]);
  if (!configured.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('remove_select')
      .setPlaceholder('🗑️  Seleziona un canale da rimuovere...')
      .addOptions(configured.map(t => ({
        label: TYPE_META[t].label, description: TYPE_META[t].desc, value: t, emoji: TYPE_META[t].emoji,
      })))
  );
}

function buildConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm_remove').setLabel('Rimuovi').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cancel_remove').setLabel('Annulla').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
}

// ── Rate-limit-safe sender ────────────────────────────────────────────────────
const channelPaused = new Map();
async function safeSend(channel, payload, attempt = 0) {
  if (Date.now() < (channelPaused.get(channel.id) ?? 0)) return;
  try {
    await channel.send(payload);
  } catch (err) {
    if (err.status === 429) {
      const pauseMs = ((err.retryAfter ?? 5) + 1) * 1000;
      console.warn(`[RateLimit] #${channel.name} – pausa ${pauseMs}ms`);
      channelPaused.set(channel.id, Date.now() + pauseMs);
    } else if (err.status >= 500 && attempt < 3) {
      await sleep(2000 * (attempt + 1));
      return safeSend(channel, payload, attempt + 1);
    } else if (err.code === 50013) {
      console.warn(`[Permessi] Mancano permessi per #${channel.name}`);
    } else {
      console.error(`[Errore send] #${channel.name}:`, err.message);
    }
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function ts() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function makeEmbed(url, footer) {
  const e = new EmbedBuilder().setImage(url).setColor(0x2b2d31);
  if (footer) e.setFooter({ text: footer });
  return e;
}
function getChannel(id) {
  return id ? (client.channels.cache.get(id) ?? null) : null;
}

// ── Member Pool ───────────────────────────────────────────────────────────────
class MemberPool {
  constructor() { this.queues = { pfp: [], gif: [], banner: [] }; this.busy = false; }
  next(type) {
    const q = this.queues[type];
    if (!q.length) return null;
    const item = q.shift(); q.push(item); return item;
  }
  async refresh(guild) {
    if (this.busy) return;
    this.busy = true;
    try {
      const all = [...(await guild.members.fetch()).values()].filter(m => !m.user.bot);
      this.queues.pfp = shuffle(all).map(m => ({
        id: m.user.id,
        url: m.user.displayAvatarURL({ size: 1024, extension: 'png', forceStatic: true }),
      }));
      const animated = all.filter(m => m.user.avatar?.startsWith('a_'));
      const gifSrc   = animated.length >= 3 ? animated : all;
      this.queues.gif = shuffle(gifSrc).map(m => ({
        id: m.user.id,
        url: m.user.displayAvatarURL({ size: 1024, extension: animated.length >= 3 ? 'gif' : 'png' }),
      }));
      const banners = [];
      for (const m of shuffle(all)) {
        try {
          const u = await client.users.fetch(m.user.id, { force: true });
          if (u.banner) banners.push({ id: u.id, url: u.bannerURL({ size: 1024 }) });
        } catch { /* skip */ }
      }
      this.queues.banner = banners;
      console.log(`[Pool] pfp:${this.queues.pfp.length} | gif:${this.queues.gif.length} | banner:${this.queues.banner.length}`);
    } catch (err) {
      console.error('[Pool:refresh]', err.message);
    } finally { this.busy = false; }
  }
}

// ── Icon Pool ─────────────────────────────────────────────────────────────────
class IconPool {
  constructor() {
    this.queues  = { female: [], male: [], anime: [] };
    this.loading = { female: false, male: false, anime: false };
  }

  next(type) {
    const q = this.queues[type];
    if (!q.length) return null;
    const url = q.shift();
    q.push(url);
    return url;
  }

  async preload(type) {
    if (this.loading[type]) return;
    this.loading[type] = true;
    try {
      const urls = await this._fetchBatch(type);
      if (urls.length > 0) {
        this.queues[type] = shuffle(urls);
        console.log(`[IconPool:${type}] ✅ Caricati ${urls.length} immagini`);
      } else {
        console.warn(`[IconPool:${type}] ⚠️ Nessuna immagine caricata`);
      }
    } catch (err) {
      console.error(`[IconPool:${type}] Errore:`, err.message);
    } finally { this.loading[type] = false; }
  }

  async _fetchBatch(type) {
    if (type === 'anime') return this._fetchAnime();
    return this._fetchReddit(type);
  }

  async _fetchReddit(type) {
    const subs    = SUBREDDITS[type];
    const allUrls = [];

    for (const sub of subs) {
      try {
        // Alterna tra top/hot per varietà
        const sort = ['top', 'hot'][Math.floor(Math.random() * 2)];
        const time = ['month', 'week', 'all'][Math.floor(Math.random() * 3)];
        const url  = `https://www.reddit.com/r/${sub}/${sort}.json?limit=100&t=${time}`;

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; pfp-bot/2.0)',
            'Accept': 'application/json',
          },
        });

        if (!res.ok) {
          console.warn(`[Reddit] r/${sub} → HTTP ${res.status}`);
          continue;
        }

        const j = await res.json();
        const posts = j?.data?.children ?? [];

        const imgs = posts
          .map(p => p.data)
          .filter(d =>
            d.post_hint === 'image' &&
            !d.over_18 &&
            (d.url?.endsWith('.jpg') || d.url?.endsWith('.jpeg') || d.url?.endsWith('.png'))
          )
          .map(d => d.url);

        allUrls.push(...imgs);
        console.log(`[Reddit] r/${sub} → ${imgs.length} immagini`);
        await sleep(500); // gentile verso Reddit
      } catch (err) {
        console.error(`[Reddit] r/${sub}:`, err.message);
      }
    }

    return [...new Set(allUrls)];
  }

  async _fetchAnime() {
    const [females, males] = await Promise.all([
      this._fetchWaifuIm(),
      this._fetchNekos(),
    ]);
    return shuffle([...females, ...males]);
  }

  async _fetchWaifuIm() {
    const tags = ['waifu', 'maid', 'uniform'];
    const urls = [];
    for (const tag of tags) {
      try {
        const res = await fetch(
          `https://api.waifu.im/search/?included_tags=${tag}&height=%3E%3D500&limit=30`,
          { headers: { 'User-Agent': 'pfp-bot/2.0' } }
        );
        const j = await res.json();
        if (j.images) urls.push(...j.images.map(i => i.url));
      } catch { /* skip */ }
    }
    return urls;
  }

  async _fetchNekos() {
    const endpoints = ['husbando', 'shinobu'];
    const urls = [];
    for (const ep of endpoints) {
      try {
        const res = await fetch(
          `https://nekos.best/api/v2/${ep}?amount=20`,
          { headers: { 'User-Agent': 'pfp-bot/2.0' } }
        );
        const j = await res.json();
        if (j.results) urls.push(...j.results.map(r => r.url));
      } catch { /* skip */ }
    }
    return urls;
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
const memberPool = new MemberPool();
const iconPool   = new IconPool();

function startTasks(guild) {
  setInterval(async () => {
    const ch = getChannel(loadConfig().channels.pfp);
    if (!ch) return;
    const item = memberPool.next('pfp');
    if (!item) return;
    await safeSend(ch, { embeds: [makeEmbed(item.url, `User ID: ${item.id} | Today at ${ts()}`)] });
  }, 4000);

  setInterval(async () => {
    const ch = getChannel(loadConfig().channels.gif);
    if (!ch) return;
    const item = memberPool.next('gif');
    if (!item) return;
    await safeSend(ch, { embeds: [makeEmbed(item.url, `User ID: ${item.id} | Today at ${ts()}`)] });
  }, 8000);

  setInterval(async () => {
    const ch = getChannel(loadConfig().channels.banner);
    if (!ch) return;
    const item = memberPool.next('banner');
    if (!item) return;
    await safeSend(ch, { embeds: [makeEmbed(item.url, `User ID: ${item.id} | Today at ${ts()}`)] });
  }, 12000);

  for (const type of ['female', 'male', 'anime']) {
    setInterval(async () => {
      const ch = getChannel(loadConfig().channels[type]);
      if (!ch) return;
      if (iconPool.queues[type].length < 10) {
        iconPool.preload(type).catch(console.error);
      }
      const url = iconPool.next(type);
      if (!url) return;
      await safeSend(ch, { embeds: [makeEmbed(url)] });
    }, 3000);
  }

  memberPool.refresh(guild);
  setInterval(() => memberPool.refresh(guild), 10 * 60 * 1000);

  // Refresh batch icon ogni 2 ore
  setInterval(async () => {
    for (const type of ['female', 'male', 'anime']) {
      iconPool.queues[type] = [];
      iconPool.preload(type).catch(console.error);
    }
  }, 2 * 60 * 60 * 1000);
}

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Online come ${client.user.tag}`);
  const rest    = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const guildId = process.env.GUILD_ID;
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
    console.log('✅ Comandi slash registrati');
  } catch (err) { console.error('[Comandi]', err.message); }

  const guild = await client.guilds.fetch(guildId);

  console.log('[IconPool] Precaricamento immagini...');
  await Promise.all(['female', 'male', 'anime'].map(t => iconPool.preload(t)));
  console.log('[IconPool] ✅ Precaricamento completato');

  startTasks(guild);
});

// ── Interaction handler ───────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'setchannel') {
    const tipo   = interaction.options.getString('tipo');
    const canale = interaction.options.getChannel('canale');
    const cfg    = loadConfig();
    const prev   = cfg.channels[tipo];
    cfg.channels[tipo] = canale.id;
    saveConfig(cfg);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('✅  Canale aggiornato')
        .addFields(
          { name: 'Tipo',   value: `${TYPE_META[tipo].emoji} ${TYPE_META[tipo].label}`, inline: true },
          { name: 'Canale', value: `<#${canale.id}>`, inline: true },
        )
        .setFooter({ text: prev ? `Sostituisce: <#${prev}>` : 'Nessun canale precedente' })
        .setTimestamp()],
      ephemeral: true,
    });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'channels') {
    const cfg       = loadConfig();
    const removeRow = buildRemoveMenu(cfg);
    return interaction.reply({
      embeds: [buildChannelsEmbed(cfg)],
      components: removeRow ? [removeRow] : [],
      ephemeral: true,
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'remove_select') {
    const tipo = interaction.values[0];
    pendingRemovals.set(interaction.message.id, tipo);
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('⚠️  Conferma rimozione')
        .setDescription(`Stai per rimuovere il canale per **${TYPE_META[tipo].emoji} ${TYPE_META[tipo].label}**.\n\nSei sicuro?`)],
      components: [buildConfirmRow()],
    });
  }

  if (interaction.isButton() && interaction.customId === 'confirm_remove') {
    const tipo = pendingRemovals.get(interaction.message.id);
    if (!tipo) return interaction.update({ content: '❌ Sessione scaduta.', embeds: [], components: [] });
    const cfg = loadConfig();
    delete cfg.channels[tipo];
    saveConfig(cfg);
    pendingRemovals.delete(interaction.message.id);
    const newCfg    = loadConfig();
    const removeRow = buildRemoveMenu(newCfg);
    return interaction.update({
      embeds: [
        new EmbedBuilder().setColor(0x57f287).setTitle('🗑️  Rimosso con successo')
          .setDescription(`Il canale per **${TYPE_META[tipo].emoji} ${TYPE_META[tipo].label}** è stato rimosso.`),
        buildChannelsEmbed(newCfg),
      ],
      components: removeRow ? [removeRow] : [],
    });
  }

  if (interaction.isButton() && interaction.customId === 'cancel_remove') {
    pendingRemovals.delete(interaction.message.id);
    const cfg       = loadConfig();
    const removeRow = buildRemoveMenu(cfg);
    return interaction.update({
      embeds: [buildChannelsEmbed(cfg)],
      components: removeRow ? [removeRow] : [],
    });
  }
});

// ── Error handling ────────────────────────────────────────────────────────────
process.on('unhandledRejection', err => console.error('[UnhandledRejection]', err));
process.on('uncaughtException',  err => console.error('[UncaughtException]',  err));
client.on('error', err => console.error('[ClientError]', err));

client.login(process.env.TOKEN);
