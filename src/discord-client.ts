import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

export const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
discordClient.login(process.env.DISCORD_BOT_TOKEN);

discordClient.once('clientReady', () => {
  console.log(`Discord client prêt ! ${discordClient.guilds.cache.size} serveurs en cache`);
});