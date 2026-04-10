const axios = require('axios');
const CycleTLS = require('cycletls');

// === Configurazione ===
const TOKEN_SNIPER = process.env.TOKEN_SNIPER;
const TOKEN_MONITOR = process.env.TOKEN_MONITOR;
const PASSWORD = process.env.PASSWORD;
const GUILD_ID = process.env.TARGET_GUILD_ID;
const VANITY = process.env.TARGET_VANITY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!TOKEN_SNIPER || !PASSWORD || !GUILD_ID || !VANITY) {
    console.error("[FATAL] Variabili mancanti: TOKEN_SNIPER, PASSWORD, TARGET_GUILD_ID, TARGET_VANITY");
    process.exit(1);
}

let cycleClient = null;

async function getCycleClient() {
    if (!cycleClient) {
        cycleClient = await CycleTLS();
    }
    return cycleClient;
}

function log(message, type = 'INFO') {
    console.log(`[${new Date().toISOString()}] [${type}] ${message}`);
}

async function sendWebhook(message) {
    if (!WEBHOOK_URL) return;
    try {
        await axios.post(WEBHOOK_URL, { content: message });
        log(`Webhook inviato`, 'WEBHOOK');
    } catch (err) {
        log(`Webhook fallito: ${err.message}`, 'ERROR');
    }
}

async function solveMFA(token, password) {
    log("Tentativo MFA bypass...", "MFA");
    const client = await getCycleClient();
    try {
        const response = await client.post('https://discord.com/api/v9/mfa/finish', {
            body: JSON.stringify({
                password: password,
                ticket: "mfa_ticket_placeholder",
                gift_code_sku_id: null,
                login_source: null
            }),
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
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

async function attemptClaim() {
    log(`Tentativo claim per ${VANITY}...`, "CLAIM");
    const client = await getCycleClient();
    try {
        // Usiamo PATCH, non POST
        const response = await client.patch(`https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`, {
            body: JSON.stringify({ code: VANITY }),
            headers: { 'Content-Type': 'application/json', 'Authorization': TOKEN_SNIPER },
            ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        });

        const status = response.status;
        const body = response.body;

        if (status === 200) {
            log(`✅ Vanity ${VANITY} reclamata con successo!`, "SUCCESS");
            await sendWebhook(`✅ **Vanity reclamata!** \`${VANITY}\` è ora tua.`);
            return true;
        } 
        else if (status === 204) {
            log(`ℹ️ La vanity ${VANITY} è già impostata su questo server. Nessuna azione necessaria.`, "INFO");
            return true; // Termina con successo
        }
        else if (status === 400) {
            const errorMsg = body?.message || "Errore sconosciuto";
            if (errorMsg.includes("already taken") || errorMsg.includes("invite")) {
                log(`❌ Vanity ${VANITY} già occupata da un altro server. Attendo rilascio...`, "WARNING");
            } else if (errorMsg.includes("invalid")) {
                log(`❌ Nome vanity non valido.`, "ERROR");
                return true; // Termina perché non recuperabile
            } else {
                log(`⚠️ Errore 400: ${errorMsg}`, "WARNING");
            }
        }
        else if (status === 429) {
            const retryAfter = response.headers['retry-after'] || 5;
            log(`Rate limit! Attendo ${retryAfter} secondi...`, "WARNING");
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        }
        else if (status === 401 || status === 403) {
            log(`❌ Token non autorizzato o permessi insufficienti.`, "ERROR");
            return true; // Termina
        }
        else if (status === 405) {
            log(`❌ Metodo non consentito. Verifica l'endpoint.`, "ERROR");
            return true;
        }
        else {
            log(`Claim fallito: status ${status} - ${JSON.stringify(body)}`, "WARNING");
        }
    } catch (err) {
        log(`Errore di rete: ${err.message}`, "ERROR");
    }
    return false;
}

async function startSniper() {
    log(`Avvio sniper per vanity "${VANITY}" sul server ${GUILD_ID}`, "START");
    log(`TOKEN_SNIPER configurato, TOKEN_MONITOR presente: ${TOKEN_MONITOR ? 'sì' : 'no'}`, "INFO");
    log("Tenterò il claim ogni 3 secondi (gestione automatica di rate limit e MFA)", "INFO");

    while (true) {
        const success = await attemptClaim();
        if (success) {
            log("Sniper completato. Termino.", "SUCCESS");
            if (cycleClient) await cycleClient.close();
            process.exit(0);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

startSniper().catch(async (err) => {
    log(`Errore fatale: ${err.message}`, "FATAL");
    if (cycleClient) await cycleClient.close();
    process.exit(1);
});
