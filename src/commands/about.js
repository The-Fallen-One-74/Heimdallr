const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('Learn about Heimdallr'),
  
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ About Heimdallr')
      .setDescription(
        'I am Heimdallr, guardian of the Bifröst and watcher of the nine realms. ' +
        'I see and hear all that happens across the realms.\n\n' +
        'I serve as the bridge between your Discord server and your Bifröst workspace, ' +
        'keeping your team informed about meetings, sprints, holidays, and important events.'
      )
      .addFields(
        { name: '👁️ Always Watching', value: 'I monitor all events across your workspace', inline: false },
        { name: '⏰ Never Forget', value: 'I remind you of meetings and important dates', inline: false },
        { name: '🌉 The Bridge', value: 'I connect Discord with Bifröst seamlessly', inline: false }
      )
      .setFooter({ text: 'Use /help to see available commands' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
