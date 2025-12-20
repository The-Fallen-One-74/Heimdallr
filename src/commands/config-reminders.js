const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, saveGuildConfig } = require('../services/configManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Configure reminder times (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Event type to configure')
        .setRequired(true)
        .addChoices(
          { name: 'Meetings', value: 'meeting' },
          { name: 'Sprints', value: 'sprint' },
          { name: 'Holidays', value: 'holiday' }
        ))
    .addStringOption(option =>
      option.setName('times')
        .setDescription('Reminder times in minutes, comma-separated (e.g., 1440,60,15 for 24h, 1h, 15m)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type');
    const timesStr = interaction.options.getString('times');

    // Parse and validate times
    const times = timesStr.split(',').map(t => parseInt(t.trim())).filter(t => !isNaN(t) && t > 0);

    if (times.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Invalid Times')
        .setDescription('Please provide valid reminder times in minutes (e.g., 1440,60,15)');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    try {
      const config = getGuildConfig(interaction.guildId);
      
      if (!config) {
        const embed = new EmbedBuilder()
          .setColor(0xFF9900)
          .setTitle('⚠️ Not Configured')
          .setDescription('Please run `/setup` first to configure Heimdallr.');

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Update reminder times
      const reminderTimes = config.reminder_times || {};
      reminderTimes[type] = times;

      await saveGuildConfig(interaction.guildId, {
        ...config,
        reminder_times: reminderTimes
      });

      const typeNames = {
        meeting: 'Meetings',
        sprint: 'Sprints',
        holiday: 'Holidays'
      };

      const timeDescriptions = times.map(t => {
        if (t >= 1440) {
          const days = Math.floor(t / 1440);
          return `${days} day${days !== 1 ? 's' : ''}`;
        } else if (t >= 60) {
          const hours = Math.floor(t / 60);
          return `${hours} hour${hours !== 1 ? 's' : ''}`;
        } else {
          return `${t} minute${t !== 1 ? 's' : ''}`;
        }
      });

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Reminder Times Updated')
        .setDescription(`Updated reminder times for ${typeNames[type]}`)
        .addFields({
          name: '⏰ New Reminder Times',
          value: timeDescriptions.map((desc, i) => `• ${desc} before (${times[i]} minutes)`).join('\n'),
          inline: false
        })
        .setFooter({ text: 'These times will apply to all future reminders' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Error')
        .setDescription('Failed to update reminder times. Please try again.');

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
