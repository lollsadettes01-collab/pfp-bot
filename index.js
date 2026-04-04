require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, REST, Routes } = require('discord.js');
const mongoose = require('mongoose');
const winston  = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

const imageSchema = new mongoose.Schema({
  url:       { type: String, required: true, unique: true },
  category:  { type: String, required: true, enum: ['girl','boy','anime_female','anime_male'] },
  used:      { type: Boolean, default: false },
  fetchedAt: { type: Date, default: Date.now },
  sentAt:    { type: Date, default: null },
  failCount: { type: Number, default: 0 },
}, { timestamps: true });
imageSchema.index({ used: 1, category: 1, fetchedAt: 1 });
const Image = mongoose.model('Image', imageSchema);

const channelConfigSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  category:  { type: String, required: true, enum: ['girl','boy','anime_female','anime_male'] },
  channelId: { type: String, required: true },
  setBy:     { type: String, default: null },
}, { timestamps: true });
channelConfigSchema.index({ guildId: 1, category: 1 }, { unique: true });
const ChannelConfig = mongoose.model('ChannelConfig', channelConfigSchema);

async function connectDB() {
  for (let i = 0; i < 10; i++) {
    try { await mongoose.connect(process.env.MONGODB_URI); logger.info('✅ MongoDB connected'); return; }
    catch (err) { logger.warn(`MongoDB retry ${i+1}/10...`); await new Promise(r => setTimeout(r, 5000)); }
  }
  logger.error('❌ MongoDB failed'); process.exit(1);
}

const SEARCH_QUERIES = [
  { query: 'girl pfp',       category: 'girl'         },
  { query: 'boy pfp',        category: 'boy'          },
  { query: 'anime girl pfp', category: 'anime_female' },
  { query: 'anime boy pfp',  category: 'anime_male'   },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

const bookmarks = {};
for (const { query } of SEARCH_QUERIES) bookmarks[query] = [];
const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const sleep    = ms => new Promise(r => setTimeout(r, ms));

function extractImageUrl(pin) {
  try {
    const images = pin.images;
    if (!images) return null;
    for (const size of ['orig','736x','474x','236x']) {
      if (images[size]?.url && /\.(jpg|jpeg|png|webp)/i.test(images[size].url)) return images[size].url;
    }
    return Object.values(images).find(img => img?.url)?.url ?? null;
  } catch { return null; }
}

async function fetchViaAPI(query, pageSize = 50) {
  const currentBookmark = bookmarks[query].at(-1) ?? null;
  const options = { isPrefetch: false, query, scope: 'pins', no_fetch_context_on_resource: false, page_size: pageSize,
    ...(currentBookmark && currentBookmark !== '-end-' ? { bookmarks: [currentBookmark] } : {}),
  };
  const requestUrl = new URL('https://www.pinterest.com/resource/BaseSearchResource/get/');
  requestUrl.searchParams.set('source_url', `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`);
  requestUrl.searchParams.set('data', JSON.stringify({ options, context: {} }));
  requestUrl.searchParams.set('_', Date.now().toString());
  const headers = {
    'User-Agent': randomUA(), 'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9', 'X-Requested-With': 'XMLHttpRequest',
    'X-Pinterest-AppState': 'active', 'Referer': `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
  };
  if (process.env.PINTEREST_SESSION) headers['Cookie'] = `_pinterest_sess=${process.env.PINTEREST_SESSION}`;
  const res = await fetch(requestUrl.toString(), { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Pinterest API ${res.status}`);
  const json = await res.json();
  const rr = json?.resource_response;
  if (!rr || rr.status !== 'success') throw new Error(`Pinterest: ${rr?.message ?? 'unknown'}`);
  return { urls: (rr.data?.results ?? []).map(extractImageUrl).filter(Boolean), nextBookmark: rr.bookmark ?? null };
}

async function fetchAndSave({ query, category }) {
  let urls = [], nextBookmark = null;
  try { ({ urls, nextBookmark } = await fetchViaAPI(query)); }
  catch (err) { logger.warn(`[Fetcher] Failed "${query}": ${err.message}`); return 0; }
  if (nextBookmark && nextBookmark !== '-end-') {
    bookmarks[query].push(nextBookmark);
    if (bookmarks[query].length > 100) bookmarks[query] = bookmarks[query].slice(-100);
  } else if (nextBookmark === '-end-') { bookmarks[query] = []; }
  if (!urls.length) return 0;
  let count = 0;
  for (let i = 0; i < urls.length; i += 20) {
    const ops = urls.slice(i, i+20).map(url => ({
      updateOne: { filter: { url }, update: { $setOnInsert: { url, category, used: false, fetchedAt: new Date() } }, upsert: true }
    }));
    try { const r = await Image.bulkWrite(ops, { ordered: false }); count += r.upsertedCount; }
    catch (e) { if (e.code !== 11000) logger.error('[Fetcher] bulkWrite: ' + e.message); }
  }
  return count;
}

async function runFetchCycle() {
  logger.info('[Fetcher] 🔍 Fetching...');
  let total = 0;
  for (const q of SEARCH_QUERIES) {
    await sleep(Math.floor(Math.random()*3000)+2000);
    const n = await fetchAndSave(q);
    total += n;
    logger.info(`[Fetcher] "${q.query}" → +${n}`);
  }
  const queue = await Image.countDocuments({ used: false });
  logger.info(`[Fetcher] ✅ Done. +${total} new. Queue: ${queue}`);
}

async function emergencyFetch() { logger.warn('[Fetcher] ⚠️ Emergency!'); await runFetchCycle(); }
function startFetcher() {
  const interval = parseInt(process.env.FETCH_INTERVAL_MS ?? '45000', 10);
  runFetchCycle();
  setInterval(() => runFetchCycle().catch(e => logger.error(e.message)), interval);
}

const CATEGORY_META = {
  girl:         { emoji: '👧', color: 0xFF85A1, label: 'Girl PFP'         },
  boy:          { emoji: '👦', color: 0x5B9BD5, label: 'Boy PFP'          },
  anime_female: { emoji: '🌸', color: 0xFF6B9D, label: 'Anime Female PFP' },
  anime_male:   { emoji: '⚔️', color: 0x7B68EE, label: 'Anime Male PFP'   },
};

async function isReachable(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch { return false; }
}

async function sendForCategory(client, category, channelId) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) return;
  const queue = await Image.countDocuments({ category, used: false });
  if (queue === 0) { emergencyFetch(); return; }
  if (queue < parseInt(process.env.LOW_QUEUE_THRESHOLD ?? '20', 10)) emergencyFetch();
  const image = await Image.findOneAndUpdate(
    { category, used: false, failCount: { $lt: 3 } },
    { $set: { used: true, sentAt: new Date() } },
    { sort: { fetchedAt: 1 }, new: true }
  );
  if (!image) return;
  if (!await isReachable(image.url)) { await Image.updateOne({ _id: image._id }, { $inc: { failCount: 1 } }); return; }
  const meta = CATEGORY_META[category];
  const embed = new EmbedBuilder().setColor(meta.color).setTitle(`${meta.emoji}  ${meta.label}`).setImage(image.url).setFooter({ text: `📦 ${queue-1} in queue` }).setTimestamp();
  try { await channel.send({ embeds: [embed] }); }
  catch (err) { logger.error(`[Sender] ${category}: ${err.message}`); }
}

