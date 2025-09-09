// wordle-bot.js
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  Events,
} = require('discord.js');
const cron = require('node-cron');
const axios = require('axios');

// ================= CONFIG =================
const BOT_TOKEN = '';
const TARGET_CHANNEL_ID = '';
const BOT_TZ = 'America/New_York'; // schedule + date math aligned to Eastern
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// --------- Timezone-safe "yesterday" (Eastern) ----------
function easternTodayParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate(); // 0 => last day of previous month
}
function easternYesterdayYYYYMMDD() {
  let { y, m, d } = easternTodayParts();
  if (d > 1) d -= 1;
  else {
    if (m === 1) {
      y -= 1;
      m = 12;
    } else {
      m -= 1;
    }
    d = daysInMonth(y, m);
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ------------- Wordle fetchers ----------------
async function getYesterdaysWordleWord() {
  try {
    const dateStr = easternYesterdayYYYYMMDD();

    // Method 1: NYT official endpoint
    try {
      const url = `https://www.nytimes.com/svc/wordle/v2/${dateStr}.json`;
      const res = await axios.get(url, {
        timeout: 5000,
        headers: { 'User-Agent': 'WordleBot/1.0 (+node)' },
      });
      if (res.data?.solution) return res.data.solution.toUpperCase();
    } catch (e) {
      console.warn('NYT API failed, falling back:', e.message);
    }

    // Method 2: (Optional) Static fallback you can extend
    return null;
  } catch (err) {
    console.error('getYesterdaysWordleWord error:', err);
    return null;
  }
}

// Fallback by pre-known answers map keyed by YYYY-MM-DD (easiest to maintain)
/*function getWordByDateCalculation(dateStr) {
  // Example entries; extend as desired:
  const knownByDate = {
    '2025-09-06': 'BULGE',
    '2025-09-07': 'TENOR',
    '2025-09-08': 'CHIRP',
  };
  return knownByDate[dateStr] || null;
}*/

// ------------- Send message ----------------
async function sendDailyWordleMessage() {
  try {
    const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
    if (!channel) {
      console.error('Target channel not found');
      return;
    }

    const word = await getYesterdaysWordleWord();
    const content = word
      ? `New Word Available!\nYesterday's word: **${word}**`
      : `Sorry, I couldn't fetch yesterday's Wordle word. 😔`;

    await channel.send(content);
    console.log('Posted:', content.replace(/\n.*/, ''));
  } catch (err) {
    console.error('Error sending daily message:', err);
  }
}

// ------------- Events ----------------
// ✅ Newer discord.js: use clientReady (ready is deprecated in 14.22+)
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user?.tag ?? 'Unknown User'}`);
  console.log('⏰ Scheduled to post every midnight Eastern.');
});

// Manual admin-only test
client.on(Events.MessageCreate, async (message) => {
  if (!message.inGuild() || message.author.bot) return;
  if (message.content === '!testwordle') {
    const isAdmin = message.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    );
    if (!isAdmin) return message.reply("You don't have permission for that.");
    await sendDailyWordleMessage();
  }
});

// Cron: midnight Eastern every day
cron.schedule(
  '0 0 0 * * *',
  () => {
    console.log('⏰ Midnight Eastern reached. Sending Wordle…');
    sendDailyWordleMessage();
  },
  { timezone: BOT_TZ }
);

// Errors
client.on('error', (e) => console.error('Discord.js error:', e));
process.on('unhandledRejection', (e) =>
  console.error('Unhandled promise rejection:', e)
);

// Start
client.login(BOT_TOKEN);
