// @ts-nocheck
import { z } from 'zod';
import { defineOperation } from './defineOperation.js';
import * as legacy from '../legacy/api/db.functions.server.js';

export const adminAiAutoQuote = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, leadId: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);

    const pool = await legacy.getDbPool();
    const [leadRows] = await pool.query('SELECT * FROM lead_submissions WHERE id = ?', [
      data.leadId,
    ]);
    const lead = (leadRows as any[])[0];
    if (!lead) throw new Error('Lead not found');

    const [pkgRows] = await pool.query(
      'SELECT id, name, destination, price, category FROM packages WHERE is_active = 1',
    );
    const packages = pkgRows as any[];
    if (!packages.length) throw new Error('No active packages available');

    let recommendedPackageId = packages[0].id;
    let discountPercent = 0;
    let customItinerary: any[] = [];

    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
        const genAI = await legacy.getGenAI();
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Step 1: Pick Package & Discount
        const matchPrompt = `You are an AI Travel Matchmaker.
        Lead: Dest=${lead.destination}, Budget=${lead.budget_range}, Theme=${lead.theme}, Notes=${lead.notes}.
        Packages: ${JSON.stringify(packages)}
        
        Task: Pick the best packageId. Suggest a discountPercent (0-15) if they seem highly price-sensitive.
        Respond ONLY with raw JSON: {"packageId": number, "discountPercent": number}`;

        const matchRes = await model.generateContent(matchPrompt);
        const matchText = matchRes.response
          .text()
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
        const matchParsed = JSON.parse(matchText);

        if (matchParsed.packageId) recommendedPackageId = matchParsed.packageId;
        if (matchParsed.discountPercent) discountPercent = matchParsed.discountPercent;

        // Step 2: Fetch Itinerary & Rewrite
        const [itinRows] = await pool.query(
          'SELECT day_number, title, description FROM package_itinerary WHERE package_id = ? ORDER BY day_number',
          [recommendedPackageId],
        );
        const itinerary = itinRows as any[];

        if (itinerary.length > 0) {
          const rewritePrompt = `You are a luxury travel copywriter.
          The lead wants a trip with Theme: "${lead.theme}" and notes: "${lead.notes}".
          Rewrite the following itinerary to beautifully emphasize aspects that appeal to this specific lead. Do not change the core locations or activities, just tweak the descriptions to highlight what they care about (e.g. mention romance for honeymoon, or kids club for family).
          
          Original Itinerary:
          ${JSON.stringify(itinerary)}
          
          Respond ONLY with raw JSON array in this exact format:
          [{"day_number": number, "title": "string", "description": "string"}]`;

          const rewriteRes = await model.generateContent(rewritePrompt);
          const rewriteText = rewriteRes.response
            .text()
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
          customItinerary = JSON.parse(rewriteText);
        }
      } catch (e) {
        console.error('AI Auto-Quote failed:', e);
      }
    }

    // Fallback if AI fails or itinerary rewriting failed
    if (!customItinerary.length) {
      const [itinRows] = await pool.query(
        'SELECT day_number, title, description FROM package_itinerary WHERE package_id = ? ORDER BY day_number',
        [recommendedPackageId],
      );
      customItinerary = itinRows as any[];
    }

    return {
      packageId: recommendedPackageId,
      discountPercent,
      customItinerary,
    };
  });

export const adminAiAnalyticsChat = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, query: z.string() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);

    let answer = 'I am unable to process data at this time.';

    if (process.env.GEMINI_API_KEY) {
      try {
        const pool = await legacy.getDbPool();
        // Fetch massive context for the AI
        const [leadsRows] = await pool.query(
          'SELECT COUNT(*) as count, status FROM lead_submissions GROUP BY status',
        );
        const [bookingsRows] = await pool.query(
          "SELECT SUM(amount) as rev, SUM(amount * 0.2) as margin, COUNT(*) as count FROM bookings WHERE status = 'confirmed'",
        );

        const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
        const genAI = await legacy.getGenAI();
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `You are a Chief Financial & Data Officer for MooNs Travel Agency.
        The executive asked: "${data.query}"
        
        Here is the raw database summary right now:
        Leads by Status: ${JSON.stringify(leadsRows)}
        Confirmed Bookings Data: ${JSON.stringify(bookingsRows)}
        
        Give a concise, highly analytical, and insightful answer. No fluff. Use Markdown.
        If the question is about specific historical days (like "last Tuesday"), just make a highly plausible analytical assumption since you only have current aggregates. Keep it extremely professional.`;

        const res = await model.generateContent(prompt);
        answer = res.response.text();
      } catch (e) {
        console.error('Analytics Chat failed:', e);
        answer = 'Error analyzing data: ' + (e as Error).message;
      }
    }

    return { answer };
  });

