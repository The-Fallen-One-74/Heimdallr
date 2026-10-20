const { linkGuild, createFakeDiscord } = require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.WEBHOOK_SECRET = 'test-secret';
const createWebhookRouter = require('../src/api/webhooks');
const { trackReportPost } = require('../src/services/reportPosts');

async function withServer(client, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/webhooks', createWebhookRouter(client));
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/webhooks`);
  } finally {
    server.close();
  }
}

const post = (url, body, secret = 'test-secret') => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
  body: JSON.stringify(body)
});

test('task webhooks need the secret and an UPDATE on tasks', async () => {
  await withServer(createFakeDiscord('g1'), async base => {
    assert.equal((await post(`${base}/tasks`, {}, 'wrong')).status, 401);
    assert.equal((await post(`${base}/tasks`, { type: 'INSERT', table: 'tasks', record: { id: 1 } })).status, 400);
    assert.equal((await post(`${base}/tasks`, { type: 'UPDATE', table: 'sprints', record: { id: 1 } })).status, 400);
  });
});

test('a task moving to Done replies under its /bug post', async () => {
  linkGuild('g1');
  const discord = createFakeDiscord('g1');
  trackReportPost({ taskId: 600, guildId: 'g1', channelId: 'channel-1', messageId: 'm600', type: 'bug', title: 'Crash', reporterId: 'u1' });

  await withServer(discord, async base => {
    const res = await post(`${base}/tasks`, {
      type: 'UPDATE', table: 'tasks', schema: 'public',
      record: { id: 600, column_id: 'done' }, old_record: { id: 600, column_id: 'product-backlog' }
    });
    assert.equal(res.status, 200);
    // The reply is sent after the webhook answers
    for (let i = 0; i < 20 && discord.channel.replies.length === 0; i++) await new Promise(r => setTimeout(r, 10));
  });

  assert.equal(discord.channel.replies[0].content, '✅ <@u1> your bug report **Crash** was fixed.');
});
