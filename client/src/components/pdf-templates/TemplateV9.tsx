import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { QuotePDFProps, money } from '../QuotePDFTemplate';

// Honeymoon Edition — Refined Blush & Champagne
const C = {
  bg: '#FFF8F9',
  blush: '#FCEEF0',
  rose: '#BE123C',
  roseLight: '#FDA4AF',
  roseMuted: '#F9D2D8',
  roseDark: '#881337',
  champagne: '#F5E6D3',
  gold: '#C9952A',
  white: '#FFFFFF',
  textDark: '#3B0A1E',
  textMid: '#6B2140',
  textMuted: '#9F5474',
  textLight: '#C08A9E',
  cardBorder: '#F9D2D8',
};

const s = StyleSheet.create({
  pageBlush: { padding: 0, fontFamily: 'Inter', backgroundColor: C.bg },
  pageRose: { padding: 0, fontFamily: 'Inter', backgroundColor: C.roseDark },
  pad: { paddingHorizontal: 40, paddingVertical: 30 },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.roseMuted,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerDark: { borderTopColor: '#5C1033' },
  footerText: { fontSize: 7, color: C.textMuted, letterSpacing: 0.5 },
  footerTextDark: { color: '#B05670' },
  footerPage: { fontSize: 7, color: C.rose, fontWeight: 600, letterSpacing: 1 },

  // COVER
  coverTop: {
    backgroundColor: C.roseDark,
    padding: 40,
    paddingBottom: 30,
    minHeight: '55%',
    position: 'relative',
  },
  coverBottom: { backgroundColor: C.bg, padding: 40, paddingTop: 24, minHeight: '45%' },

  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
  logoMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.roseLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  logoLetter: { color: C.roseDark, fontSize: 12, fontWeight: 600 },
  logoText: { color: C.white, fontSize: 16, fontWeight: 600 },

  editionBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.roseLight,
    borderStyle: 'solid',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 16,
  },
  editionBadgeText: { color: C.roseLight, fontSize: 7, letterSpacing: 3, fontWeight: 600 },

  coverTitle: {
    color: C.white,
    fontSize: 32,
    fontWeight: 600,
    letterSpacing: -1,
    lineHeight: 1.15,
    marginBottom: 12,
  },
  coverDesc: { color: '#E8A0B8', fontSize: 11, lineHeight: 1.6, marginBottom: 28, maxWidth: '85%' },

  accentLine: { height: 2, backgroundColor: C.roseLight },

  metaRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  metaBox: { flex: 1, borderWidth: 1, borderColor: '#5C1033', borderStyle: 'solid', padding: 12 },
  metaLabel: { color: C.roseLight, fontSize: 7, letterSpacing: 2, marginBottom: 4 },
  metaValue: { color: C.white, fontSize: 12, fontWeight: 600 },

  priceCard: { borderWidth: 1, borderColor: C.cardBorder, borderStyle: 'solid', padding: 20 },
  priceLabel: { color: C.textMuted, fontSize: 8, letterSpacing: 2, marginBottom: 6 },
  priceValue: { color: C.roseDark, fontSize: 28, fontWeight: 600 },
  priceValueSm: { color: C.textDark, fontSize: 18, fontWeight: 600 },

  // ITINERARY
  sectionSub: { color: C.textMuted, fontSize: 8, letterSpacing: 3, marginBottom: 6 },
  sectionTitle: { color: C.textDark, fontSize: 20, fontWeight: 600, marginBottom: 20 },

  itinCard: {
    backgroundColor: C.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    padding: 16,
    marginBottom: 14,
  },
  itinBadge: {
    backgroundColor: C.rose,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  itinBadgeText: { color: C.white, fontSize: 8, fontWeight: 600, letterSpacing: 0.5 },
  itinTitle: { color: C.textDark, fontSize: 14, fontWeight: 600, marginBottom: 6 },
  itinDesc: { color: C.textMid, fontSize: 10, lineHeight: 1.6 },

  // INCLUSIONS
  incCard: {
    backgroundColor: C.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    marginBottom: 14,
    overflow: 'hidden',
  },
  incHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incTitle: { fontSize: 12, fontWeight: 600, color: C.textDark },
  incBadge: {
    borderWidth: 1,
    borderColor: C.rose,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  incBadgeText: { color: C.rose, fontSize: 7, fontWeight: 600, letterSpacing: 1 },
  incItemBlock: { paddingHorizontal: 14, paddingVertical: 8 },
  incRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  incNum: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.blush,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  incNumText: { color: C.rose, fontSize: 7, fontWeight: 600 },
  incItemText: { flex: 1, color: C.textMid, fontSize: 9, lineHeight: 1.5 },

  // INVESTMENT
  investCard: { backgroundColor: '#5C1033', borderRadius: 6, padding: 14, marginBottom: 10 },
  investLabel: {
    color: C.roseLight,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 8,
  },
  investRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  investRowTitle: { color: C.white, fontSize: 10, fontWeight: 600 },
  investRowDesc: { color: '#B05670', fontSize: 8 },
  investRowPrice: { color: '#FDA4AF', fontSize: 10, fontWeight: 600 },

  investGrand: { backgroundColor: C.roseLight, borderRadius: 6, padding: 16, marginTop: 6 },
  investGrandLabel: {
    color: C.roseDark,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 4,
  },
  investGrandValue: { color: C.roseDark, fontSize: 24, fontWeight: 600 },

  // TERMS
  termsSection: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  termsSectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: C.blush,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    borderBottomStyle: 'solid',
  },
  termsSectionTitle: { color: C.textDark, fontSize: 11, fontWeight: 600 },
  termsItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FDF0F2',
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termsItemNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.blush,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  termsItemNumText: { color: C.textMid, fontSize: 7, fontWeight: 600 },
  termsItemText: { flex: 1, color: C.textMid, fontSize: 8, lineHeight: 1.6 },
});

