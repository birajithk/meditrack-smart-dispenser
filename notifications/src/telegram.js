import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN in notifications/.env");
}

if (!TELEGRAM_CHAT_ID) {
  throw new Error("Missing TELEGRAM_CHAT_ID in notifications/.env");
}

export async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
    }),
  });

  const data = await response.json();

  if (!response.ok || data.ok !== true) {
    throw new Error(data.description || "Telegram sendMessage failed");
  }

  return data;
}