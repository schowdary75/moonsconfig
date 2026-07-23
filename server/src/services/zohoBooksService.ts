import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

let accessToken: { value: string; expiresAt: number } | null = null;

async function token() {
  if (accessToken && accessToken.expiresAt > Date.now() + 60_000) return accessToken.value;
  const body = new URLSearchParams({
    refresh_token: env.zoho.refreshToken,
    client_id: env.zoho.clientId,
    client_secret: env.zoho.clientSecret,
    grant_type: 'refresh_token',
  });
  const response = await fetch(env.zoho.accountsUrl, { method: 'POST', body });
  const payload = (await response.json()) as any;
  if (!response.ok || !payload.access_token)
    throw new Error(`Zoho OAuth failed (${response.status})`);
  accessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return accessToken.value;
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(
    `${env.zoho.baseUrl}${path}${path.includes('?') ? '&' : '?'}organization_id=${encodeURIComponent(env.zoho.organizationId)}`,
    {
      ...init,
      headers: {
        Authorization: `Zoho-oauthtoken ${await token()}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    },
  );
  const payload = (await response.json()) as any;
  if (!response.ok || (payload.code !== undefined && payload.code !== 0)) {
    throw new Error(
      `Zoho Books request failed (${response.status}): ${String(payload.message || 'unknown error')}`,
    );
  }
  return payload;
}

export const zohoBooksService = {
  configured() {
    return Boolean(
      env.zoho.enabled &&
      env.zoho.organizationId &&
      env.zoho.clientId &&
      env.zoho.clientSecret &&
      env.zoho.refreshToken &&
      env.zoho.taxId &&
      env.zoho.itemId &&
      env.platformBusiness.legalName &&
      env.platformBusiness.gstin &&
      env.platformBusiness.stateCode,
    );
  },

  async createInvoice(input: {
    tenantId: string;
    companyName: string;
    gstin: string | null;
    billingAddress: string;
    placeOfSupply: string | null;
    invoiceNumber: string;
    description: string;
    amountPaise: number;
  }) {
    if (!this.configured())
      throw new AppError(503, 'GST invoicing configuration is incomplete', 'INVOICING_NOT_READY');
    const contactResult = await request('/contacts', {
      method: 'POST',
      body: JSON.stringify({
        contact_name: input.companyName,
        company_name: input.companyName,
        contact_type: 'customer',
        gst_treatment: input.gstin ? 'business_gst' : 'business_none',
        gst_no: input.gstin || undefined,
        place_of_contact: input.placeOfSupply || undefined,
        billing_address: { address: input.billingAddress },
        custom_fields: [{ label: 'MooNsConfig Tenant ID', value: input.tenantId }],
      }),
      headers: {
        'X-Unique-Identifier-Key': 'custom_fields.MooNsConfig Tenant ID',
        'X-Unique-Identifier-Value': input.tenantId,
      },
    });
    const contactId = contactResult.contact?.contact_id;
    if (!contactId) throw new Error('Zoho Books did not return a contact ID');
    const invoiceResult = await request('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: contactId,
        reference_number: input.invoiceNumber,
        place_of_supply: input.placeOfSupply || undefined,
        line_items: [
          {
            item_id: env.zoho.itemId,
            description: input.description,
            quantity: 1,
            rate: input.amountPaise / 100,
            tax_id: env.zoho.taxId,
            hsn_or_sac: env.platformBusiness.sac,
          },
        ],
        notes: `MooNsConfig subscription for tenant ${input.tenantId}`,
      }),
    });
    return invoiceResult.invoice as {
      invoice_id: string;
      invoice_number: string;
      status: string;
      sub_total: number;
      tax_total: number;
      total: number;
    };
  },
};
