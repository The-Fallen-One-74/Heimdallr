require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Get guild ID from command line argument or environment variable
const guildId = process.argv[2] || process.env.GUILD_ID;

if (!guildId) {
  console.error('❌ Error: Guild ID is required!');
  console.log('\nUsage: node src/deploy-commands-guild.js <GUILD_ID>');
  console.log('Or add GUILD_ID to your .env file\n');
  console.log('To get your Guild ID:');
  console.log('1. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)');
  console.log('2. Right-click your server icon');
  console.log('3. Click "Copy Server ID"\n');
  process.exit(1);
}

const commands = [];

// Load commands recursively
function loadCommands(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      loadCommands(filePath);
    } else if (file.endsWith('.js')) {
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✓ Loaded command: ${command.data.name}`);
      } else {
        console.warn(`⚠ Command ${file} is missing required "data" or "execute" property`);
      }
    }
  }
}

const commandsPath = path.join(__dirname, 'commands');
loadCommands(commandsPath);

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\nRegistering ${commands.length} slash command(s) for guild ${guildId}...`);
    console.log('(Guild commands appear instantly!)\n');

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body: commands },
    );

    console.log(`✓ Successfully registered ${data.length} slash command(s) for this guild!\n`);
    
    data.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });

    console.log('\n✅ Commands should appear immediately in your Discord server!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();
