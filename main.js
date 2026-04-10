const axios = require('axios');
const CycleTLS = require('cycletls');

// === Variabili d'ambiente ===
const TOKEN_SNIPER = process.env.TOKEN_SNIPER;
const TOKEN_MONITOR = process.env.TOKEN_MONITOR; // non usato ma richiesto
const PASSWORD = process.env.PASSWORD;
const GUILD_ID = process.env.TARGET_GUILD_ID;
const VANITY = process.env.TARGET_VANITY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

if (!TOKEN_SNIPER || !TOKEN_MONITOR) {
    console.error("[FATAL] TOKEN_SNIPER e TOKEN_MONITOR devono essere entrambi impostati.");
    process.exit(1);
}
if (!PASSWORD || !GUILD_ID || !VANITY) {
    console.error("[FATAL] Variabili mancanti: PASSWORD, TARGET_GUILD_ID, TARGET_VANITY");
    process.exit(1);
}

let cycleClient = null;

async function getCycleClient() {
    if (!cycleClient) cycleClient = await CycleTLS();
    return cycleClient;
}

function log(message, type = 'INFO') {
    console.log(`[${new Date().toISOString()}] [${type}] ${message}`);
}

async function sendWebhook(message) {
    if (!WEBHOOK_URL) return;
    try {
        await axios.post(WEBHOOK_URL, { content: message });
        log("Webhook inviato", "WEBHOOK");
    } catch (err) {
        log(`Webhook fallito: ${err.message}`, "ERROR");
    }
}

async function solveMFA(token, password) {
    log("Tentativo MFA bypass...", "MFA");
    const client = await getCycleClient();
    try {
        const response = await client.post('https://discord.com/api/v9/mfa/finish', {
            body: JSON.stringify({ password, ticket: "mfa_ticket_placeholder" }),
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,
                'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6Iml0LUlUIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzExMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTEwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjE5OTY2MiwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0='
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

async function attemptClaim() {
    log(`Tentativo claim per ${VANITY}...`, "CLAIM");
    const client = await getCycleClient();
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': TOKEN_SNIPER,
        'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6Iml0LUlUIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzExMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTEwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjE5OTY2MiwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=',
        'X-Discord-Locale': 'it'
    };
    const body = { code: VANITY };

    try {
        // Prima prova con PATCH (metodo corretto)
        let response = await client.patch(`https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`, {
            body: JSON.stringify(body),
            headers,
            ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        });
        let status = response.status;
        let respBody = response.body;

        // Se PATCH dà 405, prova POST (alcuni selfbot funzionano con POST)
        if (status === 405) {
            log("PATCH fallito con 405, riprovo con POST...", "WARNING");
            response = await client.post(`https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`, {
                body: JSON.stringify(body),
                headers,
                ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            });
            status = response.status;
            respBody = response.body;
        }

        if (status === 200) {
            log(`✅ Vanity ${VANITY} reclamata con successo!`, "SUCCESS");
            await sendWebhook(`✅ **Vanity reclamata!** \`${VANITY}\` è ora tua.`);
            return true;
        }
        else if (status === 204) {
            log(`ℹ️ La vanity ${VANITY} è già impostata su questo server.`, "INFO");
            return true;
        }
        else if (status === 400) {
            const msg = respBody?.message || "";
            if (msg.includes("already taken")) {
                log(`❌ Vanity ${VANITY} già occupata da un altro server. Attendo rilascio...`, "WARNING");
            } else if (msg.includes("invalid")) {
                log(`❌ Nome vanity non valido.`, "ERROR");
                return true;
            } else {
                log(`⚠️ Errore 400: ${msg}`, "WARNING");
            }
        }
        else if (status === 429) {
            const retryAfter = response.headers['retry-after'] || 5;
            log(`Rate limit! Attendo ${retryAfter} secondi...`, "WARNING");
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        }
        else if (status === 401 || status === 403) {
            log(`❌ Token non autorizzato o permessi insufficienti. Dettaglio: ${JSON.stringify(respBody)}`, "ERROR");
            log("Verifica: il token è valido? L'account è owner o ha 'Manage Guild'? Il server non richiede 2FA per queste operazioni?", "ERROR");
            return true; // Termina perché non recuperabile
        }
        else {
            log(`Claim fallito: status ${status} - ${JSON.stringify(respBody)}`, "WARNING");
        }
    } catch (err) {
        log(`Errore di rete: ${err.message}`, "ERROR");
    }
    return false;
}

async function startSniper() {
    log(`Avvio sniper per vanity "${VANITY}" sul server ${GUILD_ID}`, "START");
    log("Metodo: PATCH con fallback POST, tentativo ogni 3 secondi.", "INFO");

    while (true) {
        const success = await attemptClaim();
        if (success) {
            log("Sniper completato. Termino.", "SUCCESS");
            process.exit(0);
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

startSniper().catch((err) => {
    log(`Errore fatale: ${err.message}`, "FATAL");
    process.exit(1);
});
