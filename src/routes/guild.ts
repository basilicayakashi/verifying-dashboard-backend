import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import dotenv from 'dotenv';
import { discordClient as client } from '../discord-client';

dotenv.config();

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;

const authMiddleware = (req: any, res: Response, next: any) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/updateWelcome', authMiddleware, async (req: any, res: Response) => {
  try {
    const { guildId, message } = req.body;

    console.log('updateWelcome body:', req.body);

    if (!guildId) {
      res.status(400).json({ error: 'Missing guildId' });
      return;
    }

    if (!message || message.trim() === '') {
      await db.query(
        'DELETE FROM guild_welcome_messages WHERE guild_id = $1',
        [guildId]
      );

      res.json({ success: true, action: 'deleted' });
      return;
    }

    await db.query(
      `
      INSERT INTO guild_welcome_messages
        (guild_id, dm_message, updated_at)
      VALUES
        ($1, $2, NOW())
      ON CONFLICT (guild_id) DO UPDATE SET
        dm_message = EXCLUDED.dm_message,
        updated_at = EXCLUDED.updated_at
      `,
      [guildId, message.trim()]
    );

    res.json({ success: true, action: 'upserted' });
  } catch (error) {
    console.error('updateWelcome error:', error);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

router.post('/updateVerification', authMiddleware, async (req: any, res: Response) => {
  try {
    console.log('updateVerification body:', req.body);
    const { guildId, verified_role_id, staff_category_id, staff_role_id, verification_timeout_hours } = req.body;
    const createdBy = req.user?.id; // ou req.session.user.id selon ton auth

    if (!guildId) {
      res.status(400).json({ error: 'Missing guildId' });
      return;
    }

    if (!createdBy) {
      return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }

    await db.query(`
       INSERT INTO guild_verification_settings (
          guild_id,
          verified_role_id,
          staff_category_id,
          staff_role_id,
          created_by,
          updated_at,
          verification_timeout_hours
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        ON CONFLICT (guild_id)
        DO UPDATE SET
          verified_role_id = EXCLUDED.verified_role_id,
          staff_category_id = EXCLUDED.staff_category_id,
          staff_role_id = EXCLUDED.staff_role_id,
          updated_at = NOW(),
          verification_timeout_hours = EXCLUDED.verification_timeout_hours
    `, [guildId,
      verified_role_id,
      staff_category_id,
      staff_role_id,
      createdBy,
      verification_timeout_hours,]);

    res.json({ success: true });
  } catch (error) {
    console.error('updateVerification error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/updateQuestions', authMiddleware, async (req: any, res: Response) => {
  try {
    console.log('updateQuestions body:', req.body);
    const { guildId, questions } = req.body;

    if (!guildId) {
      res.status(400).json({ error: 'Missing guildId' });
      return;
    }

    if (!Array.isArray(questions)) {
      res.status(400).json({ error: 'Missing questions' });
      return;
    }

    // Supprime toutes les questions existantes
    await db.query('DELETE FROM guild_verification_questions WHERE guild_id = $1', [guildId]);

    // Réinsère les nouvelles questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await db.query(`
        INSERT INTO guild_verification_questions 
          (guild_id, question_order, question_key, question_label, question_type, required)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [guildId, i + 1, `question_${Date.now()}`, q.question_label, q.question_type, q.required]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('updateQuestions error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/updateRoleMessageDeleteSettings', authMiddleware, async (req: any, res: Response) => {
  try {
    const {
      guildId,
      enabled,
      role_id1,
      role_id2,
      role_id3,
      role_id4,
      role_id5
    } = req.body;

    console.log('updateRoleMessageDeleteSettings body:', req.body);
    console.log('updateRoleMessageDeleteSettings user:', req.user);

    const updatedBy = req.user?.id;

    console.log('updatedBy:', updatedBy);

    if (!guildId) {
      res.status(400).json({ error: 'Missing guildId' });
      return;
    }

    if (!updatedBy) {
      res.status(401).json({ error: 'Unauthenticated user' });
      return;
    }

    await db.query(`
      INSERT INTO guild_role_message_delete_settings (
        guild_id,
        enabled,
        role_id1,
        role_id2,
        role_id3,
        role_id4,
        role_id5,
        updated_by,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (guild_id)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        role_id1 = EXCLUDED.role_id1,
        role_id2 = EXCLUDED.role_id2,
        role_id3 = EXCLUDED.role_id3,
        role_id4 = EXCLUDED.role_id4,
        role_id5 = EXCLUDED.role_id5,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `, [
      guildId,
      enabled === true,
      role_id1 || null,
      role_id2 || null,
      role_id3 || null,
      role_id4 || null,
      role_id5 || null,
      updatedBy
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('updateRoleMessageDeleteSettings error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/saveReactionRoles', authMiddleware, async (req: any, res: Response) => {
  const client = await db.connect();
  try {
    const { guild_id, header, lines } = req.body;

    if (!guild_id || !header) {
      res.status(400).json({ error: 'Missing fields' });
      return;
    }

    await client.query('BEGIN');

    let categoryId = header.id;

    // Traitement de l'entête (catégorie)
    if (header.id === 0) {
      const result = await client.query(
        'INSERT INTO reaction_role_categories (guild_id, name) VALUES ($1, $2) RETURNING id',
        [guild_id, header.name.trim()]
      );
      categoryId = result.rows[0].id;
    } else if (header.id > 0) {
      await client.query(
        'UPDATE reaction_role_categories SET name = $1 WHERE id = $2 AND guild_id = $3',
        [header.name.trim(), header.id, guild_id]
      );
    } else {
      // DELETE (id < 0) — CASCADE supprime les entrées automatiquement
      await client.query(
        'DELETE FROM reaction_role_categories WHERE id = $1 AND guild_id = $2',
        [Math.abs(header.id), guild_id]
      );
      await client.query('COMMIT');
      res.json({ success: true, action: 'deleted' });
      return;
    }

    // Traitement des lignes
    if (Array.isArray(lines)) {
      for (const line of lines) {
        if (line.id === 0) {
          await client.query(
            'INSERT INTO reaction_role_entries (category_id, role_id, description, emoji) VALUES ($1, $2, $3, $4)',
            [categoryId, line.role_id, line.description.trim(), line.emoji.trim()]
          );
        } else if (line.id > 0) {
          await client.query(
            'UPDATE reaction_role_entries SET role_id = $1, description = $2, emoji = $3 WHERE id = $4 AND category_id = $5',
            [line.role_id, line.description.trim(), line.emoji.trim(), line.id, categoryId]
          );
        } else {
          await client.query(
            'DELETE FROM reaction_role_entries WHERE id = $1 AND category_id = $2',
            [Math.abs(line.id), categoryId]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, action: 'saved', categoryId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('saveReactionRoles error:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});














router.post('/:id', authMiddleware, async (req: any, res: Response) => {
  try {
    const guildId = req.params.id;

    //console.log('Client prêt:', client.isReady());
    //console.log('Cache guilds:', client.guilds.cache.size);

    const botGuild = client.guilds.cache.get(guildId);

    // Récupère les rôles du serveur
    const roles = botGuild?.roles.cache
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
      .sort((a, b) => a.name.localeCompare(b.name)) ?? [];

    const categories = botGuild?.channels.cache
      .filter(c => c.type === 4) // 4 = GuildCategory
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name)) ?? [];

    const verificationSettingsResult = await db.query(
      'SELECT * FROM guild_verification_settings WHERE guild_id = $1',
      [guildId]
    );

    const welcomeMessageResult = await db.query(
      'SELECT * FROM guild_welcome_messages WHERE guild_id = $1',
      [guildId]
    );

    const questionsResult = await db.query(
      `
      SELECT *
      FROM guild_verification_questions
      WHERE guild_id = $1
      ORDER BY question_order ASC
      `,
      [guildId]
    );

    const roleMessageDeleteSettingsResult = await db.query(
      `
      SELECT *
      FROM guild_role_message_delete_settings
      WHERE guild_id = $1
      `,
      [guildId]
    );

    const reactionRoleCategoriesResult = await db.query(
      `
      SELECT id, name
      FROM reaction_role_categories
      WHERE guild_id = $1
      `,
      [guildId]
    );

    const reactionRoleEntriesResult = await db.query(
      `
      select reaction_role_entries.*
      from reaction_role_entries 
      inner join reaction_role_categories on reaction_role_categories.id=reaction_role_entries.category_id 
      where reaction_role_categories.guild_id = $1
      `,
      [guildId]
    );

    // liste des emojis personnalisés du serveur
    const customEmojis = botGuild?.emojis.cache
      .map(e => ({
        id: e.id,
        name: e.name,
        animated: e.animated,
        url: e.imageURL(),
        formatted: e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`
      })) ?? [];

    res.json({
      guild: {
        id: guildId,
        name: botGuild?.name ?? 'Serveur inconnu',
        icon: botGuild?.iconURL() ?? null,
        memberCount: botGuild?.memberCount ?? null,
      },
      customEmojis,
      roles,
      categories,
      verificationSettings: verificationSettingsResult.rows[0] ?? null,
      welcomeMessage: welcomeMessageResult.rows[0] ?? null,
      questions: questionsResult.rows,
      roleMessageDeleteSettings: roleMessageDeleteSettingsResult.rows[0] ?? null,
      reactionRoleCategories: reactionRoleCategoriesResult.rows,
      reactionRoleEntries: reactionRoleEntriesResult.rows,
    });
  } catch (error) {
    console.error('get guild config error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;