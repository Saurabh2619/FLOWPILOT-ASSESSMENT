import { z } from 'zod';

export const CATEGORIES = ['seo', 'speed', 'accessibility', 'content'];
export const PRIORITIES = ['high', 'medium', 'low'];

const text = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, max));

export const adviceSchema = z.object({
  summary: text(600),
  items: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        priority: z.enum(PRIORITIES),
        title: text(120),
        action: text(600),
      }),
    )
    .min(1)
    .transform((items) => items.slice(0, 8)),
});

export const responseSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING', enum: CATEGORIES },
          priority: { type: 'STRING', enum: PRIORITIES },
          title: { type: 'STRING' },
          action: { type: 'STRING' },
        },
        required: ['category', 'priority', 'title', 'action'],
      },
    },
  },
  required: ['summary', 'items'],
};
