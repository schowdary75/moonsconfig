import Joi from 'joi';

const wishlistItem = Joi.object({
  itemId: Joi.string().max(100).required(),
  itemType: Joi.string().valid('package', 'stay', 'experience', 'car').required(),
  name: Joi.string().max(255).required(),
  price: Joi.number().integer().min(0).required(),
  imageKey: Joi.string().max(255).allow('').required(),
  detail: Joi.string().max(255).allow('').required(),
});

export const addWishlistSchema = Joi.object({
  body: wishlistItem.required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const replaceWishlistSchema = Joi.object({
  body: Joi.object({ items: Joi.array().items(wishlistItem).max(500).required() }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const removeWishlistSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({
    itemType: Joi.string().valid('package', 'stay', 'experience', 'car').required(),
    itemId: Joi.string().max(100).required(),
  }),
  query: Joi.object(),
});

export const bookingIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ bookingId: Joi.number().integer().positive().required() }),
  query: Joi.object(),
});

export const createTripIncidentSchema = Joi.object({
  body: Joi.object({
    issueType: Joi.string().valid('transport_no_show', 'hotel_issue').required(),
    details: Joi.string().trim().max(1000).allow('').optional(),
  }).required(),
  params: Joi.object({ bookingId: Joi.number().integer().positive().required() }),
  query: Joi.object(),
});

export const incidentReceiptUploadSchema = Joi.object({
  body: Joi.object({
    filename: Joi.string().trim().min(1).max(255).required(),
    mimeType: Joi.string()
      .trim()
      .valid('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
      .required(),
    sizeBytes: Joi.number().integer().positive().max(10485760).required(),
    checksumSha256: Joi.string()
      .pattern(/^[A-Za-z0-9+/=]{40,100}$/)
      .optional(),
    expenseType: Joi.string().valid('transport', 'hotel').required(),
    amount: Joi.number().positive().precision(2).max(1000000).required(),
    currency: Joi.string().uppercase().length(3).required(),
    merchant: Joi.string().trim().max(255).allow('').optional(),
  }).required(),
  params: Joi.object({
    bookingId: Joi.number().integer().positive().required(),
    incidentId: Joi.number().integer().positive().required(),
  }),
  query: Joi.object(),
});

export const incidentReceiptResolutionSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({
    bookingId: Joi.number().integer().positive().required(),
    incidentId: Joi.number().integer().positive().required(),
  }),
  query: Joi.object(),
});

export const invoiceReferenceSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ bookingReference: Joi.string().max(100).required() }),
  query: Joi.object(),
});

export const registerDeviceSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().trim().min(16).max(512).required(),
    platform: Joi.string().valid('android', 'ios').required(),
    appVersion: Joi.string().trim().max(40).allow('').optional(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const removeDeviceSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({ token: Joi.string().min(16).max(512).required() }),
  query: Joi.object(),
});

const quoteVersionParams = Joi.object({
  quoteVersionId: Joi.string()
    .guid({ version: ['uuidv4'] })
    .required(),
});

export const proposalViewSchema = Joi.object({
  body: Joi.object(),
  params: quoteVersionParams,
  query: Joi.object(),
});

export const quoteCommentSchema = Joi.object({
  body: Joi.object({ body: Joi.string().trim().min(1).max(4000).required() }).required(),
  params: quoteVersionParams,
  query: Joi.object(),
});

export const quoteAcceptanceSchema = Joi.object({
  body: Joi.object({
    signerName: Joi.string().trim().min(2).max(255).required(),
    termsVersion: Joi.string().trim().min(1).max(40).required(),
  }).required(),
  params: quoteVersionParams,
  query: Joi.object(),
});

export const travelDocumentUploadSchema = Joi.object({
  body: Joi.object({
    tripId: Joi.string()
      .guid({ version: ['uuidv4'] })
      .optional(),
    partyMemberId: Joi.string()
      .guid({ version: ['uuidv4'] })
      .optional(),
    documentType: Joi.string()
      .valid('passport', 'visa', 'id', 'insurance', 'ticket', 'voucher', 'medical', 'other')
      .required(),
    filename: Joi.string().trim().min(1).max(255).required(),
    mimeType: Joi.string().trim().min(3).max(120).required(),
    sizeBytes: Joi.number().integer().positive().max(10485760).required(),
    checksumSha256: Joi.string()
      .pattern(/^[A-Za-z0-9+/=]{40,100}$/)
      .optional(),
    expiresOn: Joi.date().iso().optional(),
    issuingCountry: Joi.string().length(2).optional(),
  }).required(),
  params: Joi.object(),
  query: Joi.object(),
});

export const travelDocumentIdSchema = Joi.object({
  body: Joi.object(),
  params: Joi.object({
    documentId: Joi.string()
      .guid({ version: ['uuidv4'] })
      .required(),
  }),
  query: Joi.object(),
});
