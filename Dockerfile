FROM python:3.10-slim

WORKDIR /app

# Installa curl e dipendenze per curl_cffi
RUN apt-get update && apt-get install -y curl libcurl4-openssl-dev libssl-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]
