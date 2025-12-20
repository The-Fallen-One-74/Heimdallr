const { Events } = require('discord.js');
const { trackRSVP, getRSVPStats } = require('../services/rsvpTracker');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    // Ignore bot reactions
    if (user.bot) return;

    // Fetch partial messages
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        logger.error('Failed to fetch reaction:', error);
        return;
      }
    }

    // Check if this is a meeting reminder message
    if (!reaction.message.embeds || reaction.message.embeds.length === 0) return;
    
    const embed = reaction.message.embeds[0];
    if (!embed.title || !embed.title.includes('Reminder:')) return;

    // Map emoji to RSVP status
    const emojiMap = {
      '✅': 'accepted',
      '❌': 'declined',
      '❓': 'maybe'
    };

    const status = emojiMap[reaction.emoji.name];
    if (!status) return;

    try {
      // Extract event title from embed
      const eventTitle = embed.title.replace('⏰ Reminder: ', '');
      
      // Track the RSVP
      trackRSVP(reaction.message.guildId, reaction.message.id, user.id, user.tag, status, eventTitle);
      
      logger.info(`${user.tag} RSVP'd ${status} for "${eventTitle}" in guild ${reaction.message.guildId}`);
      
      // Update the message with current RSVP stats
      const stats = getRSVPStats(reaction.message.guildId, reaction.message.id);
      
      // Find or add RSVP field
      const newEmbed = { ...embed };
      const rsvpText = `✅ ${stats.accepted} attending | ❌ ${stats.declined} not attending | ❓ ${stats.maybe} maybe`;
      
      const rsvpFieldIndex = newEmbed.fields?.findIndex(f => f.name === '📊 RSVPs');
      if (rsvpFieldIndex >= 0) {
        newEmbed.fields[rsvpFieldIndex].value = rsvpText;
      } else {
        if (!newEmbed.fields) newEmbed.fields = [];
        newEmbed.fields.push({
          name: '📊 RSVPs',
          value: rsvpText,
          inline: false
        });
      }

      await reaction.message.edit({ embeds: [newEmbed] });
    } catch (error) {
      logger.error('Failed to process RSVP:', error);
    }
  },
};
