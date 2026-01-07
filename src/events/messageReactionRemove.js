const { Events } = require('discord.js');
const { removeRSVP, getRSVPStats } = require('../services/rsvpTracker');
const logger = require('../utils/logger');

module.exports = {
  name: Events.MessageReactionRemove,
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

    // Check if this is an event notification message
    if (!reaction.message.embeds || reaction.message.embeds.length === 0) return;
    
    const embed = reaction.message.embeds[0];
    if (!embed.title) return;
    
    // Check if this is an event notification
    const isEventNotification = 
      embed.title.includes('📅 New Event:') ||
      embed.title.includes('⏰ Reminder:') ||
      embed.title.includes('🚀 Starting Now:');
    
    if (!isEventNotification) return;

    // Only track reactions for valid RSVP emojis
    const validEmojis = ['✅', '❌', '❓'];
    if (!validEmojis.includes(reaction.emoji.name)) return;

    try {
      // Extract event title from embed
      let eventTitle = embed.title;
      eventTitle = eventTitle.replace('📅 New Event: ', '');
      eventTitle = eventTitle.replace('⏰ Reminder: ', '');
      eventTitle = eventTitle.replace('🚀 Starting Now: ', '');
      
      // Remove the RSVP using message ID as event ID
      const eventId = reaction.message.id;
      removeRSVP(eventId, user.id);
      
      logger.info(`${user.tag} removed reaction ${reaction.emoji.name} for "${eventTitle}" (message ${eventId})`);
      
      // Update the message with current RSVP stats
      const stats = getRSVPStats(eventId);
      
      // Build RSVP text
      const rsvpText = `✅ ${stats.yes} | ❌ ${stats.no} | ❓ ${stats.maybe}`;
      
      // Clone embed data
      const embedData = embed.toJSON();
      
      // Find RSVP field and update or remove it
      const rsvpFieldIndex = embedData.fields?.findIndex(f => f.name === '📊 RSVPs');
      
      if (stats.total === 0) {
        // Remove RSVP field if no one has responded
        if (rsvpFieldIndex >= 0) {
          embedData.fields.splice(rsvpFieldIndex, 1);
        }
      } else {
        // Update RSVP field
        if (rsvpFieldIndex >= 0) {
          embedData.fields[rsvpFieldIndex].value = rsvpText;
        }
      }

      await reaction.message.edit({ embeds: [embedData] });
      logger.info(`Updated RSVP stats for event "${eventTitle}": ${rsvpText}`);
    } catch (error) {
      logger.error('Failed to process RSVP removal:', error);
    }
  },
};
