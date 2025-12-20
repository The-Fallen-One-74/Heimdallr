require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`✓ Heimdallr is watching! Logged in as ${readyClient.user.tag}`);
  console.log(`Watching over ${readyClient.guilds.cache.size} realm(s)`);
});

client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;

  if (message.content === '!ping') {
    message.reply('Pong! Heimdallr sees all.');
  }

  if (message.content === '!about') {
    message.reply(
      'I am Heimdallr, guardian of the Bifrost and watcher of the nine realms. ' +
      'I see and hear all that happens across the realms.'
    );
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  console.log(`New member joined: ${member.user.tag}`);
});

client.on(Events.GuildMemberRemove, (member) => {
  console.log(`Member left: ${member.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
