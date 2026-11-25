import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { testConfig } from './helpers/config.js';

const app = createApp(testConfig({ CORS_ORIGINS: 'http://allowed.test' }));

describe('API skeleton', () => {
  it('reports health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Not found');
  });

  it('rejects malformed JSON with a 400', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
  });

  it('allows only listed CORS origins', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://allowed.test');
    const blocked = await request(app).get('/api/health').set('Origin', 'http://evil.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://allowed.test');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
