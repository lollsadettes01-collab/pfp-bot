import asyncio
import os
import json
from curl_cffi import requests

TOKEN = os.environ.get("TOKEN")
GUILD_ID = os.environ.get("GUILD_ID")
VANITY = os.environ.get("VANITY_URL")

if not TOKEN or not GUILD_ID or not VANITY:
    print("❌ Manca TOKEN, GUILD_ID o VANITY_URL")
    exit(1)

# Headers necessari per sembrare un client Discord reale
headers = {
    "Authorization": TOKEN,
    "Content-Type": "application/json",
    "X-Super-Properties": "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6Iml0LUlUIiwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTIwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVmZXJyZXJfY3VycmVudCI6IiIsInJlZmVycmluZ19kb21haW5fY3VycmVudCI6IiIsInJlbGVhc2VfY2hhbm5lbCI6InN0YWJsZSIsImNsaWVudF9idWlsZF9udW1iZXIiOjI1MjI5MiwiY2xpZW50X2V2ZW50X3NvdXJjZSI6bnVsbH0=",
    "X-Discord-Locale": "it",
    "Origin": "https://discord.com",
    "Referer": f"https://discord.com/channels/{GUILD_ID}",
}

async def sniper():
    url = f"https://discord.com/api/v9/guilds/{GUILD_ID}/vanity-url"
    payload = {"code": VANITY}
    
    while True:
        try:
            response = requests.patch(url, json=payload, headers=headers, impersonate="chrome110")
            if response.status_code == 200:
                print(f"🎯 CATTURATO! {VANITY}")
                break
            elif response.status_code == 429:
                retry = response.json().get("retry_after", 5)
                print(f"⏳ Rate limit: aspetto {retry}s")
                await asyncio.sleep(retry)
            elif response.status_code == 400 and response.json().get("code") == 50069:
                print(f"🔍 Non disponibile, riprovo tra 3-10s")
                await asyncio.sleep(3 + (hash(VANITY) % 7))
            else:
                print(f"⚠️ Errore {response.status_code}: {response.text}")
                await asyncio.sleep(10)
        except Exception as e:
            print(f"⚠️ Eccezione: {e}")
            await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(sniper())
