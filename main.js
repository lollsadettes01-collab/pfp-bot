const CycleTLS = require('cycletls');

// === LEGGI LE VARIABILI D'AMBIENTE ===
const TOKEN = process.env.TOKEN_SNIPER;
const PASSWORD = process.env.PASSWORD;        // <-- la PASSWORD VERA del tuo account
const GUILD_ID = process.env.TARGET_GUILD_ID;
const VANITY = process.env.TARGET_VANITY;

if (!TOKEN || !PASSWORD || !GUILD_ID || !VANITY) {
    console.error("❌ Variabili mancanti: controlla TOKEN_SNIPER, PASSWORD, TARGET_GUILD_ID, TARGET_VANITY");
    process.exit(1);
}

let client = null;

async function getClient() {
    if (!client) client = await CycleTLS();
    return client;
}

async function claimVanity() {
    const client = await getClient();
    console.log(`[CLAIM] Tentativo per ${VANITY}`);

    // 1. Prova a impostare il vanity
    let res = await client.patch(`https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`, {
        body: JSON.stringify({ code: VANITY }),
        headers: {
            'Authorization': TOKEN,
            'Content-Type': 'application/json'
        },
        ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
    });

    // 2. Se la risposta è 200 -> OK
    if (res.status === 200) {
        console.log(`✅ Vanity ${VANITY} reclamata!`);
        process.exit(0);
    }
    // 3. Se la risposta è 204 -> già impostata
    if (res.status === 204) {
        console.log(`ℹ️ Vanity già impostata su questo server.`);
        process.exit(0);
    }
    // 4. Se richiede MFA (code 60003)
    if (res.status === 400 && res.body?.code === 60003) {
        const ticket = res.body.mfa.ticket;
        console.log(`🪪 Ticket ricevuto, invio password per completare MFA...`);
        
        // Completa la verifica MFA con password + ticket
        const mfaRes = await client.post('https://discord.com/api/v9/mfa/finish', {
            body: JSON.stringify({ password: PASSWORD, ticket: ticket }),
            headers: {
                'Authorization': TOKEN,
                'Content-Type': 'application/json'
            },
            ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        });

        if (mfaRes.status === 200) {
            console.log(`✅ MFA superato, riprovo il claim...`);
            // Dopo il successo, il token MFA viene automaticamente accettato da Discord per la sessione
            // Riprova immediatamente la stessa richiesta PATCH
            return claimVanity();   // Ricorsione per riprovare
        } else {
            console.log(`❌ MFA fallito:`, mfaRes.body);
        }
    }
    // 5. Rate limit
    else if (res.status === 429) {
        const retryAfter = res.headers['retry-after'] || 5;
        console.log(`⏳ Rate limit, attendo ${retryAfter} secondi...`);
        setTimeout(claimVanity, retryAfter * 1000);
        return;
    }
    // 6. Altri errori
    else {
        console.log(`⚠️ Status ${res.status}:`, res.body);
    }

    // Se arriviamo qui, nessun successo: riprova tra 3 secondi
    setTimeout(claimVanity, 3000);
}

// Avvia
claimVanity().catch(err => {
    console.error("❌ Errore fatale:", err);
    process.exit(1);
});
