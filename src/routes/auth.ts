import { Router, Request, Response } from 'express';
import DiscordOauth2 from 'discord-oauth2';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const oauth = new DiscordOauth2();

// Étape 1 : redirige vers Discord
router.get('/login', (req: Request, res: Response) => {
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
    const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
    const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;
    const JWT_SECRET = process.env.JWT_SECRET!;

    const url = oauth.generateAuthUrl({
        clientId: CLIENT_ID,
        scope: ['identify', 'guilds'],
        redirectUri: REDIRECT_URI,
    });
    //console.log('OAuth URL:', url);
    //console.log('CLIENT_ID:', CLIENT_ID);
    //console.log('CLIENT_SECRET:', CLIENT_SECRET);
    //console.log('JWT_SECRET:', JWT_SECRET);
    res.redirect(url);
});

// Étape 2 : Discord renvoie ici avec un code
router.get('/callback', async (req: Request, res: Response) => {
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
    const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
    const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;
    const JWT_SECRET = process.env.JWT_SECRET!;

    const code = req.query.code as string;

    if (!code) {
        res.status(400).json({ error: 'Missing code' });
        return;
    }

    try {
        // Échange le code contre un access token Discord
        const tokenData = await oauth.tokenRequest({
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            redirectUri: REDIRECT_URI,
            code,
            scope: ['identify', 'guilds'],
            grantType: 'authorization_code',
        });

        // Récupère les infos de l'utilisateur
        const user = await oauth.getUser(tokenData.access_token);

        //console.log('global_name raw:', JSON.stringify(user.global_name));

        // Crée un JWT avec les infos utiles
        const jwtToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                globalName: user.global_name ?? user.username,
                avatar: user.avatar,
                accessToken: tokenData.access_token,
            },
            JWT_SECRET,
            { expiresIn: '100d' }
        );

        // Redirige vers le dashboard Angular avec le JWT en query param
        res.redirect(`http://localhost:4200/auth/callback?token=${jwtToken}`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'OAuth2 failed' });
    }
});

export default router;