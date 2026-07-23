import type { PrismaClient } from '@prisma/client';
import type { DocumentVault, StoredDocument } from './passport.js';

/**
 * Persistent document vault backed by the additive `traveller_documents` table.
 * Swap this in for the in-memory fallback in production wiring.
 */
export class PrismaDocumentVault implements DocumentVault {
  constructor(private readonly prisma: PrismaClient) {}

  async put(doc: Omit<StoredDocument, 'id'>): Promise<StoredDocument> {
    const row = await this.prisma.traveller_documents.create({
      data: {
        traveler_ref: doc.travelerRef,
        doc_type: doc.type,
        file_url: doc.fileUrl,
        expires_on: doc.expiresOn ?? null,
      },
    });
    return this.toStored(row);
  }

  async listFor(travelerRef: string): Promise<StoredDocument[]> {
    const rows = await this.prisma.traveller_documents.findMany({
      where: { traveler_ref: travelerRef },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => this.toStored(r));
  }

  private toStored(row: {
    id: number;
    traveler_ref: string;
    doc_type: string;
    file_url: string;
    expires_on: Date | null;
  }): StoredDocument {
    return {
      id: String(row.id),
      travelerRef: row.traveler_ref,
      type: row.doc_type as StoredDocument['type'],
      fileUrl: row.file_url,
      expiresOn: row.expires_on,
    };
  }
}
