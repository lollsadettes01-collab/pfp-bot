const express = require('express');
const axios = require('axios');

const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VANITY_URL = process.env.VANITY_URL;

console.log("TOKEN letto:", TOKEN ? "✅ presente (prime 10 char: "+TOKEN.substring(0,10)+"...)" : "❌ MANCANTE");
console.log("GUILD_ID:", GUILD_ID);
console.log("VANITY_URL:", VANITY_URL);

async function testToken() {
  try {
    const res = await axios.get('https://discord.com/api/v9/users/@me', {
      headers: { 'Authorization': TOKEN }
    });
    console.log("✅ Token VALIDO! Utente:", res.data.username + "#" + res.data.discriminator);
    return true;
  } catch (err) {
    console.error("❌ Token NON valido. Risposta Discord:", err.response?.status, err.response?.data);
    return false;
  }
}

// Server keep-alive
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Test in corso'));
app.listen(PORT, () => console.log(`Server su porta ${PORT}`));

testToken().then(ok => {
  if (!ok) process.exit(1);
  console.log("Il token funziona. Ora potresti fare lo sniper...");
  // qui metteresti il loop, ma per ora fermati
});
