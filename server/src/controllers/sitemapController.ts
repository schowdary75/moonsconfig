import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';

const staticPages = [
  '',
  '/about',
  '/contact',
  '/packages',
  '/faq',
  '/stays',
  '/experiences',
  '/privacy',
  '/terms',
  '/cancellation',
];

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export async function sitemapController(request: Request, response: Response, next: NextFunction) {
  try {
    const rows = await prisma.packages.findMany({
      where: { is_active: true },
      select: { slug: true },
    });
    const configuredOrigin =
      process.env.PUBLIC_SITE_ORIGIN || process.env.MOONS_PUBLIC_ORIGIN || '';
    const protocol = request.get('x-forwarded-proto') ?? request.protocol;
    const host = request.get('host') ?? 'localhost';
    const baseUrl = configuredOrigin.replace(/\/+$/, '') || `${protocol}://${host}`;
    const urls = [
      ...staticPages.map((page) => ({ path: page, priority: page ? '0.8' : '1.0' })),
      ...rows.map((item) => ({
        path: `/packages/${item.slug}`,
        priority: '0.9',
      })),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map(
        (item) =>
          `  <url>\n    <loc>${escapeXml(`${baseUrl}${item.path}`)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`,
      )
      .join('\n')}\n</urlset>`;
    response
      .status(200)
      .set({
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      })
      .send(xml);
  } catch (error) {
    next(error);
  }
}