export const adminAiOcrParsePdf = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: legacy.adminAuthSchema, base64Data: z.string(), mimeType: z.string() }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);

    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an AI data extractor for a travel agency.
    Extract the following from this vendor booking confirmation document:
    1. vendorName
    2. bookingReference (the PNR or confirmation number)
    3. status (either 'confirmed', 'cancelled', 'pending')
    4. totalAmount (numeric value)
    
    Respond ONLY with raw JSON: {"vendorName": "...", "bookingReference": "...", "status": "...", "totalAmount": 123}`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: data.base64Data, mimeType: data.mimeType } },
    ]);

    const text = result.response
      .text()
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiGenerateAudienceRule = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, prompt: z.string() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const systemPrompt = `You are a CRM Database Expert.
    Convert the marketer's natural language request into a simple pseudo-SQL WHERE clause rule string for our system.
    Available fields: destination, budget, theme, status, created_at, travel_date
    Example Request: "Find me honeymooners going to Bali"
    Example Output: theme = 'Honeymoon' AND destination = 'Bali'
    
    Request: "${data.prompt}"
    
    Respond ONLY with the rule string, nothing else. No quotes, no markdown.`;

    const res = await model.generateContent(systemPrompt);
    return res.response.text().trim();
  });

const visualImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
const visualImageMaxBytes = 10 * 1024 * 1024;
const visualImageMaxBase64Characters = Math.ceil(visualImageMaxBytes / 3) * 4;

function hasVisualImageSignature(bytes: Buffer, mimeType: (typeof visualImageMimeTypes)[number]) {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mimeType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['avif', 'avis'].includes(bytes.subarray(8, 12).toString('ascii'))
  );
}

export const adminAiVisualScrapbook = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      base64Data: z.string().min(1).max(visualImageMaxBase64Characters),
      mimeType: z.enum(visualImageMimeTypes),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64Data) || data.base64Data.length % 4 !== 0) {
      throw new Error('Invalid image encoding');
    }
    const imageBytes = Buffer.from(data.base64Data, 'base64');
    if (imageBytes.length < 1 || imageBytes.length > visualImageMaxBytes) {
      throw new Error('Image must be between 1 byte and 10 MiB');
    }
    if (!hasVisualImageSignature(imageBytes, data.mimeType)) {
      throw new Error('Image content does not match its declared type');
    }

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an expert travel designer.
    Analyze this reference image (e.g. from Instagram, Pinterest).
    1. Identify the likely destination, vibe, and key activities (e.g. "Cliffside Pool in Santorini", "Jungle Trekking in Bali").
    2. Write a highly engaging, luxurious 3-day sample itinerary that matches the exact vibe of this photo.
    
    Respond in JSON format ONLY:
    {
      "destination": "...",
      "vibe": "...",
      "itinerary": [
        { "day": 1, "title": "...", "description": "..." },
        { "day": 2, "title": "...", "description": "..." },
        { "day": 3, "title": "...", "description": "..." }
      ]
    }`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: data.base64Data, mimeType: data.mimeType } },
    ]);

    const text = result.response
      .text()
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiGenerateBanner = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, theme: z.string(), tone: z.string() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `You are an expert travel marketer.
    Generate creative copy for a WhatsApp promotional banner.
    Theme/Destination: ${data.theme}
    Tone: ${data.tone}
    
    Respond in JSON format ONLY:
    {
      "headline": "...",
      "subheadline": "...",
      "callToAction": "..."
    }`;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiReconcileEscrow = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, ledgerData: z.string() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are a financial controller AI.
    Analyze the following escrow ledger records.
    Find any anomalies (e.g. held amounts that have been sitting for too long, missing milestones).
    
    Ledger Data:
    ${data.ledgerData}
    
    Respond in JSON format ONLY:
    {
      "anomaliesFound": number,
      "summary": "...",
      "recommendations": ["..."]
    }`;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiGenerateItinerary = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      destination: z.string(),
      days: z.number(),
      category: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are a luxury travel planner creating an itinerary.
    Destination: ${data.destination}
    Duration: ${data.days} days
    Style: ${data.category}
    
    Output exactly ${data.days} lines in this exact raw format, pipe separated. Do not include markdown code blocks or any other text.
    Format:
    [Day Number] | [Creative Day Title] | [Short Activity Summary] | [City] | [Specific Route Location] | [Latitude,Longitude]
    
    Example:
    1 | Welcome to Paradise | Arrival and check-in to a luxury resort | Bali | Ubud Resort | -8.5069,115.2625
    2 | Temple Tour | Guided visit to the water temples | Bali | Tirta Empul | -8.4149,115.3161`;

    const res = await model.generateContent(prompt);
    let text = res.response.text().trim();
    text = text
      .replace(/```.*\n/gi, '')
      .replace(/```/g, '')
      .trim();
    return text;
  });

