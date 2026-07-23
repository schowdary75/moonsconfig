import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { QuotePDFProps, money } from '../QuotePDFTemplate';

// Light Elegant — Refined Minimalism
const C = {
  white: '#FFFFFF',
  bg: '#FAFAFA',
  textDark: '#1F2937',
  textMid: '#4B5563',
  textMuted: '#9CA3AF',
  green: '#059669',
  greenLight: '#D1FAE5',
  greenDark: '#065F46',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  accent: '#111827',
};

const s = StyleSheet.create({
  pageWhite: { padding: 0, fontFamily: 'Inter', backgroundColor: C.white },
  pageGrey: { padding: 0, fontFamily: 'Inter', backgroundColor: C.bg },
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
    borderTopColor: C.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: { fontSize: 7, color: C.textMuted, letterSpacing: 0.5 },
  footerPage: { fontSize: 7, color: C.green, fontWeight: 600, letterSpacing: 1 },

  accentLine: { height: 1, backgroundColor: C.accent },

  // COVER
  coverSub: { color: C.textMuted, fontSize: 8, letterSpacing: 3, marginBottom: 8 },
  coverTitle: {
    color: C.textDark,
    fontSize: 34,
    fontWeight: 600,
    letterSpacing: -1,
    lineHeight: 1.15,
    marginBottom: 14,
  },
  coverDesc: { color: C.textMid, fontSize: 12, lineHeight: 1.6, marginBottom: 28 },

  metaRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    marginBottom: 30,
  },
  metaCol: { flex: 1 },
  metaLabel: { color: C.textMuted, fontSize: 7, letterSpacing: 2, marginBottom: 4 },
  metaValue: { color: C.textDark, fontSize: 11, fontWeight: 600 },

  priceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderColor: C.border,
    paddingTop: 20,
  },
  priceValue: { color: C.green, fontSize: 26, fontWeight: 600 },
  priceLabel: { color: C.textMuted, fontSize: 9, marginTop: 4 },
  priceTotalLabel: { color: C.textMuted, fontSize: 8, letterSpacing: 1 },
  priceTotalValue: { color: C.textDark, fontSize: 30, fontWeight: 600 },

  // ITINERARY
  sectionSub: { color: C.textMuted, fontSize: 8, letterSpacing: 3, marginBottom: 6 },
  sectionTitle: { color: C.textDark, fontSize: 20, fontWeight: 600, marginBottom: 20 },

  itinCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 14,
  },
  itinHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    borderBottomStyle: 'solid',
  },
  itinDay: { color: C.green, fontSize: 8, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 },
  itinTitle: { color: C.textDark, fontSize: 14, fontWeight: 600 },
  itinBody: { padding: 14 },
  itinDesc: { color: C.textMid, fontSize: 10, lineHeight: 1.6 },

  // INCLUSIONS
  incCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 14,
    overflow: 'hidden',
  },
  incHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incTitle: { fontSize: 12, fontWeight: 600, color: C.textDark },
  incBadge: {
    borderWidth: 1,
    borderColor: C.green,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  incBadgeText: { color: C.green, fontSize: 7, fontWeight: 600, letterSpacing: 1 },
  incItemBlock: { paddingHorizontal: 14, paddingVertical: 8 },
  incRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  incNum: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.greenLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  incNumText: { color: C.greenDark, fontSize: 7, fontWeight: 600 },
  incItemText: { flex: 1, color: C.textMid, fontSize: 9, lineHeight: 1.5 },

  // INVESTMENT
  investCard: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
  },
  investLabel: {
    color: C.textMuted,
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
  investRowTitle: { color: C.textDark, fontSize: 10, fontWeight: 600 },
  investRowDesc: { color: C.textMuted, fontSize: 8 },
  investRowPrice: { color: C.green, fontSize: 10, fontWeight: 600 },

  investGrand: { backgroundColor: C.accent, borderRadius: 6, padding: 16, marginTop: 6 },
  investGrandLabel: {
    color: C.textMuted,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 4,
  },
  investGrandValue: { color: C.white, fontSize: 24, fontWeight: 600 },

  // TERMS
  termsSection: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 12,
    overflow: 'hidden',
  },
  termsSectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: 'solid',
  },
  termsSectionTitle: { color: C.textDark, fontSize: 11, fontWeight: 600 },
  termsItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termsItemNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  termsItemNumText: { color: C.textMid, fontSize: 7, fontWeight: 600 },
  termsItemText: { flex: 1, color: C.textMid, fontSize: 8, lineHeight: 1.6 },
});

