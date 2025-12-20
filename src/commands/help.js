const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isGuildConfigured } = require('../services/configManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with Heimdallr commands'),
  
  async execute(interaction) {
    const isConfigured = await isGuildConfigured(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🛡️ Heimdallr - Guardian of the Bifröst')
      .setDescription('I watch over all nine realms and keep your team connected to Bifröst.')
      .addFields(
        { name: '📋 Basic Commands', value: '\u200B', inline: false },
        { name: '/ping', value: 'Check if Heimdallr is watching', inline: true },
        { name: '/about', value: 'Learn about Heimdallr', inline: true },
        { name: '/help', value: 'Show this help message', inline: true }
      );

    if (!isConfigured) {
      embed.addFields(
        { name: '\n⚙️ Setup Required', value: '\u200B', inline: false },
        { 
          name: '/setup', 
          value: '**[Admin]** Connect Heimdallr to your Bifröst instance', 
          inline: false 
        }
      );
    } else {
      embed.addFields(
        { name: '\n⚙️ Configuration', value: '\u200B', inline: false },
        { name: '/config', value: '**[Admin]** View current configuration', inline: true },
        { name: '/setup', value: '**[Admin]** Update configuration', inline: true },
        { name: '\n📅 Events & Meetings', value: '\u200B', inline: false },
        { name: '/digest', value: 'Get event summary', inline: true },
        { name: '/schedule', value: 'Schedule a new meeting', inline: true },
        { name: '/reschedule', value: 'Reschedule a meeting', inline: true },
        { name: '/cancel', value: 'Cancel a meeting', inline: true },
        { name: '/attendees', value: 'View meeting attendees', inline: true },
        { name: '/meetings', value: 'List upcoming meetings', inline: true },
        { name: '/today', value: 'Show today\'s events', inline: true },
        { name: '/week', value: 'Show this week\'s events', inline: true },
        { name: '/month', value: 'Show this month\'s events', inline: true },
        { name: '\n🏃 Sprints', value: '\u200B', inline: false },
        { name: '/sprint', value: 'View current sprint information', inline: true },
        { name: '\n🎉 Holidays', value: '\u200B', inline: false },
        { name: '/holidays', value: 'List upcoming holidays', inline: true },
        { name: '\n⚙️ Advanced', value: '\u200B', inline: false },
        { name: '/reminders', value: '**[Admin]** Configure reminder times', inline: true }
      );
    }

    embed
      .addFields({ 
        name: '\n🔗 Getting Started', 
        value: 'Heimdallr connects to your Bifröst workspace to send notifications about meetings, sprints, and holidays.',
        inline: false 
      })
      .setFooter({ text: 'More features coming soon!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
