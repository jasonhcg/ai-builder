const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DB_ID = process.env.NOTION_DATABASE_ID;

const VALID_STATUSES = ['Suggested', 'To Build', 'In Progress', 'Done'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dashboard-Pin');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    try {
      const results = [];
      let cursor;

      do {
        const page = await notion.databases.query({
          database_id: DB_ID,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        results.push(...page.results);
        cursor = page.has_more ? page.next_cursor : undefined;
      } while (cursor);

      const rows = results.map(page => ({
        id: page.id,
        name: page.properties.Name?.title?.[0]?.plain_text ?? '',
        status: page.properties.Status?.select?.name ?? 'To Build',
        priority: page.properties.Priority?.select?.name ?? '',
        description: page.properties.Description?.rich_text?.[0]?.plain_text ?? '',
      }));

      return res.status(200).json(rows);
    } catch (err) {
      console.error('GET /api/roadmap error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    const pin = req.headers['x-dashboard-pin'];
    if (!pin || pin !== process.env.DASHBOARD_PIN) {
      return res.status(401).json({ error: 'Incorrect PIN' });
    }

    const { id, status } = req.body ?? {};

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id is required' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    try {
      await notion.pages.update({
        page_id: id,
        properties: {
          Status: { select: { name: status } },
        },
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('PATCH /api/roadmap error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
