const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if Heimdallr is watching'),
  
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);
    
    await interaction.editReply(
      `🛡️ Heimdallr sees all!\n` +
      `⚡ Response time: ${latency}ms\n` +
      `💓 Heartbeat: ${apiLatency}ms`
    );
  },
};
