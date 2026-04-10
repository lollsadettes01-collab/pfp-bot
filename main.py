import asyncio
import os
from keep_alive_ping import create_service  # Importa la libreria per il keep-alive
from curl_cffi import requests

# === LEGGI LE VARIABILI D'AMBIENTE ===
TOKEN = os.environ.get("TOKEN")
GUILD_ID = os.environ.get("GUILD_ID")
VANITY = os.environ.get("VANITY_URL")

# === CONTROLLO INIZIALE ===
if not TOKEN or not GUILD_ID or not VANITY:
    print("❌ ERRORE: Imposta TOKEN, GUILD_ID e VANITY_URL su Railway!")
    exit(1)

# ==========================================
# === SERVER DI KEEP-ALIVE (lo tengo sempre attivo) ===
# ==========================================
print("🟢 Avvio il servizio di keep-alive...")
service = create_service()
service.start()  # Avvia il server web su una porta interna
print("✅ Servizio keep-alive attivo")

# === HEADER PER IL SELFBOT ===
headers = {
    "Authorization": TOKEN,
    "Content-Type": "application/json",
    "X-Super-Properties": "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6Iml0LUlUIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTIwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjI1MjI5MiwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=",
    "X-Discord-Locale": "it",
    "Origin": "https://discord.com",
    "Referer": f"https://discord.com/channels/{GUILD_ID}",
}

# === LOOP PRINCIPALE DELLO SNIPER ===
async def sniper():
    url = f"https://discord.com/api/v9/guilds/{GUILD_ID}/vanity-url"
    payload = {"code": VANITY}
    print(f"🚀 Avvio sniper per discord.gg/{VANITY}")
    while True:
        try:
            # `impersonate="chrome110"` è la chiave per non farsi bloccare
            response = requests.patch(url, json=payload, headers=headers, impersonate="chrome110")
            if response.status_code == 200:
                print(f"🎯 CATTURATO! Vanity {VANITY} reclamata!")
                break
            elif response.status_code == 429:
                retry = response.json().get("retry_after", 5)
                print(f"⏳ Rate limit. Attendo {retry} secondi.")
                await asyncio.sleep(retry)
            elif response.status_code == 400 and response.json().get("code") == 50069:
                # Codice 50069 = Vanity URL non disponibile
                print(f"🔍 {VANITY} non disponibile, riprovo tra 3-10s.")
                await asyncio.sleep(3 + (hash(VANITY) % 7))
            else:
                print(f"⚠️ Errore {response.status_code}: {response.text[:200]}")
                await asyncio.sleep(10)
        except Exception as e:
            print(f"⚠️ Eccezione: {e}")
            await asyncio.sleep(10)

# === PUNTO DI ENTRY ===
if __name__ == "__main__":
    try:
        asyncio.run(sniper())
    except KeyboardInterrupt:
        print("⏹️ Bot fermato manualmente.")