export const adminAiEstimatePrice = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      destination: z.string(),
      days: z.number(),
      category: z.string(),
      itineraryText: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `You are a travel pricing algorithm.
    Calculate a realistic B2C selling package price for:
    Destination: ${data.destination}
    Duration: ${data.days} days
    Category: ${data.category} (Economy = Budget/3-star, Premium = 4-star, Luxury = 5-star+)
    
    Itinerary:
    ${data.itineraryText || 'No itinerary provided'}
    
    Instructions:
    1. Estimate the base cost (accommodation for ${data.days} days at ${data.category} level + local transport).
    2. Carefully check all activities mentioned in the itinerary. Estimate the realistic entry/ticket price for each activity (if it is a free entry attraction, the price is 0).
    3. Total all the costs (base cost + all activity prices).
    4. Add a 25% markup to the total cost to get the final B2C selling price.
    
    Return the total B2C selling price in Indian Rupees (INR).
    Respond in JSON format ONLY:
    {
      "estimated_price_inr": number
    }`;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiGenerateSEO = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      destination: z.string(),
      name: z.string(),
      description: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `You are an SEO expert for a travel agency.
    Create high-converting SEO metadata for this tour package.
    Name: ${data.name}
    Destination: ${data.destination}
    Description: ${data.description}
    
    Respond in JSON format ONLY:
    {
      "meta_title": "Max 60 chars. Catchy.",
      "meta_description": "Max 160 chars. Action-oriented.",
      "meta_keywords": "comma, separated, list, of, keywords"
    }`;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiGenerateEmail = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: legacy.adminAuthSchema, hotelName: z.string(), destination: z.string() }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Write a highly professional B2B email to the reservations team at ${data.hotelName} in ${data.destination}.
    The email is from MooNs Travel Agency requesting their best FIT (Free Independent Traveler) and Group net rates for the upcoming season, as well as an updated fact sheet and images.
    Keep it concise, polite, and action-oriented. Do not include placeholders for my name, just sign off as "Contracting Team, MooNs Travel".
    No markdown formatting, just plain text.`;

    const res = await model.generateContent(prompt);
    return res.response.text().trim();
  });

export const adminAiAnalyzeTrends = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    // 1. Fetch active packages
    const pool = await legacy.getDbPool();
    const [pkgRows] = await pool.query(
      'SELECT id, name, destination, country, price, category FROM packages WHERE is_active = 1',
    );
    const packages = pkgRows as any[];

    // 2. Call Gemini with retry logic for rate limits
    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');

    const prompt = `You are an expert travel market researcher and marketer for MooNs Travel Agency.
    Analyze the current (and upcoming) search trends for Indian travelers looking for outbound/international and domestic holidays.
    Based on those trends, select the top 3-4 trending destinations that match our CURRENT ACTIVE PACKAGE INVENTORY.
    
    Our Current Active Packages:
    ${JSON.stringify(packages)}
    
    Respond ONLY in raw JSON matching this schema:
    {
      "trends": [
        {
          "destination": "string (e.g. Bali)",
          "search_trend_keyword": "string (e.g. Bali private pool villas for couples)",
          "why_its_trending": "string (short description of why Indians want to travel here now)",
          "recommended_package_id": number (must be an ID from our inventory that matches this destination),
          "recommended_package_name": "string",
          "marketing_angle": "string (how to sell this package based on the trend)"
        }
      ]
    }
    `;

    let text = '';
    let attempt = 0;
    while (attempt < 5) {
      try {
        const genAI = await legacy.getGenAI();
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: 'application/json' },
        });
        const res = await model.generateContent(prompt);
        text = res.response
          .text()
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        break;
      } catch (e: any) {
        if (e.status === 429) {
          console.warn('[adminAiAnalyzeTrends] 429 Rate limited. Rotating key and retrying...');
          legacy.rotateGenAIKey();
          attempt++;
          if (attempt >= 5) throw new Error('All API keys are currently rate limited.');
        } else {
          throw e;
        }
      }
    }

    return JSON.parse(text);
  });

export const adminAiSearchFlights = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      origin: z.string(),
      destination: z.string(),
      date: z.string(),
      pax: z.number(),
      cabinClass: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `You are a global flight GDS simulator.
    The user is searching for flights:
    Origin: ${data.origin}
    Destination: ${data.destination}
    Date: ${data.date}
    Passengers: ${data.pax}
    Class: ${data.cabinClass}
    
    Generate 6 realistic flight options (some direct if possible, some with 1 halt). Include low cost and premium carriers.
    Prices should be realistic market averages in INR for the TOTAL passengers.
    
    Respond ONLY in raw JSON matching this schema:
    {
      "flights": [
        {
          "airline": "string",
          "flightNo": "string",
          "departureTime": "HH:MM",
          "arrivalTime": "HH:MM",
          "duration": "string (e.g. 2h 30m)",
          "stops": number (0 for direct, 1 for 1 halt),
          "layoverCity": "string or null",
          "totalPriceINR": number
        }
      ]
    }
    `;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiAnalyzeLeadPriority = defineOperation({ method: 'POST' })
  .validator(
    z.object({ auth: legacy.adminAuthSchema, leadName: z.string(), inquiryMessage: z.string() }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `You are an expert travel sales manager. Analyze this incoming lead inquiry.
    Lead Name: ${data.leadName}
    Message: ${data.inquiryMessage}
    
    Respond ONLY in raw JSON matching this schema:
    {
      "urgency_score": "string (ðŸ”¥ Hot, ðŸŒ¤ Warm, â„ï¸ Cold)",
      "missing_info": "string (what should the agent ask next?)",
      "draft_reply": "string (a highly converting, professional but friendly 3-sentence draft reply addressing their request)"
    }
    `;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiCoachDeal = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      dealTitle: z.string(),
      customerName: z.string(),
      dealValue: z.number(),
      pipelineStage: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `You are an elite B2B and B2C travel sales coach.
    Deal Title: ${data.dealTitle}
    Customer: ${data.customerName}
    Value: â‚¹${data.dealValue}
    Current Stage: ${data.pipelineStage}
    
    Provide coaching for this specific deal.
    Respond ONLY in raw JSON matching this schema:
    {
      "win_probability": "string (e.g. 75%)",
      "next_best_action": "string (a highly specific psychological sales tactic to move it forward)",
      "upsell_opportunity": "string (what add-on should we pitch to increase the deal value?)"
    }
    `;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiGenerateFollowupScript = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      customerName: z.string(),
      followupType: z.string(),
      notes: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const prompt = `You are an elite travel sales agent writing a follow-up script.
    Customer: ${data.customerName}
    Follow-up Type (channel): ${data.followupType}
    Context/Notes for this follow-up: ${data.notes}
    
    Write the exact script/message the agent should use. If the type is 'call', write a literal 3-line phone script. If it's 'whatsapp' or 'email', write a punchy, converting message.
    DO NOT include markdown, just plain text ready to copy-paste. Keep it short and highly actionable.`;

    const res = await model.generateContent(prompt);
    return res.response.text().trim();
  });

export const adminAiGenerateAutomation = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, prompt: z.string() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const aiPrompt = `You are an expert Marketing Automation Architect. 
    A user wants to create a CRM automation workflow. Here is their plain english request:
    "${data.prompt}"
    
    Parse this request and generate the automation payload. 
    Respond ONLY in raw JSON matching this schema:
    {
      "name": "string (A catchy name for this workflow, e.g., 'Lead Welcome Sequence')",
      "triggerEvent": "string (Guess the trigger, e.g., 'lead.created', 'booking.confirmed', 'quote.sent')",
      "steps": "number (How many total steps are in this workflow, including delays?)",
      "workflowJson": "string (A JSON stringified array representing the steps, e.g. '[{\"order\":1,\"type\":\"delay\",\"value\":\"1 day\"},{\"order\":2,\"type\":\"email\",\"template\":\"welcome\"},{\"order\":3,\"type\":\"task\",\"assignee\":\"sales\"}]')"
    }
    `;

    const res = await model.generateContent(aiPrompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiSearchCars = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      pickup: z.string(),
      dropoff: z.string(),
      date: z.string(),
      vehicleClass: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Simulate a Global Distribution System (GDS) for car rentals.
    Find 3 car rental options from ${data.pickup} to ${data.dropoff} for date: ${data.date}. Preferred class: ${data.vehicleClass}.
    Provide realistic estimated total prices in INR.
    Respond ONLY in raw JSON matching this schema:
    [{
      "supplier": "string (e.g. Avis, Hertz, Europcar)",
      "vehicle": "string (e.g. Toyota Camry, Ford Mustang)",
      "seats": "number",
      "transmission": "string",
      "price_inr": "number"
    }]`;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiSearchCruises = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      port: z.string(),
      region: z.string(),
      month: z.string(),
      line: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Simulate a Global Distribution System (GDS) for cruises.
    Find 3 cruise sailings from port ${data.port} to region ${data.region} in month ${data.month}. Preferred line: ${data.line}.
    Provide realistic estimated prices in INR for 3 cabin tiers.
    Respond ONLY in raw JSON matching this schema:
    [{
      "line": "string",
      "ship": "string",
      "itinerary": "string (e.g. 7-Night Caribbean)",
      "date": "string (e.g. Oct 15, 2026)",
      "inside_price": "number",
      "balcony_price": "number",
      "suite_price": "number"
    }]`;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiDraftRfq = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      companyName: z.string(),
      services: z.array(z.string()),
      coverage: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const prompt = `You are Maya, the Procurement Manager at MooNs, a leading B2B travel agency in India. 
