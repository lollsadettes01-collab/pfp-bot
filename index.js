const {
  Client, GatewayIntentBits, EmbedBuilder,
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Config (auto-creata, non devi toccarla) ───────────────────────────────────
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

// ── Tipi e label ──────────────────────────────────────────────────────────────
const TYPES = ['pfp', 'gif', 'banner', 'female', 'male', 'anime'];

const TYPE_META = {
  pfp:    { label: 'Random PFP',    emoji: '🖼️',  desc: 'Foto profilo casuali dei membri' },
  gif:    { label: 'Random GIF',    emoji: '🎞️',  desc: 'Avatar animati dei membri'       },
  banner: { label: 'Random Banner', emoji: '🏞️',  desc: 'Banner dei membri'               },
  female: { label: 'Female Icons',  emoji: '👩',  desc: 'PFP femminili (esterni)'         },
  male:   { label: 'Male Icons',    emoji: '👨',  desc: 'PFP maschili (esterni)'          },
  anime:  { label: 'Anime Icons',   emoji: '🎌',  desc: 'PFP anime (esterni)'             },
};

// ── Slash Commands ────────────────────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Imposta il canale per un tipo di contenuto')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o =>
      o.setName('tipo')
        .setDescription('Tipo di contenuto')
        .setRequired(true)
        .addChoices(...TYPES.map(t => ({ name: `${TYPE_META[t].emoji} ${TYPE_META[t].label}`, value: t })))
    )
    .addChannelOption(o =>
      o.setName('canale')
        .setDescription('Canale dove inviare i contenuti')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('channels')
    .setDescription('Visualizza e gestisci i canali configurati')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

// ── Pending state ─────────────────────────────────────────────────────────────
const pendingRemovals = new Map();

// ── Embed helper: pannello canali ─────────────────────────────────────────────
function buildChannelsEmbed(cfg) {
  const interactFields = ['pfp', 'gif', 'banner'].map(t => ({
    name: `${TYPE_META[t].emoji} ${TYPE_META[t].label}`,
    value: cfg.channels[t] ? `<#${cfg.channels[t]}>` : '`non impostato`',
    inline: true,
  }));
  const iconsFields = ['female', 'male', 'anime'].map(t => ({
    name: `${TYPE_META[t].emoji} ${TYPE_META[t].label}`,
    value: cfg.channels[t] ? `<#${cfg.channels[t]}>` : '`non impostato`',
    inline: true,
  }));

  return new EmbedBuilder()
    .setTitle('⚙️  Configurazione Canali')
    .setColor(0x5865f2)
    .addFields(
      { name: '━━━━━  🧩 INTERACT  ━━━━━', value: '\u200b' },
      ...interactFields,
      { name: '━━━━━  🎸 ICONS  ━━━━━', value: '\u200b' },
      ...iconsFields,
    )
    .setFooter({ text: 'Usa il menu qui sotto per rimuovere • /setchannel per impostare' })
    .setTimestamp();
}

function buildRemoveMenu(cfg) {
  const configured = TYPES.filter(t => cfg.channels[t]);
  if (configured.length === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('remove_select')
    .setPlaceholder('🗑️  Seleziona un canale da rimuovere...')
    .addOptions(configured.map(t => ({
      label: TYPE_META[t].label,
      description: TYPE_META[t].desc,
      value: t,
      emoji: TYPE_META[t].emoji,
    })));
  return new ActionRowBuilder().addComponents(menu);
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
  constructor() {
    this.queues = { pfp: [], gif: [], banner: [] };
    this.busy = false;
  }
  next(type) {
    const q = this.queues[type];
    if (!q.length) return null;
    const item = q.shift();
    q.push(item);
    return item;
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
    } finally {
      this.busy = false;
    }
  }
}

// ── Icon Pool ─────────────────────────────────────────────────────────────────
class IconPool {
  constructor() {
    this.seen = { female: new Set(), male: new Set(), anime: new Set() };
  }

  async fetch(type) {
    let url, attempts = 0;
    do {
      url = await this._raw(type);
      attempts++;
    } while (this.seen[type].has(url) && attempts < 5);
    this.seen[type].add(url);
    if (this.seen[type].size >= 500) {
      this.seen[type].clear();
      console.log(`[IconPool:${type}] Ring buffer resettato`);
    }
    return url;
  }

  async _raw(type) {
    // ── ANIME: mix maschi e femmine ──────────────────────────────────────────
    if (type === 'anime') {
      const endpoints = [
        // Femmine
        'https://nekos.best/api/v2/waifu',
        'https://nekos.best/api/v2/neko',
        'https://nekos.best/api/v2/kitsune',
        // Maschi
        'https://nekos.best/api/v2/husbando',
      ];
      const ep  = endpoints[Math.floor(Math.random() * endpoints.length)];
      const res = await fetch(ep, { headers: { 'User-Agent': 'pfp-bot/1.0' } });
      const j   = await res.json();
      return j.results[0].url;
    }

    // ── FEMALE & MALE: Reddit PFP estetiche ──────────────────────────────────
    const subs = {
      female: ['VintagePFPs', 'PFP', 'DarkAestheticPFP', 'PFPart'],
      male:   ['PFP', 'DarkAestheticPFP', 'PFPart', 'maleprofiles'],
    };
    const sub = subs[type][Math.floor(Math.random() * subs[type].length)];
    const res = await fetch(
      `https://www.reddit.com/r/${sub}/top.json?limit=100&t=month`,
      { headers: { 'User-Agent': 'pfp-bot/1.0' } }
    );
    const j     = await res.json();
    const posts = j?.data?.children?.filter(p =>
      p.data.post_hint === 'image' && !p.data.over_18
    ) ?? [];
    if (!posts.length) throw new Error(`Nessuna immagine da r/${sub}`);
    const post = posts[Math.floor(Math.random() * posts.length)];
    return post.data.url;
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
      try {
        const url = await iconPool.fetch(type);
        await safeSend(ch, { embeds: [makeEmbed(url)] });
      } catch (err) {
        console.error(`[Icons:${type}]`, err.message);
      }
    }, 3000);
  }

  memberPool.refresh(guild);
  setInterval(() => memberPool.refresh(guild), 10 * 60 * 1000);
}

