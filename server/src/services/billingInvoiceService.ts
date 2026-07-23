import { platformPrisma } from '../config/platformPrisma.js';
import { billingInvoiceQueue } from '../jobs/queues.js';
import { zohoBooksService } from './zohoBooksService.js';

export const billingInvoiceService = {
  async createForPayment(input: {
    tenantId: string;
    subscriptionId?: string;
    eventId: string;
    amountPaise: number;
    description: string;
  }) {
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: input.tenantId } });
    if (!tenant) return null;
    const invoiceNumber = `MC-${new Date().getUTCFullYear()}-${input.eventId
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-16)
      .toUpperCase()}`;
    const invoice = await platformPrisma.billingInvoice.upsert({
      where: { idempotencyKey: input.eventId },
      create: {
        tenantId: tenant.id,
        subscriptionId: input.subscriptionId,
        invoiceNumber,
        legalName: tenant.name,
        gstin: tenant.gstin,
        billingAddress: tenant.billingAddress,
        subtotalPaise: input.amountPaise,
        totalPaise: input.amountPaise,
        amountPaidPaise: input.amountPaise,
        balancePaise: 0,
        status: 'paid',
        paidAt: new Date(),
        idempotencyKey: input.eventId,
        lines: {
          create: {
            description: input.description,
            unitAmountPaise: input.amountPaise,
            hsnSac: '998314',
          },
        },
      },
      update: {},
    });
    if (zohoBooksService.configured() && !invoice.providerInvoiceId) {
      await billingInvoiceQueue.add(
        'zoho-invoice',
        { invoiceId: invoice.id },
        { jobId: `invoice-${invoice.id}` },
      );
    }
    return invoice;
  },

  async sync(invoiceId: string) {
    const invoice = await platformPrisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { lines: true, tenant: true },
    });
    if (!invoice || invoice.providerInvoiceId) return;
    try {
      const result = await zohoBooksService.createInvoice({
        tenantId: invoice.tenantId,
        companyName: invoice.legalName,
        gstin: invoice.gstin,
        billingAddress: invoice.billingAddress,
        placeOfSupply: invoice.placeOfSupply,
        invoiceNumber: invoice.invoiceNumber,
        description: invoice.lines[0]?.description || 'MooNsConfig subscription',
        amountPaise: invoice.subtotalPaise,
      });
      await platformPrisma.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          provider: 'zoho_books',
          providerInvoiceId: result.invoice_id,
          providerStatus: result.status,
          status: invoice.paidAt ? 'paid' : 'issued',
          subtotalPaise: Math.round(result.sub_total * 100),
          taxPaise: Math.round(result.tax_total * 100),
          totalPaise: Math.round(result.total * 100),
          amountPaidPaise: invoice.paidAt ? Math.round(result.total * 100) : 0,
          balancePaise: invoice.paidAt ? 0 : Math.round(result.total * 100),
          issuedAt: new Date(),
        },
      });
    } catch (error) {
      await platformPrisma.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'failed',
          providerStatus: error instanceof Error ? error.message.slice(0, 80) : 'failed',
        },
      });
      throw error;
    }
  },

  async list(tenantId: string) {
    return platformPrisma.billingInvoice.findMany({
      where: { tenantId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  },
};
