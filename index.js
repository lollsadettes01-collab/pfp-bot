const { Client } = require('discord.js-selfbot-v13');

// ─── CONFIG ───────────────────────────────────────────────
const TOKEN    = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VANITY   = 'boytoy';
const CHECK_MS = 8000;
// ──────────────────────────────────────────────────────────

let client;
let lastStatus = null;
let isReclaiming = false;
let guardInterval = null;

function createClient() {
  client = new Client({ checkUpdate: false });

  client.on('ready', () => {
    console.log(`[Vanity Guard] ✅ Loggato come ${client.user.tag}`);
    console.log(`[Vanity Guard] Monitorando: discord.gg/${VANITY}`);
    lastStatus = null;
    isReclaiming = false;
    startGuard();
  });

  client.on('disconnect', () => {
    console.warn('[Vanity Guard] Disconnesso. Riconnessione in 5s...');
    stopGuard();
    setTimeout(reconnect, 5000);
  });

  client.on('error', (err) => {
    console.error(`[Vanity Guard] Errore client: ${err.message}`);
  });

  process.on('unhandledRejection', (err) => {
    console.error(`[Vanity Guard] UnhandledRejection: ${err?.message}`);
  });

  client.login(TOKEN).catch((err) => {
    console.error(`[Vanity Guard] Login fallito: ${err.message}. Riprovo in 10s...`);
    setTimeout(reconnect, 10000);
  });
}

function reconnect() {
  console.log('[Vanity Guard] Tentativo di riconnessione...');
  stopGuard();
  try { client.destroy(); } catch (_) {}
  createClient();
}

function startGuard() {
  stopGuard();
  guardInterval = setInterval(async () => {
    if (isReclaiming) return;
    await checkAndReclaim();
  }, CHECK_MS);
}

function stopGuard() {
  if (guardInterval) {
    clearInterval(guardInterval);
    guardInterval = null;
  }
}

async function checkAndReclaim() {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const vanityData = await guild.fetchVanityData().catch(() => null);
    const current = vanityData?.code?.toLowerCase() ?? null;

    if (current === VANITY.toLowerCase()) {
      if (lastStatus !== 'ok') {
        console.log(`[Vanity Guard] ✅ Vanity attiva: discord.gg/${VANITY}`);
        lastStatus = 'ok';
      }
      return;
    }

    console.log(`[Vanity Guard] ⚠️ Vanity non corrisponde (attuale: ${current}). Reclamo...`);
    isReclaiming = true;
    await reclaimVanity(guild);

  } catch (err) {
    console.error(`[Vanity Guard] Errore check: ${err.message}`);
    isReclaiming = false;
  }
}

async function reclaimVanity(guild) {
  try {
    await guild.setVanityCode(VANITY);
    console.log(`[Vanity Guard] ✅ Vanity reclamata!`);
    lastStatus = 'reclaimed';
    await sendDM(`✅ **Vanity reclamata!**\n\`discord.gg/${VANITY}\` è stata riapplicata con successo.`);
  } catch (err) {
    console.warn(`[Vanity Guard] ⚠️ Reclamo fallito: ${err.message}. Riprovo al prossimo ciclo...`);
  } finally {
    isReclaiming = false;
  }
}

async function sendDM(message) {
  try {
    const me = await client.users.fetch(client.user.id);
    const dm = await me.createDM();
    await dm.send(message);
    console.log(`[Vanity Guard] 📬 DM inviato.`);
  } catch (err) {
    console.error(`[Vanity Guard] DM fallito: ${err.message}`);
  }
}

createClient();