You are a REAL HUMAN professional. NEVER identify yourself as an AI, bot, or assistant. Do not use phrases like "As an AI" or "I am a virtual assistant."

Draft a professional B2B Request For Quotation (RFQ) email to a vendor.
Vendor Name: ${data.companyName}
Services they offer: ${data.services.join(', ')}
Regions they cover: ${data.coverage}

If they offer Transport/Cars: Ask for details on vehicle types, capacity, English-speaking drivers, toll/parking inclusions, and transfer rates.
If they offer Stays/Accommodation: Ask for room categories, meal plan options (CP, MAP, AP), blackout dates, and group policies.
If they offer Packages/Experience: Ask for detailed itineraries, inclusions/exclusions, minimum pax requirements, and B2B commission structures.
If unknown: Ask for their general B2B net rates and availability for Indian travelers.

Format the output as a clean HTML email body (no \`\`\`html tags, no subject line, no placeholders). Sign off as:
Maya
Procurement Manager
MooNs
+91 98765 43210`;

    let res;
    for (let i = 0; i < 2; i++) {
      try {
        const genAI = await legacy.getGenAI();
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        res = await model.generateContent(prompt);
        break; // Success
      } catch (err: any) {
        if (err.status === 429 && i < 1) {
          console.warn('[Admin AI Draft RFQ] Rate limited (429). Rotating key...');
          legacy.rotateGenAIKey();
          continue;
        }
        throw err;
      }
    }

    if (!res) throw new Error('Failed to draft RFQ');

    return res.response.text().trim();
  });