const Footer = ({
  pageNum,
  total,
  dark = false,
}: {
  pageNum: number;
  total: number;
  dark?: boolean;
}) => (
  <View style={[s.footer, dark ? s.footerDark : {}]} fixed>
    <Text style={[s.footerText, dark ? s.footerTextDark : {}]}>MooNs · Honeymoon Collection</Text>
    <Text
      style={s.footerPage}
    >{`${String(pageNum).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}</Text>
  </View>
);

export const TemplateV9 = ({
  leadName,
  leadDestination,
  leadNotes,
  packageName,
  packageDuration,
  itinerary = [],
  inclusions = [],
  exclusions = [],
  activities = [],
  stays = [],
  transfers = [],
  basePrice = 0,
  activitiesCost = 0,
  discountAmount = 0,
  taxAmount = 0,
  finalPrice = 0,
}: QuotePDFProps) => {
  const hasStaysOrCars = (stays && stays.length > 0) || (transfers && transfers.length > 0);
  const totalPages = hasStaysOrCars ? 6 : 5;

  return (
    <Document>
      {/* PAGE 1: COVER */}
      <Page size="A4" style={s.pageBlush}>
        <View style={s.coverTop}>
          <View style={s.logoRow}>
            <View style={s.logoMark}>
              <Text style={s.logoLetter}>M</Text>
            </View>
            <Text style={s.logoText}>MooNs</Text>
          </View>

          <View style={s.editionBadge}>
            <Text style={s.editionBadgeText}>HONEYMOON EDITION</Text>
          </View>

          <Text style={s.coverTitle}>{packageName || 'Your Romantic Escape'}</Text>
          <Text style={s.coverDesc}>
            {leadNotes ||
              `A private romantic retreat designed exclusively for two — curated with intimate dinners, sunset experiences, and luxury accommodations in ${leadDestination || 'paradise'}.`}
          </Text>

          <View style={[s.accentLine, { width: 40, marginBottom: 16 }]} />

          <View style={s.metaRow}>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>ESCAPE TO</Text>
              <Text style={s.metaValue}>{leadDestination || 'Paradise'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>DURATION</Text>
              <Text style={s.metaValue}>{packageDuration || 'TBD'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>GUESTS</Text>
              <Text style={s.metaValue}>2</Text>
            </View>
          </View>
        </View>

        <View style={s.coverBottom}>
          <View style={s.priceCard}>
            <Text style={s.priceLabel}>YOUR PRIVATE RETREAT</Text>
            <Text style={s.priceLabel}>PER COUPLE</Text>
            <Text style={s.priceValue}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={1} total={totalPages} />
      </Page>

      {/* PAGE 2: ITINERARY */}
      {itinerary.length > 0 ? (
        <Page size="A4" style={s.pageBlush}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>ROMANTIC JOURNEY</Text>
            <Text style={s.sectionTitle}>Day by Day Moments</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

            {itinerary.map((day) => (
              <View key={day.day_number} style={s.itinCard} wrap={false}>
                <View style={s.itinBadge}>
                  <Text
                    style={s.itinBadgeText}
                  >{`DAY ${String(day.day_number).padStart(2, '0')}`}</Text>
                </View>
                <Text style={s.itinTitle}>{day.title}</Text>
                <Text style={s.itinDesc}>{day.description}</Text>
              </View>
            ))}
          </View>
          <Footer pageNum={2} total={totalPages} />
        </Page>
      ) : null}

      {/* PAGE 2.5: ACCOMMODATIONS & TRANSFERS */}
      {hasStaysOrCars ? (
        <Page size="A4" style={s.pageBlush}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>STAYS & LOGISTICS</Text>
            <Text style={s.sectionTitle}>Accommodations & Transfers</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

            {stays && stays.length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.rose, marginBottom: 10 }}>
                  PREMIUM ACCOMMODATIONS
                </Text>
                {stays.map((stay) => (
                  <View key={stay.id} style={s.incCard}>
                    <View style={s.incHeader}>
                      <Text style={s.incTitle}>{stay.name}</Text>
                      <View style={s.incBadge}>
                        <Text style={s.incBadgeText}>
                          {stay.stars} STAR {stay.type.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={s.incItemBlock}>
                      <Text style={s.incItemText}>
                        {stay.rooms} Room(s) for {stay.nights} Night(s)
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {transfers && transfers.length > 0 ? (
              <View>
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.rose, marginBottom: 10 }}>
                  LOGISTICS & CARS
                </Text>
                {transfers.map((tf) => (
                  <View key={tf.id} style={s.incCard}>
                    <View style={s.incHeader}>
                      <Text style={s.incTitle}>{tf.serviceType}</Text>
                      <View style={s.incBadge}>
                        <Text style={s.incBadgeText}>{tf.pax} PAX</Text>
                      </View>
                    </View>
                    <View style={s.incItemBlock}>
                      <Text style={s.incItemText}>Vehicle: {tf.vehicleType}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
          <Footer pageNum={3} total={totalPages} />
        </Page>
      ) : null}

      {/* PAGE 3: INCLUSIONS & EXCLUSIONS */}
      <Page size="A4" style={s.pageBlush}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>YOUR EXPERIENCE</Text>
          <Text style={s.sectionTitle}>Inclusions & Exclusions</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          {inclusions.length > 0 ? (
            <View style={s.incCard}>
              <View style={s.incHeader}>
                <Text style={s.incTitle}>What's Included</Text>
                <View style={s.incBadge}>
                  <Text style={s.incBadgeText}>INCLUDED</Text>
                </View>
              </View>
              <View style={s.incItemBlock}>
                {inclusions.slice(0, 15).map((inc, i) => (
                  <View key={i} style={s.incRow}>
                    <View style={s.incNum}>
                      <Text style={s.incNumText}>{i + 1}</Text>
                    </View>
                    <Text style={s.incItemText}>{inc.item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {exclusions.length > 0 ? (
            <View style={s.incCard}>
              <View style={s.incHeader}>
                <Text style={s.incTitle}>Not Included</Text>
                <View style={[s.incBadge, { borderColor: '#9F5474' }]}>
                  <Text style={[s.incBadgeText, { color: '#9F5474' }]}>EXCLUDED</Text>
                </View>
              </View>
              <View style={s.incItemBlock}>
                {exclusions.slice(0, 15).map((exc, i) => (
                  <View key={i} style={s.incRow}>
                    <View style={[s.incNum, { backgroundColor: '#FCEEF0' }]}>
                      <Text style={[s.incNumText, { color: '#9F5474' }]}>{i + 1}</Text>
                    </View>
                    <Text style={s.incItemText}>{exc.item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
        <Footer pageNum={hasStaysOrCars ? 4 : 3} total={totalPages} />
      </Page>

      {/* PAGE 4: INVESTMENT */}
      <Page size="A4" style={s.pageRose}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={{ color: C.roseLight, fontSize: 8, letterSpacing: 3, marginBottom: 6 }}>
            INVESTMENT
          </Text>
          <Text style={{ color: C.white, fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            Your Romantic Escape — Pricing
          </Text>
          <View
            style={[s.accentLine, { width: 30, marginBottom: 16, backgroundColor: C.roseLight }]}
          />

          <View style={s.investCard}>
            <Text style={s.investLabel}>BASE PACKAGE</Text>
            <View style={s.investRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.investRowTitle}>{packageName || 'Honeymoon Package'}</Text>
                <Text style={s.investRowDesc}>All-inclusive romantic experience</Text>
              </View>
              <Text style={s.investRowPrice}>{money(basePrice)}</Text>
            </View>
          </View>

          {activitiesCost > 0 ? (
            <View style={s.investCard}>
              <Text style={s.investLabel}>ROMANTIC EXPERIENCES</Text>
              {activities.map((act) => (
                <View key={act.id} style={s.investRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.investRowTitle}>{act.name}</Text>
                    <Text style={s.investRowDesc}>Day {act.dayNumber}</Text>
                  </View>
                  <Text style={s.investRowPrice}>{money(act.price)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {discountAmount > 0 || taxAmount > 0 ? (
            <View style={s.investCard}>
              <Text style={s.investLabel}>ADJUSTMENTS</Text>
              {discountAmount > 0 ? (
                <View style={s.investRow}>
                  <Text style={s.investRowTitle}>Discount</Text>
                  <Text style={[s.investRowPrice, { color: '#FCA5A5' }]}>
                    - {money(discountAmount)}
                  </Text>
                </View>
              ) : null}
              {taxAmount > 0 ? (
                <View style={s.investRow}>
                  <Text style={s.investRowTitle}>Taxes</Text>
                  <Text style={[s.investRowPrice, { color: '#FDE68A' }]}>+ {money(taxAmount)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={s.investGrand}>
            <Text style={s.investGrandLabel}>TOTAL FOR YOUR RETREAT</Text>
            <Text style={s.investGrandValue}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={hasStaysOrCars ? 5 : 4} total={totalPages} dark />
      </Page>

      {/* PAGE 5: TERMS */}
      <Page size="A4" style={s.pageBlush}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>IMPORTANT</Text>
          <Text style={s.sectionTitle}>Booking Policies</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>Cancellation Policy</Text>
            </View>
            {[
              '30+ days before departure: Full refund minus INR 3,000 per person service fee.',
              '15–29 days: 50% of total package cost will be charged.',
              '7–14 days: 75% of total package cost will be charged.',
              'Less than 7 days or no-show: 100% cancellation fee applies.',
            ].map((t, i) => (
              <View key={i} style={s.termsItem}>
                <View style={s.termsItemNum}>
                  <Text style={s.termsItemNumText}>{i + 1}</Text>
                </View>
                <Text style={s.termsItemText}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>Payment & General Terms</Text>
            </View>
            {[
              '30% non-refundable deposit required to confirm booking.',
              'Balance due 15 days before departure.',
              'Packages include only services mentioned in the itinerary.',
              'Prices based on double-sharing accommodations unless stated otherwise.',
            ].map((t, i) => (
              <View key={i} style={s.termsItem}>
                <View style={s.termsItemNum}>
                  <Text style={s.termsItemNumText}>{i + 1}</Text>
                </View>
                <Text style={s.termsItemText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
        <Footer pageNum={hasStaysOrCars ? 6 : 5} total={totalPages} />
      </Page>
    </Document>
  );
};
