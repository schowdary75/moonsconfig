import 'dotenv/config';
import readXlsxFile from 'read-excel-file/node';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const downloads = 'C:\\Users\\racin\\Downloads';
const files = [
  { name: 'Travel_Agents.xlsx', coverage: 'International', source: 'Travel_Agents_Sheet' },
  { name: 'TAAI_Travel_Agents.xlsx', coverage: 'India', source: 'TAAI_Travel_Agents_Sheet' },
  { name: 'Nidhi_Directory.xlsx', coverage: 'India', source: 'Nidhi_Directory_Sheet' },
  { name: 'IATO_Members.xlsx', coverage: 'India', source: 'IATO_Members_Sheet' },
];

import crypto from 'crypto';

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const hash = crypto.createHash('md5').update(name).digest('hex').substring(0, 6);
  return `${base}-${hash}`;
}

function cleanEmail(email: any): string | null {
  if (!email || typeof email !== 'string') return null;
  const match = email.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
  if (match) return match[1].toLowerCase();
  return null;
}

function cleanPhone(phone: any): string | null {
  if (!phone) return null;
  const p = String(phone).replace(/[^\d+]/g, '');
  return p.length > 0 ? p.substring(0, 50) : null;
}

async function main() {
  console.log('Starting vendor import...');
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const fileDef of files) {
    console.log(`Processing ${fileDef.name}...`);
    try {
      const fullPath = path.join(downloads, fileDef.name);
      const rows = await readXlsxFile(fullPath);
      if (!rows.length) throw new Error(`Workbook ${fileDef.name} has no rows`);
      const headers = rows[0].map((value) => String(value ?? ''));
      const data = rows
        .slice(1)
        .map((row) =>
          Object.fromEntries(
            row.flatMap((value, columnNumber) =>
              headers[columnNumber] ? [[headers[columnNumber], value]] : [],
            ),
          ),
        );

      const validVendors = [];
      const seenEmails = new Set();

      for (const row of data) {
        let companyName = row['Company Name'] || row['Member Name'];
        let contactName = row['CP_1_Name'] || row['Accredited Representatives'] || 'Admin';
        let email = cleanEmail(row['Email'] || row['CP_1_Email']);
        let phone = cleanPhone(row['Phone'] || row['CP_1_Phone'] || row['Mobile']);

        if (!companyName || typeof companyName !== 'string') continue;
        companyName = companyName.substring(0, 220).trim();
        if (!companyName) continue;

        contactName = String(contactName).substring(0, 160).trim();

        if (email) {
          if (seenEmails.has(email)) continue;
          seenEmails.add(email);
        }

        const vendor = {
          slug: generateSlug(companyName),
          company_name: companyName,
          contact_name: contactName,
          email: email || undefined,
          phone: phone || undefined,
          coverage_areas: JSON.stringify([fileDef.coverage]),
          source_name: fileDef.source,
        };

        validVendors.push(vendor);
      }

      console.log(`Found ${validVendors.length} valid rows to insert from ${fileDef.name}.`);

      let fileInserted = 0;
      let fileSkipped = 0;
      const chunkSize = 1000;
      for (let i = 0; i < validVendors.length; i += chunkSize) {
        const chunk = validVendors.slice(i, i + chunkSize);
        const result = await prisma.vendors.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        fileInserted += result.count;
        fileSkipped += chunk.length - result.count;
      }

      console.log(`Successfully inserted ${fileInserted} vendors from ${fileDef.name}.`);
      totalInserted += fileInserted;
      totalSkipped += fileSkipped;
    } catch (err: any) {
      console.error(`Error processing ${fileDef.name}:`, err.message);
    }
  }

  console.log(
    `Import completed. Total inserted: ${totalInserted}, Total skipped (duplicates): ${totalSkipped}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