// ── Ready ─────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Online come ${client.user.tag}`);
  const rest    = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const guildId = process.env.GUILD_ID;
  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
    console.log('✅ Comandi slash registrati');
  } catch (err) {
    console.error('[Comandi]', err.message);
  }
  const guild = await client.guilds.fetch(guildId);
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
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('✅  Canale aggiornato')
      .addFields(
        { name: 'Tipo',   value: `${TYPE_META[tipo].emoji} ${TYPE_META[tipo].label}`, inline: true },
        { name: 'Canale', value: `<#${canale.id}>`, inline: true },
      )
      .setFooter({ text: prev ? `Sostituisce: <#${prev}>` : 'Nessun canale precedente' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'channels') {
    const cfg       = loadConfig();
    const embed     = buildChannelsEmbed(cfg);
    const removeRow = buildRemoveMenu(cfg);
    return interaction.reply({ embeds: [embed], components: removeRow ? [removeRow] : [], ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'remove_select') {
    const tipo = interaction.values[0];
    pendingRemovals.set(interaction.message.id, tipo);
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⚠️  Conferma rimozione')
      .setDescription(`Stai per rimuovere il canale per **${TYPE_META[tipo].emoji} ${TYPE_META[tipo].label}**.\n\nSei sicuro?`);
    return interaction.update({ embeds: [embed], components: [buildConfirmRow()] });
  }

  if (interaction.isButton() && interaction.customId === 'confirm_remove') {
    const tipo = pendingRemovals.get(interaction.message.id);
    if (!tipo) return interaction.update({ content: '❌ Sessione scaduta.', embeds: [], components: [] });
    const cfg = loadConfig();
    delete cfg.channels[tipo];
    saveConfig(cfg);
    pendingRemovals.delete(interaction.message.id);
    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🗑️  Rimosso con successo')
      .setDescription(`Il canale per **${TYPE_META[tipo].emoji} ${TYPE_META[tipo].label}** è stato rimosso.`);
    const newCfg    = loadConfig();
    const mainEmbed = buildChannelsEmbed(newCfg);
    const removeRow = buildRemoveMenu(newCfg);
    return interaction.update({ embeds: [successEmbed, mainEmbed], components: removeRow ? [removeRow] : [] });
  }

  if (interaction.isButton() && interaction.customId === 'cancel_remove') {
    pendingRemovals.delete(interaction.message.id);
    const cfg       = loadConfig();
    const embed     = buildChannelsEmbed(cfg);
    const removeRow = buildRemoveMenu(cfg);
    return interaction.update({ embeds: [embed], components: removeRow ? [removeRow] : [] });
  }
});

// ── Error handling globale ────────────────────────────────────────────────────
process.on('unhandledRejection', err => console.error('[UnhandledRejection]', err));
process.on('uncaughtException',  err => console.error('[UncaughtException]',  err));
client.on('error', err => console.error('[ClientError]', err));

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
