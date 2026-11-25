import request from 'supertest';

export const PASSWORD = 'correct-horse-1';

export async function registerAndLogin(app, email = 'owner@example.com') {
  await request(app).post('/api/auth/signup').send({ email, password: PASSWORD });
  return request(app).post('/api/auth/login').send({ email, password: PASSWORD });
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
