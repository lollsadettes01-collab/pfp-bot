const express = require('express');
const axios = require('axios');

// ========== LEGGI VARIABILI ==========
const TOKEN = process.env.TOKEN?.trim();
const GUILD_ID = process.env.GUILD_ID?.trim();
const VANITY_URL = process.env.VANITY_URL?.trim();

if (!TOKEN || !GUILD_ID || !VANITY_URL) {
  console.error('❌ Manca TOKEN, GUILD_ID o VANITY_URL nelle variabili d\'ambiente');
  process.exit(1);
}

// ========== SERVER KEEP-ALIVE ==========
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Sniper attivo'));
app.listen(PORT, () => console.log(`✅ Keep-alive su porta ${PORT}`));

// ========== CONFIGURAZIONE SNIPER ==========
const MIN_INTERVAL = 2000;
const MAX_INTERVAL = 10000;
let currentInterval = MIN_INTERVAL;

// Funzione per generare intervallo casuale
function getRandomInterval() {
  return Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1) + MIN_INTERVAL);
}

// Test rapido dei permessi sulla guild (opzionale)
async function testGuildPermissions() {
  try {
    const res = await axios.get(`https://discord.com/api/v9/guilds/${GUILD_ID}`, {
      headers: { 'Authorization': TOKEN }
    });
    console.log(`✅ Server: ${res.data.name} (owner: ${res.data.owner_id === (await axios.get('https://discord.com/api/v9/users/@me', { headers: { 'Authorization': TOKEN } })).data.id})`);
    console.log(`   Boost livello: ${res.data.premium_tier}`);
    if (res.data.premium_tier < 3) {
      console.warn(`⚠️ ATTENZIONE: Il server ha livello ${res.data.premium_tier}, serve livello 3 per vanity URL!`);
    }
  } catch (err) {
    console.error(`⚠️ Non riesco a leggere i dati del server: ${err.response?.status} - ${JSON.stringify(err.response?.data)}`);
  }
}

// Funzione principale di snipe
async function snipeVanity() {
  try {
    const response = await axios.patch(
      `https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`,
      { code: VANITY_URL },
      {
        headers: {
          'Authorization': TOKEN,   // solo il token, niente "Bot " o "Bearer "
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );
    console.log(`🎯 VANITY CATTURATO!`, response.data);
    process.exit(0);
  } catch (error) {
    const status = error.response?.status;
    const data = error.response?.data;
    
    // Log dettagliato dell'errore
    console.error(`❌ Errore HTTP ${status}:`, JSON.stringify(data, null, 2));
    
    if (status === 429) {
      const retryAfter = data.retry_after;
      console.log(`⏳ Rate limit: aspetto ${retryAfter}s`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return currentInterval; // usa lo stesso intervallo
    } else if (status === 401) {
      console.error(`❌ 401 Unauthorized – Il token non ha i permessi necessari per questa azione.`);
      console.error(`   Verifica che l'account sia OWNER del server e che il server sia boostato livello 3.`);
      console.error(`   Se tutto è ok, prova a generare un nuovo token.`);
      process.exit(1); // Ferma tutto, non ha senso continuare
    } else if (status === 400 && data.code === 50069) {
      console.log(`🔍 Vanity "${VANITY_URL}" non disponibile.`);
      // Riduci gradualmente l'intervallo se stava aumentando
      if (currentInterval > MIN_INTERVAL) {
        currentInterval = Math.max(currentInterval * 0.95, MIN_INTERVAL);
      }
      return getRandomInterval();
    } else if (status === 403) {
      console.error(`❌ 403 Forbidden – Mancano i permessi "Manage Server" o il server non è boostato livello 3.`);
      process.exit(1);
    } else {
      console.error(`⚠️ Errore imprevisto, riprovo tra 30s`);
      return 30000;
    }
  }
}

async function mainLoop() {
  console.log(`🚀 Sniper avviato per "${VANITY_URL}" sul server ${GUILD_ID}`);
  await testGuildPermissions(); // diagnostic info
  
  while (true) {
    const waitTime = await snipeVanity();
    const jitter = waitTime * (0.9 + Math.random() * 0.2);
    console.log(`⏱️ Prossimo tentativo tra ${Math.round(jitter/1000)}s`);
    await new Promise(resolve => setTimeout(resolve, jitter));
  }
}

mainLoop();
