const express = require('express');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VANITY_URL = process.env.VANITY_URL;

if (!TOKEN || !GUILD_ID || !VANITY_URL) {
  console.error('❌ Imposta TOKEN, GUILD_ID, VANITY_URL su Railway');
  process.exit(1);
}

// ========== SERVER KEEP-ALIVE ==========
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Sniper in esecuzione'));
app.listen(PORT, () => console.log(`Keep-alive su porta ${PORT}`));

// ========== CONFIGURAZIONE SICURA ==========
const MIN_INTERVAL = 2000;   // 2 secondi minimo
const MAX_INTERVAL = 10000;  // 10 secondi massimo
const MAX_ATTEMPTS_PER_DAY = 8000; // ~1 richiesta ogni 10-12 sec in media
const NIGHT_START = 1;  // 1 AM (ora del server Railway, UTC)
const NIGHT_END = 6;     // 6 AM

let attemptsToday = 0;
let lastResetDate = new Date().toDateString();
let currentBackoff = MIN_INTERVAL;

// Funzione per generare intervallo casuale
function getRandomInterval() {
  return Math.floor(Math.random() * (MAX_INTERVAL - MIN_INTERVAL + 1) + MIN_INTERVAL);
}

// Simula pausa notturna
function isNightTime() {
  const hourUTC = new Date().getUTCHours();
  return hourUTC >= NIGHT_START && hourUTC < NIGHT_END;
}

// Reset contatore giornaliero
function resetDailyIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    attemptsToday = 0;
    lastResetDate = today;
    console.log('📅 Reset contatore giornaliero');
  }
}

async function snipeVanity() {
  try {
    const response = await axios.patch(
      `https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`,
      { code: VANITY_URL },
      {
        headers: {
          'Authorization': TOKEN,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
    );
    console.log(`🎯 CATTURATO!`, response.data);
    process.exit(0);
  } catch (error) {
    if (error.response?.status === 429) {
      const retryAfter = error.response.data.retry_after;
      console.log(`⏳ Rate limit: aspetto ${retryAfter}s`);
      currentBackoff = Math.min(currentBackoff * 2, 60000); // max 60 secondi
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    } else if (error.response?.status === 400 && error.response?.data?.code === 50069) {
      // Vanity non disponibile – comportamento normale
      if (currentBackoff > MIN_INTERVAL) {
        currentBackoff = Math.max(currentBackoff * 0.9, MIN_INTERVAL);
      }
      const wait = getRandomInterval();
      console.log(`🔍 Non disponibile. Prossimo tentativo tra ${wait/1000}s`);
      return wait;
    } else if (error.response?.status === 401) {
      console.error('❌ Token non valido o revocato. Fermo lo sniper.');
      process.exit(1);
    } else {
      console.error('⚠️ Errore imprevisto:', error.response?.data || error.message);
      return 30000; // aspetta 30 secondi
    }
    return currentBackoff;
  }
}

async function mainLoop() {
  console.log(`🚀 Sniper avviato con intervallo ${MIN_INTERVAL/1000}-${MAX_INTERVAL/1000}s`);
  while (true) {
    resetDailyIfNeeded();

    if (attemptsToday >= MAX_ATTEMPTS_PER_DAY) {
      console.log(`😴 Raggiunto limite di ${MAX_ATTEMPTS_PER_DAY} tentativi. Pausa fino a domani.`);
      const msUntilMidnight = new Date().setHours(24,0,0,0) - Date.now();
      await new Promise(resolve => setTimeout(resolve, msUntilMidnight));
      continue;
    }

    if (isNightTime()) {
      console.log(`🌙 Ora notturna (${new Date().getUTCHours()}:00 UTC). Pausa di 30 minuti.`);
      await new Promise(resolve => setTimeout(resolve, 30 * 60 * 1000));
      continue;
    }

    const waitTime = await snipeVanity();
    attemptsToday++;
    const jitter = waitTime * (0.9 + Math.random() * 0.2);
    await new Promise(resolve => setTimeout(resolve, jitter));
  }
}

mainLoop();
