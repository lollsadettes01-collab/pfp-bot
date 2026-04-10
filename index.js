const express = require('express');
const axios = require('axios');

// === VARIABILI D'AMBIENTE ===
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VANITY_URL = process.env.VANITY_URL;

if (!TOKEN || !GUILD_ID || !VANITY_URL) {
    console.error('❌ Imposta TOKEN, GUILD_ID, VANITY_URL su Railway');
    process.exit(1);
}

// === SERVER KEEP-ALIVE (impedisce a Railway di sospendere il container) ===
const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Sniper attivo'));
app.listen(PORT, () => console.log(`✅ Keep-alive su porta ${PORT}`));

// === LOOP PRINCIPALE ===
console.log(`🚀 Avvio sniper per discord.gg/${VANITY_URL} (guild ${GUILD_ID})`);

async function snipe() {
    try {
        const response = await axios.patch(
            `https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`,
            { code: VANITY_URL },
            {
                headers: {
                    'Authorization': TOKEN,   // solo il token, niente altro
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            }
        );
        console.log(`🎯 CATTURATO!`, response.data);
        process.exit(0); // esce con successo
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;

        if (status === 429) {
            const retryAfter = data.retry_after || 5;
            console.log(`⏳ Rate limit: aspetto ${retryAfter} secondi`);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
        } 
        else if (status === 400 && data?.code === 50069) {
            // Vanity non disponibile → comportamento normale
            console.log(`🔍 Vanity "${VANITY_URL}" non disponibile, riprovo tra 2-10 secondi`);
            const delay = 2000 + Math.random() * 8000;
            await new Promise(r => setTimeout(r, delay));
        }
        else if (status === 401) {
            console.error(`❌ 401 Unauthorized – Token non valido o senza permessi. Controlla:`);
            console.error(`   - L'account è owner del server?`);
            console.error(`   - Il server ha boost livello 3?`);
            console.error(`   - Il token è ancora attivo?`);
            await new Promise(r => setTimeout(r, 60000)); // aspetta un minuto prima di riprovare
        }
        else {
            console.error(`⚠️ Errore ${status}:`, data?.message || error.message);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
}

// Loop infinito
(async () => {
    while (true) {
        await snipe();
    }
})();
