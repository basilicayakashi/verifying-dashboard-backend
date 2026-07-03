import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth';
import guildsRouter from './routes/guilds';
import guildRouter from './routes/guild';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'http://localhost:4200', // Angular dev server
  credentials: true
}));

app.use(express.json());

app.use('/auth', authRouter);
app.use('/api/guilds', guildsRouter);
app.use('/api/guild', guildRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/config', (req, res) => {
  res.json({ clientId: process.env.DISCORD_CLIENT_ID });
});

app.listen(PORT, () => {
  console.log(`Dashboard API running on port ${PORT}`);
});