async function sendTick(client) {
  const configs = await ChannelConfig.find({});
  if (!configs.length) { logger.warn('[Sender] No channels configured! Use /setchannel'); return; }
  for (const cfg of configs) {
    try { await sendForCategory(client, cfg.category, cfg.channelId); }
    catch (err) { logger.error(`[Sender] ${cfg.category}: ${err.message}`); }
  }
}

async function loadGuildConfig(guildId) {
  const docs = await ChannelConfig.find({ guildId });
  return Object.fromEntries(docs.map(d => [d.category, d.channelId]));
}

async function buildOverviewEmbed(guild, config) {
  const lines = await Promise.all(
    Object.entries(CATEGORY_META).map(async ([key, meta]) => {
      const ch = config[key];
      const q  = await Image.countDocuments({ category: key, used: false });
      return `${meta.emoji} **${meta.label}**\n┗ ${ch ? `<#${ch}>` : '⚠️ *Not set*'} · 📦 ${q} in queue`;
    })
  );
  const allSet = Object.keys(CATEGORY_META).every(k => config[k]);
  return new EmbedBuilder()
    .setTitle('📡  PFP Channel Routing')
    .setDescription(allSet ? '✅ All categories configured!' : '⚠️ Some categories have no channel.')
    .addFields({ name: '╔═══ Assignments ═══╗', value: lines.join('\n\n') })
    .setColor(allSet ? 0x57F287 : 0xFEE75C)
    .setFooter({ text: `${guild.name} · /setchannel to edit` })
    .setTimestamp();
}

function buildCategoryMenu(id) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`sc_cat_${id}`).setPlaceholder('🎯 Choose a category...')
      .addOptions(Object.entries(CATEGORY_META).map(([value, m]) => ({ label: m.label, value, emoji: m.emoji })))
  );
}

async function handleSetChannel(interaction) {
  const embed = new EmbedBuilder().setTitle('🎨  Set Channel — Step 1 of 2')
    .setDescription('> Select which **category** to configure.')
    .addFields(...Object.entries(CATEGORY_META).map(([,m]) => ({ name: `${m.emoji} ${m.label}`, value: '\u200b', inline: true })))
    .setColor(0x5865F2).setFooter({ text: 'Step 1 of 2 — Choose a category' });
  await interaction.reply({ embeds: [embed], components: [buildCategoryMenu(interaction.id)], ephemeral: true });
}

async function handleChannels(interaction) {
  const config = await loadGuildConfig(interaction.guildId);
  await interaction.reply({ embeds: [await buildOverviewEmbed(interaction.guild, config)], ephemeral: true });
}

