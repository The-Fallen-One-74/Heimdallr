const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Learn about Heimdallr'),
  
  async execute(interaction) {
    await interaction.reply(
      'I am Heimdallr, guardian of the Bifrost and watcher of the nine realms. ' +
      'I see and hear all that happens across the realms.'
    );
  },
};