export const adminAiBuildPackage = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema, destination: z.string(), days: z.number() }))
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    if (!process.env.GEMINI_API_KEY) throw new Error('Gemini API Key missing');

    const { GoogleGenerativeAI } = await import(/* @vite-ignore */ '@google/generative-ai');
    const genAI = await legacy.getGenAI();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const prompt = `Act as a master travel agent. Build a ${data.days}-day, high-converting tour package for ${data.destination}.
    Provide a realistic base cost in INR covering hotels, transfers, and activities.
    Respond ONLY in raw JSON matching this schema:
    {
      "title": "string (Catchy name for the package)",
      "overview": "string (Short description)",
      "estimated_base_cost_inr": "number",
      "itinerary": [
        { "day": "number", "title": "string", "description": "string" }
      ]
    }`;

    const res = await model.generateContent(prompt);
    const text = res.response
      .text()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(text);
  });

export const adminAiComposeRfq = defineOperation({ method: 'POST' })
  .validator(
    (data: unknown) =>
      data as {
        auth: legacy.AdminAuthPayload;
        packageId: number;
        scope: string[];
        travelDates?: string;
        customHotels?: string[];
      },
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    const pool = await legacy.getDbPool();

    // 1. Fetch package basics
    const [pkgRows] = await pool.query('SELECT * FROM packages WHERE id = ?', [data.packageId]);
    if (!pkgRows || (pkgRows as any[]).length === 0) throw new Error('Package not found');
    const pkg = (pkgRows as any[])[0];

    // 2. Fetch line items (stays, transport, activities)
    const [linesRows] = await pool.query(
      'SELECT * FROM package_line_items WHERE package_id = ? ORDER BY day_number ASC',
      [data.packageId],
    );
    const lines = linesRows as any[];

    // 3. Fetch full itinerary
    const [itinRows] = await pool.query(
      'SELECT day_number, title, description, city FROM package_itinerary WHERE package_id = ? ORDER BY day_number ASC',
      [data.packageId],
    );
    const itinerary = itinRows as any[];

    // 4. Fetch inclusions & exclusions
    const [inclRows] = await pool.query(
      'SELECT category, item FROM package_inclusions WHERE package_id = ? ORDER BY category, id',
      [data.packageId],
    );
    const inclusions = inclRows as any[];

    const [exclRows] = await pool.query(
      'SELECT item FROM package_exclusions WHERE package_id = ? ORDER BY id',
      [data.packageId],
    );
    const exclusions = exclRows as any[];

    // 5. Build comprehensive context
    let contextStr = `ðŸ“‹ PACKAGE OVERVIEW\n`;
    contextStr += `â€¢ Package Name: ${pkg.name}\n`;
    contextStr += `â€¢ Destination: ${pkg.destination}, ${pkg.country}\n`;
    contextStr += `â€¢ Duration: ${pkg.days} Days / ${pkg.nights} Nights\n`;
    if (data.travelDates) contextStr += `â€¢ Travel Dates: ${data.travelDates}\n`;
    contextStr += `â€¢ Category: ${pkg.category || 'General'}\n`;
    if (pkg.description) contextStr += `â€¢ Description: ${pkg.description}\n`;
    contextStr += `\n`;

    // Day-by-day itinerary (always include for full context)
    if (itinerary.length > 0) {
      contextStr += `ðŸ“… DAY-BY-DAY ITINERARY\n`;
      itinerary.forEach((day) => {
        contextStr += `Day ${day.day_number}${day.city ? ` â€” ${day.city}` : ''}: ${day.title}\n`;
        if (day.description) contextStr += `  ${day.description}\n`;
      });
      contextStr += `\n`;
    }

    // Accommodation (scope: full or hotels)
    if (data.scope.includes('full') || data.scope.includes('hotels')) {
      if (data.customHotels && data.customHotels.length > 0) {
        contextStr += 'ðŸ¨ ACCOMMODATION REQUIRED\n';
        data.customHotels.forEach((h: any) => {
          contextStr += `â€¢ ${h}\n`;
        });
        contextStr += '\n';
      } else {
        const hotels = lines.filter((l) => l.catalog_type === 'stay' || l.catalog_type === 'room');
        if (hotels.length > 0) {
          contextStr += 'ðŸ¨ ACCOMMODATION REQUIRED\n';
          hotels.forEach((h: any) => {
            contextStr += `â€¢ ${h.item_name} (Night ${h.day_number})`;
            if (h.quantity && h.quantity > 1) contextStr += ` Ã— ${h.quantity}`;
            if (h.unit_type) contextStr += ` [${h.unit_type.replace(/_/g, ' ')}]`;
            if (h.notes) contextStr += ` â€” ${h.notes}`;
            contextStr += `\n`;
          });
          contextStr += '\n';
        } else if (itinerary.length > 0) {
          // Infer accommodation needs from itinerary cities
          contextStr += 'ðŸ¨ ACCOMMODATION REQUIRED\n';
          const cities = [...new Set(itinerary.filter((d) => d.city).map((d) => d.city))];
          contextStr += `â€¢ Hotels needed in: ${cities.join(', ')} (${pkg.nights} nights total)\n`;
          contextStr += `â€¢ Please provide room categories, meal plan options (CP/MAP/AP), and net rates\n\n`;
        }
      }
    }

    // Transport (scope: full or transport)
    if (data.scope.includes('full') || data.scope.includes('transport')) {
      const transport = lines.filter((l) => l.catalog_type === 'car');
      if (transport.length > 0) {
        contextStr += 'ðŸš— TRANSPORT REQUIRED\n';
        transport.forEach((t) => {
          contextStr += `â€¢ Day ${t.day_number}: ${t.item_name}`;
          if (t.quantity && t.quantity > 1) contextStr += ` Ã— ${t.quantity}`;
          if (t.unit_type) contextStr += ` [${t.unit_type.replace(/_/g, ' ')}]`;
          if (t.notes) contextStr += ` â€” ${t.notes}`;
          contextStr += `\n`;
        });
        contextStr += '\n';
      } else if (itinerary.length > 0) {
        // Infer transport needs from itinerary city changes
        contextStr += 'ðŸš— TRANSPORT REQUIRED\n';
        contextStr += `â€¢ Airport pickup/drop-off transfers\n`;
        const cityChanges: string[] = [];
        for (let i = 1; i < itinerary.length; i++) {
          if (
            itinerary[i].city &&
            itinerary[i - 1].city &&
            itinerary[i].city !== itinerary[i - 1].city
          ) {
            cityChanges.push(
              `Day ${itinerary[i].day_number}: ${itinerary[i - 1].city} â†’ ${itinerary[i].city}`,
            );
          }
        }
        cityChanges.forEach((c) => {
          contextStr += `â€¢ ${c}\n`;
        });
        if (cityChanges.length === 0)
          contextStr += `â€¢ Local sightseeing transport for ${pkg.days} days\n`;
        contextStr += `â€¢ Please provide vehicle types, capacity, and per-day/transfer rates\n\n`;
      }
    }

    // Activities (scope: full only)
    if (data.scope.includes('full')) {
      const activities = lines.filter((l) => l.catalog_type === 'activity');
      if (activities.length > 0) {
        contextStr += 'ðŸŽ¯ ACTIVITIES & EXPERIENCES\n';
        activities.forEach((a) => {
          contextStr += `â€¢ Day ${a.day_number}: ${a.item_name}`;
          if (a.quantity && a.quantity > 1) contextStr += ` Ã— ${a.quantity}`;
          if (a.notes) contextStr += ` â€” ${a.notes}`;
          contextStr += `\n`;
        });
        contextStr += '\n';
      }
    }

    // Inclusions
    if (inclusions.length > 0) {
      contextStr += 'âœ… CURRENTLY INCLUDED IN PACKAGE\n';
      const byCategory: Record<string, string[]> = {};
      inclusions.forEach((inc) => {
        const cat = inc.category || 'General';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(inc.item);
      });
      Object.entries(byCategory).forEach(([cat, items]) => {
        contextStr += `â€¢ ${cat}: ${items.join(', ')}\n`;
      });
      contextStr += '\n';
    }

    // Exclusions
    if (exclusions.length > 0) {
      contextStr += 'âŒ NOT INCLUDED IN PACKAGE\n';
      exclusions.forEach((exc) => {
        contextStr += `â€¢ ${exc.item}\n`;
      });
      contextStr += '\n';
    }

    const scopeParts: string[] = [];
    if (data.scope.includes('full'))
      scopeParts.push(
        'Cover the full package including itinerary, activities, and any other services. Ask for net B2B rates for each component.',
      );
    if (data.scope.includes('hotels'))
      scopeParts.push(
        'Include detailed accommodation/hotel requirements. Ask for room categories, meal plans (CP/MAP/AP), room amenities (WiFi, AC, minibar), check-in/check-out policies, group rates, child/extra bed charges, and blackout dates.',
      );
    if (data.scope.includes('transport'))
      scopeParts.push(
        'Include detailed transport/transfer requirements. Ask for vehicle types, seating capacity, English-speaking driver availability, toll/parking inclusions, and per-transfer or per-day rates.',
      );
    if (data.scope.includes('cruise'))
      scopeParts.push(
        'Include detailed cruise requirements. Ask for ship name and sailing dates, port-by-port itinerary, net per-person twin-sharing fares by cabin category (Interior/Oceanview/Balcony/Suite), 3rd/4th berth and child rates, port charges/taxes/gratuities (included or extra), meal plans and beverage packages, shore excursion rates, deposit and final payment deadlines, cancellation slabs, passport/visa requirements for Indian passport holders, and group/FOC berth policy.',
      );
    const scopeInstruction =
      scopeParts.length > 0
        ? scopeParts.join(' Also, ')
        : 'Cover ALL components relevant to the vendor: accommodation, transport, activities, and any other services. Ask for net B2B rates for each component.';

    const prompt = `You are Maya, Procurement Manager at MooNs, a leading B2B travel company in India. You are a REAL HUMAN professional. NEVER identify yourself as an AI.

Write a professional B2B Request for Quote (RFQ) email to a local vendor/DMC. The email must be detailed enough that the vendor can clearly understand what we need and provide accurate pricing.

RULES:
- Do NOT include placeholders like [Vendor Name] or [Your Name]. Address generically as "Dear Partner" or "Dear Team".
- Include the full package details from the context below so the vendor knows exactly what to quote.
- Present the itinerary and requirements in a clean, structured format.
- ${scopeInstruction}
- Keep the tone professional, warm, and partnership-oriented.
- Format as plain text with natural line breaks and emoji section headers. Do NOT use HTML tags.
- Sign off as: Maya, Procurement Manager, MooNs

PACKAGE CONTEXT:
${contextStr}`;

    let result;
    for (let i = 0; i < 2; i++) {
      try {
        const genAI = await legacy.getGenAI();
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        result = await model.generateContent(prompt);
        break; // Success
      } catch (err: any) {
        if (err.status === 429 && i < 1) {
          console.warn('[Admin RFQ] Rate limited (429). Rotating key...');
          legacy.rotateGenAIKey();
          continue;
        }
        throw err;
      }
    }

    if (!result) throw new Error('Failed to generate quote email. Please try again later.');
    let htmlBody = result.response.text().trim();
    if (htmlBody.startsWith('```html'))
      htmlBody = htmlBody.replace(/^```html\n/, '').replace(/\n```$/, '');
    if (htmlBody.startsWith('```')) htmlBody = htmlBody.replace(/^```\n/, '').replace(/\n```$/, '');

    const subject = `Request for Quote: ${pkg.name}`;

    return { subject, htmlBody };
  });

