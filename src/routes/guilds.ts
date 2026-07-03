import { Router, Response } from 'express';
import DiscordOauth2 from 'discord-oauth2';
import jwt from 'jsonwebtoken';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { db } from '../db';
import { discordClient as client } from '../discord-client';
dotenv.config();

const router = Router();
const oauth = new DiscordOauth2();
const JWT_SECRET = process.env.JWT_SECRET!;

const authMiddleware = (req: any, res: Response, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
};

router.post('/', authMiddleware, async (req: any, res: Response) => {
    try {
        //console.log('Bot connecté:', client.isReady());
        //console.log('Guilds du bot:', client.guilds.cache.size);
        const userGuilds = await oauth.getUserGuilds(req.user.accessToken);
        //console.log('Guilds user (total):', userGuilds.length);

        // Guilds où l'utilisateur est admin
        const adminGuilds = userGuilds.filter(
            g => (BigInt(g.permissions ?? '0') & BigInt(0x8)) === BigInt(0x8)
        );
        //console.log('Guilds user (admin):', adminGuilds.length);

        // Guilds où le bot est présent
        const botGuildIds = new Set(client.guilds.cache.map(g => g.id));
        //console.log('IDs bot:', [...botGuildIds]);
        //console.log('IDs user admin:', adminGuilds.map(g => g.id));

        //console.log('Intersection:', adminGuilds.filter(g => botGuildIds.has(g.id)).map(g => g.name));
        //console.log('Premier ID bot (type):', typeof [...botGuildIds][0], JSON.stringify([...botGuildIds][0]));
        //console.log('Premier ID admin (type):', typeof adminGuilds[0].id, JSON.stringify(adminGuilds[0].id));

        // Intersection : admin ET bot présent
        const result = adminGuilds
            .filter(g => botGuildIds.has(g.id))
            .map(g => {
                const botGuild = client.guilds.cache.get(g.id);
                return {
                    id: g.id,
                    name: g.name,
                    icon: g.icon
                        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
                        : null,
                    memberCount: botGuild?.memberCount ?? null,
                };
            });

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch guilds' });
    }
});

router.post('/available', authMiddleware, async (req: any, res: Response) => {
  try {
    const userGuilds = await oauth.getUserGuilds(req.user.accessToken);
    const adminGuilds = userGuilds.filter(
      g => (BigInt(g.permissions ?? '0') & BigInt(0x8)) === BigInt(0x8)
    );
    const botGuildIds = new Set(client.guilds.cache.map(g => g.id));

    // Serveurs admin où le bot N'est PAS présent
    const result = adminGuilds
      .filter(g => !botGuildIds.has(g.id))
      .map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png`
          : null,
      }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch available guilds' });
  }
});

export default router;