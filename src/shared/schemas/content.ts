import { z } from 'zod';

export const CONTENT_KINDS = [
  'page',
  'service',
  'blog',
  'faq',
  'guide',
  'contract',
  'terms',
] as const;
export const CONTENT_AUDIENCES = ['public', 'parent', 'tutor'] as const;
export const CONTENT_STATUSES = ['draft', 'published', 'retired'] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];
export type ContentAudience = (typeof CONTENT_AUDIENCES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

const slug = z
  .string()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang.');
const fields = {
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().max(500),
  // Deliberately plain text. The client renders it as text nodes, never raw HTML.
  bodyText: z.string().trim().min(1).max(20_000),
};
const paging = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
};

export const createContentSchema = z
  .strictObject({
    kind: z.enum(CONTENT_KINDS),
    slug,
    audience: z.enum(CONTENT_AUDIENCES),
    ...fields,
  })
  .superRefine((value, context) => {
    if (value.kind !== 'blog') return;
    if (!/^(phu-huynh|gia-su)-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) {
      context.addIssue({
        code: 'custom',
        path: ['slug'],
        message: 'Bài viết cần thuộc danh mục phụ huynh hoặc gia sư.',
      });
    }
    if (value.audience !== 'public') {
      context.addIssue({
        code: 'custom',
        path: ['audience'],
        message: 'Bài viết của hai danh mục hiện được công bố công khai.',
      });
    }
  });
export type CreateContentInput = z.infer<typeof createContentSchema>;

export const editContentSchema = z.strictObject({
  ...fields,
  editVersion: z.number().int().min(1),
});
export type EditContentInput = z.infer<typeof editContentSchema>;

export const contentTransitionSchema = z.strictObject({
  editVersion: z.number().int().min(1),
});

export const publicContentListSchema = z.strictObject({
  kind: z.enum(CONTENT_KINDS).optional(),
  audience: z.enum(CONTENT_AUDIENCES).default('public'),
  slugPrefix: z
    .string()
    .regex(/^[a-z0-9-]{2,30}$/)
    .optional(),
  ...paging,
});
export type PublicContentListQuery = z.infer<typeof publicContentListSchema>;

export const publicContentDetailSchema = z.strictObject({
  audience: z.enum(CONTENT_AUDIENCES).default('public'),
});

export const adminContentListSchema = z.strictObject({
  kind: z.enum(CONTENT_KINDS).optional(),
  audience: z.enum(CONTENT_AUDIENCES).optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  ...paging,
});
export type AdminContentListQuery = z.infer<typeof adminContentListSchema>;

export interface PublishedContent {
  id: string;
  kind: ContentKind;
  slug: string;
  audience: ContentAudience;
  revision: number;
  title: string;
  summary: string;
  bodyText: string;
  publishedAt: string;
}

export interface AdminContent extends Omit<PublishedContent, 'publishedAt'> {
  editVersion: number;
  status: ContentStatus;
  createdBy: string | null;
  publishedBy: string | null;
  revisedFromId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