const Footer = ({ pageNum, total }: { pageNum: number; total: number }) => (
  <View style={s.footer} fixed>
    <Text style={s.footerText}>MooNs · Elegant Collection</Text>
    <Text
      style={s.footerPage}
    >{`${String(pageNum).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}</Text>
  </View>
);

export const TemplateV7 = ({
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
      <Page size="A4" style={s.pageWhite}>
        <View style={[s.pad, { paddingTop: 50, paddingBottom: 60 }]}>
          <Text style={s.coverSub}>CUSTOMIZED TRIP FOR {(leadName || 'GUEST').toUpperCase()}</Text>
          <Text style={s.coverTitle}>{packageName || 'Essence of Bali'}</Text>
          <Text style={s.coverDesc}>
            {leadNotes ||
              'Discover breathtaking beauty and rich culture from scenic rice terraces to serene beaches.'}
          </Text>

          <View style={[s.accentLine, { width: 40, marginBottom: 24 }]} />

          <View style={s.metaRow}>
            <View style={s.metaCol}>
              <Text style={s.metaLabel}>DESTINATIONS</Text>
              <Text style={s.metaValue}>{leadDestination || 'Bali, Indonesia'}</Text>
            </View>
            <View style={s.metaCol}>
              <Text style={s.metaLabel}>DURATION</Text>
              <Text style={s.metaValue}>{packageDuration || '7N / 8D'}</Text>
            </View>
            <View style={s.metaCol}>
              <Text style={s.metaLabel}>TRAVELLERS</Text>
              <Text style={s.metaValue}>2 Adults</Text>
            </View>
          </View>

          <View>
            <Text style={s.priceValue}>{money(finalPrice / 2)}</Text>
            <Text style={s.priceLabel}>Per Adult (excludes flights & visa)</Text>
          </View>

          <View style={s.priceSection}>
            <View>
              <Text style={s.priceTotalLabel}>TOTAL COST</Text>
              <Text style={{ color: C.textMuted, fontSize: 8 }}>Including all taxes</Text>
            </View>
            <Text style={s.priceTotalValue}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={1} total={totalPages} />
      </Page>

      {/* PAGE 2: ITINERARY */}
      {itinerary.length > 0 ? (
        <Page size="A4" style={s.pageWhite}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>YOUR JOURNEY</Text>
            <Text style={s.sectionTitle}>Day by Day Itinerary</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />
            {itinerary.map((day) => (
              <View key={day.day_number} style={s.itinCard} wrap={false}>
                <View style={s.itinHeader}>
                  <Text style={s.itinDay}>{`DAY ${String(day.day_number).padStart(2, '0')}`}</Text>
                  <Text style={s.itinTitle}>{day.title}</Text>
                </View>
                <View style={s.itinBody}>
                  <Text style={s.itinDesc}>{day.description}</Text>
                </View>
              </View>
            ))}
          </View>
          <Footer pageNum={2} total={totalPages} />
        </Page>
      ) : null}

      {/* PAGE 2.5: ACCOMMODATIONS & TRANSFERS */}
      {hasStaysOrCars ? (
        <Page size="A4" style={s.pageWhite}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>STAYS & LOGISTICS</Text>
            <Text style={s.sectionTitle}>Accommodations & Transfers</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

            {stays && stays.length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.textDark, marginBottom: 10 }}>
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
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.textDark, marginBottom: 10 }}>
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
      <Page size="A4" style={s.pageWhite}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>YOUR PACKAGE</Text>
          <Text style={s.sectionTitle}>Inclusions & Exclusions</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          {inclusions.length > 0 ? (
            <View style={s.incCard}>
              <View style={s.incHeader}>
                <Text style={s.incTitle}>Inclusions</Text>
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
                <Text style={s.incTitle}>Exclusions</Text>
                <View style={[s.incBadge, { borderColor: '#DC2626' }]}>
                  <Text style={[s.incBadgeText, { color: '#DC2626' }]}>EXCLUDED</Text>
                </View>
              </View>
              <View style={s.incItemBlock}>
                {exclusions.slice(0, 15).map((exc, i) => (
                  <View key={i} style={s.incRow}>
                    <View style={[s.incNum, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[s.incNumText, { color: '#DC2626' }]}>{i + 1}</Text>
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
      <Page size="A4" style={s.pageWhite}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>INVESTMENT</Text>
          <Text style={s.sectionTitle}>Cost Breakdown</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          <View style={s.investCard}>
            <Text style={s.investLabel}>BASE PACKAGE</Text>
            <View style={s.investRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.investRowTitle}>{packageName || 'Core Package'}</Text>
                <Text style={s.investRowDesc}>Included in quote</Text>
              </View>
              <Text style={s.investRowPrice}>{money(basePrice)}</Text>
            </View>
          </View>

          {activitiesCost > 0 && (
            <View style={s.investCard}>
              <Text style={s.investLabel}>EXPERIENCES</Text>
              {activities.map((a) => (
                <View key={a.id} style={s.investRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.investRowTitle}>{a.name}</Text>
                    <Text style={s.investRowDesc}>Day {a.dayNumber}</Text>
                  </View>
                  <Text style={s.investRowPrice}>{money(a.price)}</Text>
                </View>
              ))}
            </View>
          )}

          {(discountAmount > 0 || taxAmount > 0) && (
            <View style={s.investCard}>
              <Text style={s.investLabel}>ADJUSTMENTS</Text>
              {discountAmount > 0 && (
                <View style={s.investRow}>
                  <Text style={s.investRowTitle}>Discount</Text>
                  <Text style={[s.investRowPrice, { color: '#DC2626' }]}>
                    - {money(discountAmount)}
                  </Text>
                </View>
              )}
              {taxAmount > 0 && (
                <View style={s.investRow}>
                  <Text style={s.investRowTitle}>Taxes</Text>
                  <Text style={[s.investRowPrice, { color: '#D97706' }]}>+ {money(taxAmount)}</Text>
                </View>
              )}
            </View>
          )}

          <View style={s.investGrand}>
            <Text style={s.investGrandLabel}>GRAND TOTAL</Text>
            <Text style={s.investGrandValue}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={hasStaysOrCars ? 5 : 4} total={totalPages} />
      </Page>

      {/* PAGE 5: TERMS */}
      <Page size="A4" style={s.pageWhite}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>IMPORTANT</Text>
          <Text style={s.sectionTitle}>Terms & Conditions</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>Cancellation Policy</Text>
            </View>
            {[
              '30+ days before departure: Full refund minus INR 3,000 service fee.',
              '15–29 days: 50% charged.',
              '7–14 days: 75% charged.',
              'Less than 7 days or no-show: 100% cancellation fee.',
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
              <Text style={s.termsSectionTitle}>Payment & General</Text>
            </View>
            {[
              '30% deposit to confirm. Balance 15 days before departure.',
              'Packages include only services mentioned in itinerary.',
              'Prices based on twin-sharing accommodations.',
              "Valid passport (6-month validity) and visas are traveler's responsibility.",
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
