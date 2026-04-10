const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');
const CycleTLS = require('cycletls');
const fs = require('fs');

// --- Configurazione da variabili d'ambiente Railway ---
const CONFIG = {
    token_monitor: process.env.TOKEN_MONITOR,
    token_sniper: process.env.TOKEN_SNIPER,
    password: process.env.PASSWORD,
    target_guild_id: process.env.TARGET_GUILD_ID,
    target_vanity: process.env.TARGET_VANITY,
    webhook_url: process.env.WEBHOOK_URL,
    release_delay_days: parseInt(process.env.RELEASE_DELAY_DAYS) || 30,
    grace_file: 'grace_data.json'
};

// --- Logging con timestamp ---
function log(message, type = 'INFO') {
    console.log(`[${new Date().toISOString()}] [${type}] ${message}`);
}

// --- Webhook (opzionale) ---
async function sendWebhook(message) {
    if (!CONFIG.webhook_url) return;
    try {
        await axios.post(CONFIG.webhook_url, { content: message });
        log(`Webhook inviato: ${message}`, 'WEBHOOK');
    } catch (err) {
        log(`Webhook fallito: ${err.message}`, 'ERROR');
    }
}

// --- MFA Bypass (Ninja Mode) ---
async function solveMFA(token, password) {
    log("Tentativo MFA bypass...", "MFA");
    try {
        const response = await CycleTLS.post('https://discord.com/api/v9/mfa/finish', {
            body: JSON.stringify({
                password: password,
                ticket: "mfa_ticket_placeholder",
                gift_code_sku_id: null,
                login_source: null
            }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        });
        if (response.status === 200) {
            log("MFA bypass riuscito!", "MFA");
            return true;
        }
    } catch (err) {
        log(`MFA bypass fallito: ${err.message}`, "ERROR");
    }
    return false;
}

// --- Grace Period (salvataggio su file persistente) ---
function loadGraceData() {
    if (fs.existsSync(CONFIG.grace_file)) {
        return JSON.parse(fs.readFileSync(CONFIG.grace_file));
    }
    return {};
}

function saveGraceData(data) {
    fs.writeFileSync(CONFIG.grace_file, JSON.stringify(data, null, 2));
}

// --- Tentativo di claim del vanity ---
async function claimVanity(token, password, vanity, guildId) {
    log(`Tentativo claim per ${vanity}...`, "CLAIM");
    try {
        const claimResponse = await CycleTLS.post(`https://discord.com/api/v9/guilds/${guildId}/vanity-url`, {
            body: JSON.stringify({ code: vanity }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        });
        if (claimResponse.status === 200) {
            log(`Vanity ${vanity} reclamata con successo!`, "SUCCESS");
            await sendWebhook(`✅ **Vanity reclamata!** \`${vanity}\` è ora tua.`);
            return true;
        } else if (claimResponse.status === 400 && JSON.stringify(claimResponse.body).includes('mfa')) {
            log("Richiede MFA, tentativo bypass...", "MFA");
            if (await solveMFA(token, password)) {
                return await claimVanity(token, password, vanity, guildId);
            }
        } else if (claimResponse.status === 429) {
            log("Rate limit, attendo 5 secondi...", "WARNING");
            await new Promise(resolve => setTimeout(resolve, 5000));
            return await claimVanity(token, password, vanity, guildId);
        } else {
            log(`Claim fallito: status ${claimResponse.status}`, "WARNING");
        }
    } catch (err) {
        log(`Claim error: ${err.message}`, "ERROR");
    }
    return false;
}

// --- Monitoraggio e loop principale ---
async function monitorAndSnipe() {
    log("Avvio monitoraggio...", "START");
    const graceData = loadGraceData();
    const client = new Client({ checkUpdate: false });
    await client.login(CONFIG.token_monitor);
    log(`Bot monitor avviato come ${client.user.tag}`);

    client.on('guildUpdate', async (oldGuild, newGuild) => {
        if (newGuild.id === CONFIG.target_guild_id) {
            const vanity = newGuild.vanityURLCode;
            if (vanity !== CONFIG.target_vanity && !graceData[CONFIG.target_vanity]) {
                log(`Vanity target non trovata, avvio grace period...`, "GRACE");
                graceData[CONFIG.target_vanity] = Date.now() + (CONFIG.release_delay_days * 86400000);
                saveGraceData(graceData);
            } else if (vanity === CONFIG.target_vanity) {
                log(`Vanity target è libera! Tentativo claim...`, "SNIPE");
                await claimVanity(CONFIG.token_sniper, CONFIG.password, CONFIG.target_vanity, CONFIG.target_guild_id);
                delete graceData[CONFIG.target_vanity];
                saveGraceData(graceData);
            }
        }
    });

    setInterval(async () => {
        for (const [vanity, expiry] of Object.entries(graceData)) {
            if (Date.now() >= expiry) {
                log(`Grace period scaduto per ${vanity}, tentativo claim...`, "GRACE");
                if (await claimVanity(CONFIG.token_sniper, CONFIG.password, vanity, CONFIG.target_guild_id)) {
                    delete graceData[vanity];
                    saveGraceData(graceData);
                }
            }
        }
    }, 60000);
}

// --- Avvio dello script ---
monitorAndSnipe().catch(err => {
    log(`Errore fatale: ${err.message}`, "FATAL");
    process.exit(1);
});
