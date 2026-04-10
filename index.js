const express = require('express');
const axios = require('axios');

// ========== LEGGI VARIABILI D'AMBIENTE ==========
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VANITY_URL = process.env.VANITY_URL;

if (!TOKEN || !GUILD_ID || !VANITY_URL) {
  console.error('❌ ERRORE: Imposta le variabili d\'ambiente TOKEN, GUILD_ID e VANITY_URL su Railway');
  process.exit(1);
}

// ========== SERVER HTTP (keep-alive per Railway) ==========
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord Vanity Sniper is running!');
});

app.listen(PORT, () => {
  console.log(`✅ Server keep-alive attivo sulla porta ${PORT}`);
});

// ========== LOGICA SNIPER ==========
async function snipeVanity() {
  try {
    const response = await axios.patch(
      `https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`,
      { code: VANITY_URL },
      { headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json' } }
    );
    console.log(`🎯 VANITY CATTURATO! ${VANITY_URL} ->`, response.data);
    process.exit(0);
  } catch (error) {
    if (error.response?.status === 429) {
      const retryAfter = error.response.data.retry_after;
      console.log(`⏳ Rate limit: aspetto ${retryAfter} secondi`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    } else if (error.response?.status === 400 && error.response?.data?.code === 50069) {
      console.log(`❌ ${VANITY_URL} non ancora disponibile`);
    } else {
      console.error('⚠️ Errore:', error.response?.data || error.message);
    }
  }
}

async function mainLoop() {
  console.log(`🚀 Sniper avviato per "${VANITY_URL}" (guild ${GUILD_ID})`);
  while (true) {
    await snipeVanity();
    await new Promise(resolve => setTimeout(resolve, 200)); // 200ms tra un tentativo e l'altro
  }
}

mainLoop();