export const triggerAILeadWorkerManually = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireLeadStaff(data.auth);
    // Trigger asynchronously immediately
    legacy.processAutonomousAILeads().catch(console.error);
    return { success: true };
  });

export const adminUploadLeadAudio = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      leadId: z.number(),
      mimeType: z.enum([
        'audio/mpeg',
        'audio/wav',
        'audio/ogg',
        'audio/webm',
        'audio/mp3',
        'video/webm',
      ]),
      base64: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireLeadStaff(data.auth);
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const crypto = await import('node:crypto');
    const bytes = legacy.decodeBase64Strict(data.base64);
    const maxBytes = 25 * 1024 * 1024; // 25MB max for audio
    if (bytes.byteLength > maxBytes) throw new Error('Audio must be 25 MB or smaller.');

    const ext = data.mimeType.split('/')[1].replace('mpeg', 'mp3');
    const storedFilename = `call_${data.leadId}_${crypto.randomUUID()}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'uploads', 'calls');
    await fs.mkdir(uploadDir, { recursive: true });

    const absolutePath = path.join(uploadDir, storedFilename);
    await fs.writeFile(absolutePath, bytes, { flag: 'wx' });
    const publicUrl = `/uploads/calls/${storedFilename}`;

    const pool = await legacy.getDbPool();
    await pool.query('UPDATE lead_submissions SET call_recording_url = ? WHERE id = ?', [
      publicUrl,
      data.leadId,
    ]);

    return { success: true, publicUrl, absolutePath };
  });

export const triggerMayaAudioProcessing = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      leadId: z.number(),
      absolutePath: z.string(),
      mimeType: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireLeadStaff(data.auth);
    legacy.processMayaAudioLead(data.leadId, data.absolutePath, data.mimeType).catch(console.error);
    return { success: true };
  });

export const adminGetMayaStatus = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireLeadStaff(data.auth);
    await legacy.ensureMayaTables();
    const pool = await legacy.getDbPool();
    const settings = await legacy.getMayaSettings();
    const [activityRows] = await pool.query(
      'SELECT * FROM maya_activity_log ORDER BY id DESC LIMIT 50',
    );
    const [todayRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM maya_activity_log WHERE created_at >= CURDATE() AND status = 'done'",
    );
    const areas: Record<string, boolean> = {};
    for (const area of legacy.MAYA_AREAS) areas[area] = legacy.mayaAreaEnabled(settings, area);
    return {
      masterEnabled: settings['autopilot_master'] !== 'off',
      areas,
      lastRun: settings['maya_last_run'] || null,
      actionsToday: Number((todayRows as any[])[0]?.total || 0),
      activity: activityRows as legacy.MayaActivityRow[],
    };
  });

export const adminSetMayaAutopilot = defineOperation({ method: 'POST' })
  .validator(
    z.object({
      auth: legacy.adminAuthSchema,
      area: z.enum([
        'master',
        'leads',
        'followups',
        'clients',
        'escrow',
        'refunds',
        'careers',
        'payments',
      ]),
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await legacy.requireAdmin(data.auth);
    await legacy.ensureMayaTables();
    await legacy.setMayaSetting(`autopilot_${data.area}`, data.enabled ? 'on' : 'off');
    await legacy.logMayaActivity(
      'system',
      data.enabled ? 'area_enabled' : 'area_disabled',
      null,
      `Autopilot "${data.area}" switched ${data.enabled ? 'on' : 'off'} by ${data.auth.email}.`,
    );
    return { success: true };
  });

export const adminRunMayaAutopilotNow = defineOperation({ method: 'POST' })
  .validator(z.object({ auth: legacy.adminAuthSchema }))
  .handler(async ({ data }) => {
    await legacy.requireLeadStaff(data.auth);
    await legacy.runMayaAutopilotCycle();
    return { success: true };
  });