async function handleComponent(interaction) {
  const { customId, guildId, guild, user } = interaction;

  if (customId.startsWith('sc_cat_')) {
    const cat  = interaction.values[0];
    const id   = customId.replace('sc_cat_', '');
    const cfg  = await loadGuildConfig(guildId);
    const meta = CATEGORY_META[cat];
    const embed = new EmbedBuilder().setTitle(`${meta.emoji}  Set Channel — Step 2 of 2`)
      .setDescription(`> **${meta.label}** selected.\n> Now pick the channel.`)
      .addFields({ name: 'Currently', value: cfg[cat] ? `<#${cfg[cat]}>` : '⚠️ None', inline: true })
      .setColor(meta.color).setFooter({ text: 'Step 2 of 2 — Choose a channel' });
    const chMenu = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(`sc_ch_${cat}_${id}`).setPlaceholder('📺 Choose a channel...').addChannelTypes(ChannelType.GuildText)
    );
    const back = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sc_back_${id}`).setLabel('← Back').setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ embeds: [embed], components: [chMenu, back] });
    return;
  }

  if (customId.startsWith('sc_ch_')) {
    const parts = customId.replace('sc_ch_', '').split('_');
    const cat   = parts.slice(0, -1).join('_');
    const channelId = interaction.values[0];
    await ChannelConfig.findOneAndUpdate({ guildId, category: cat }, { channelId, setBy: user.id }, { upsert: true, new: true });
    const meta = CATEGORY_META[cat];
    const successEmbed = new EmbedBuilder().setTitle('✅  Channel Set!').setDescription(`**${meta.emoji} ${meta.label}** → <#${channelId}>`).setColor(meta.color).setTimestamp();
    const overviewEmbed = await buildOverviewEmbed(guild, await loadGuildConfig(guildId));
    const btns = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sc_restart_${interaction.id}`).setLabel('Configure another').setEmoji('🔁').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`sc_done_${interaction.id}`).setLabel('Done').setEmoji('✅').setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({ embeds: [successEmbed, overviewEmbed], components: [btns] });
    return;
  }

  if (customId.startsWith('sc_back_')) {
    const id = customId.replace('sc_back_', '');
    const embed = new EmbedBuilder().setTitle('🎨  Set Channel — Step 1 of 2').setDescription('> Select which **category** to configure.').setColor(0x5865F2);
    await interaction.update({ embeds: [embed], components: [buildCategoryMenu(id)] });
    return;
  }

  if (customId.startsWith('sc_restart_')) {
    const embed = new EmbedBuilder().setTitle('🎨  Set Channel — Step 1 of 2').setDescription('> Select which **category** to configure.').setColor(0x5865F2);
    await interaction.update({ embeds: [embed], components: [buildCategoryMenu(interaction.id)] });
    return;
  }

  if (customId.startsWith('sc_done_')) {
    const config = await loadGuildConfig(guildId);
    await interaction.update({ embeds: [await buildOverviewEmbed(guild, config)], components: [] });
    return;
  }
}

async function main() {
  logger.info('🤖 Discord PFP Bot starting...');
  const required = ['DISCORD_TOKEN','DISCORD_CLIENT_ID','MONGODB_URI'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) { logger.error('Missing env: ' + missing.join(', ')); process.exit(1); }

  await connectDB();
  startFetcher();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', async () => {
    logger.info(`✅ Logged in as ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
      await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: [
        { name: 'setchannel', description: '🎨 Configure which channel each PFP category is sent to', default_member_permissions: String(PermissionFlagsBits.ManageChannels) },
        { name: 'channels',   description: '📡 View current PFP channel routing' },
      ]});
      logger.info('[Commands] ✅ Registered');
    } catch (err) { logger.error('[Commands] Failed: ' + err.message); }

    let sending = false;
    setInterval(async () => {
      if (sending) return;
      sending = true;
      try { await sendTick(client); }
      catch (err) { logger.error('[Sender] ' + err.message); }
      finally { sending = false; }
    }, parseInt(process.env.SEND_INTERVAL_MS ?? '3000', 10));

    logger.info('✅ All systems running! Use /setchannel to configure.');
  });

  client.on('interactionCreate', async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setchannel') return await handleSetChannel(interaction);
        if (interaction.commandName === 'channels')   return await handleChannels(interaction);
      }
      if ((interaction.isStringSelectMenu() || interaction.isChannelSelectMenu() || interaction.isButton()) && interaction.customId.startsWith('sc_')) {
        return await handleComponent(interaction);
      }
    } catch (err) {
      logger.error('[Interaction] ' + err.message);
      try {
        const msg = { content: '❌ Error. Try again.', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
        else await interaction.reply(msg);
      } catch {}
    }
  });

  client.on('error', err => logger.error('Discord error: ' + err.message));
  process.on('SIGTERM', () => { logger.info('Shutting down...'); process.exit(0); });
  process.on('SIGINT',  () => { logger.info('Shutting down...'); process.exit(0); });
  process.on('uncaughtException',  err => logger.error('Uncaught: '  + err.message));
  process.on('unhandledRejection', r   => logger.error('Unhandled: ' + String(r)));

  await client.login(process.env.DISCORD_TOKEN);
}

main();
