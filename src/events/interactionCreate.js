const { Events } = require('discord.js');
const signupButton = require('../interactions/signupButton');
const logger = require('../utils/logger');

// Handlers for buttons on the bot's posts
const buttonHandlers = [signupButton];

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        logger.error(`Error autocompleting ${interaction.commandName}:`, error);
      }
      return;
    }

    if (interaction.isButton()) {
      const handler = buttonHandlers.find(h => h.matches(interaction));
      if (!handler) return;

      try {
        await handler.handle(interaction);
      } catch (error) {
        logger.error(`Error handling button ${interaction.customId}:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Something went wrong. Try again.', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      logger.info(`${interaction.user.tag} executed /${interaction.commandName}`);
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing ${interaction.commandName}:`, error);
      
      const errorMessage = {
        content: 'There was an error executing this command. Heimdallr\'s vision was momentarily clouded.',
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  },
};
