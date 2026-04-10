const CycleTLS = require('cycletls');

const TOKEN = process.env.TOKEN_SNIPER;
const PASSWORD = process.env.PASSWORD;
const GUILD_ID = process.env.TARGET_GUILD_ID;
const VANITY = process.env.TARGET_VANITY;

let client = null;

async function init() {
    client = await CycleTLS();
}

async function claim() {
    console.log(`[CLAIM] Tentativo per ${VANITY}`);
    try {
        let res = await client.patch(`https://discord.com/api/v9/guilds/${GUILD_ID}/vanity-url`, {
            body: JSON.stringify({ code: VANITY }),
            headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json' },
            ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        });
        if (res.status === 200) {
            console.log(`✅ Reclamata!`);
            process.exit(0);
        }
        if (res.status === 204) {
            console.log(`ℹ️ Già impostata.`);
            process.exit(0);
        }
        if (res.status === 400 && res.body?.code === 60003) {
            const ticket = res.body.mfa.ticket;
            console.log(`🪪 Ticket ricevuto, invio password...`);
            const mfa = await client.post('https://discord.com/api/v9/mfa/finish', {
                body: JSON.stringify({ password: PASSWORD, ticket: ticket }),
                headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json' },
                ja3: '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-21,29-23-24,0',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            });
            if (mfa.status === 200) {
                console.log(`✅ MFA superato, riprovo...`);
                return claim(); // riprova con lo stesso token (ora valido)
            } else {
                console.log(`❌ MFA fallito:`, mfa.body);
            }
        }
        if (res.status === 429) {
            console.log(`⏳ Rate limit, aspetto...`);
            setTimeout(claim, 5000);
        } else {
            console.log(`⚠️ Status ${res.status}:`, res.body);
            setTimeout(claim, 3000);
        }
    } catch(e) {
        console.log(`❌ Errore:`, e.message);
        setTimeout(claim, 3000);
    }
}

init().then(claim);
