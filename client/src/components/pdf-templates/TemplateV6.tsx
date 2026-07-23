import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { QuotePDFProps, money } from '../QuotePDFTemplate';

// Adventure / Forest — Refined Earth Tones
const C = {
  forest: '#0F2818',
  forestMid: '#1B3D27',
  emerald: '#10B981',
  emeraldLight: '#A7F3D0',
  emeraldDark: '#065F46',
  sage: '#86E7B8',
  white: '#FFFFFF',
  offWhite: '#F0FDF4',
  textDark: '#1C201A',
  textMid: '#374151',
  textMuted: '#6B7280',
  cardBorder: '#D1FAE5',
  amber: '#D97706',
  amberLight: '#FEF3C7',
};

const s = StyleSheet.create({
  pageForest: { padding: 0, fontFamily: 'Inter', backgroundColor: C.forest },
  pageLight: { padding: 0, fontFamily: 'Inter', backgroundColor: C.offWhite },
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
    borderTopColor: '#2E5B42',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLight: { borderTopColor: C.cardBorder },
  footerText: { fontSize: 7, color: '#5D7A6A', letterSpacing: 0.5 },
  footerPage: { fontSize: 7, color: C.emerald, fontWeight: 600, letterSpacing: 1 },

  accentLine: { height: 2, backgroundColor: C.emerald },

  // COVER
  coverMain: { padding: 40, paddingBottom: 30, flex: 1 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
  logoMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  logoLetter: { color: C.forest, fontSize: 12, fontWeight: 600 },
  logoText: { color: C.white, fontSize: 16, fontWeight: 600 },

  editionBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.sage,
    borderStyle: 'solid',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  editionBadgeText: { color: C.sage, fontSize: 7, letterSpacing: 3, fontWeight: 600 },

  coverTitle: {
    color: C.white,
    fontSize: 32,
    fontWeight: 600,
    letterSpacing: -1,
    lineHeight: 1.15,
    marginBottom: 12,
  },
  coverDesc: { color: C.sage, fontSize: 11, lineHeight: 1.6, marginBottom: 28 },

  metaRow: { flexDirection: 'row', gap: 10 },
  metaBox: { flex: 1, borderWidth: 1, borderColor: '#2E5B42', borderStyle: 'solid', padding: 12 },
  metaLabel: { color: C.sage, fontSize: 7, letterSpacing: 2, marginBottom: 4 },
  metaValue: { color: C.white, fontSize: 12, fontWeight: 600 },

  priceBox: {
    borderWidth: 1,
    borderColor: '#2E5B42',
    borderStyle: 'solid',
    padding: 18,
    marginTop: 24,
  },
  priceLabel: { color: C.sage, fontSize: 8, letterSpacing: 2, marginBottom: 6 },
  priceLg: { color: C.white, fontSize: 28, fontWeight: 600 },
  priceSm: { color: C.emeraldLight, fontSize: 16, fontWeight: 600 },

  // ITINERARY
  sectionSub: { color: C.textMuted, fontSize: 8, letterSpacing: 3, marginBottom: 6 },
  sectionTitle: { color: C.textDark, fontSize: 20, fontWeight: 600, marginBottom: 20 },

  itinCard: {
    backgroundColor: C.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    overflow: 'hidden',
    marginBottom: 14,
  },
  itinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    borderBottomStyle: 'solid',
  },
  itinBadge: {
    backgroundColor: C.emerald,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    marginRight: 10,
  },
  itinBadgeText: { color: C.white, fontSize: 7, fontWeight: 600, letterSpacing: 0.5 },
  itinDay: { color: C.textMuted, fontSize: 9, fontWeight: 600 },
  itinBody: { padding: 14 },
  itinTitle: { color: C.textDark, fontSize: 13, fontWeight: 600, marginBottom: 6 },
  itinDesc: { color: C.textMid, fontSize: 10, lineHeight: 1.6 },
  difficultyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.amberLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    marginTop: 8,
  },
  difficultyText: { color: C.amber, fontSize: 7, fontWeight: 600, letterSpacing: 0.5 },

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
    borderColor: C.emerald,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  incBadgeText: { color: C.emerald, fontSize: 7, fontWeight: 600, letterSpacing: 1 },
  incItemBlock: { paddingHorizontal: 14, paddingVertical: 8 },
  incRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  incNum: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  incNumText: { color: C.emeraldDark, fontSize: 7, fontWeight: 600 },
  incItemText: { flex: 1, color: C.textMid, fontSize: 9, lineHeight: 1.5 },

  // INVESTMENT
  investCard: { backgroundColor: C.forestMid, borderRadius: 6, padding: 14, marginBottom: 10 },
  investLabel: { color: C.sage, fontSize: 7, letterSpacing: 2, fontWeight: 600, marginBottom: 8 },
  investRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  investRowTitle: { color: C.white, fontSize: 10, fontWeight: 600 },
  investRowDesc: { color: '#5D7A6A', fontSize: 8 },
  investRowPrice: { color: C.emeraldLight, fontSize: 10, fontWeight: 600 },

  investGrand: { backgroundColor: C.emerald, borderRadius: 6, padding: 16, marginTop: 6 },
  investGrandLabel: {
    color: C.forest,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 4,
  },
  investGrandValue: { color: C.forest, fontSize: 24, fontWeight: 600 },

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
    backgroundColor: C.offWhite,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    borderBottomStyle: 'solid',
  },
  termsSectionTitle: { color: C.textDark, fontSize: 11, fontWeight: 600 },
  termsItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E8F5EE',
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termsItemNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  termsItemNumText: { color: C.emeraldDark, fontSize: 7, fontWeight: 600 },
  termsItemText: { flex: 1, color: C.textMid, fontSize: 8, lineHeight: 1.6 },
});

const Footer = ({
  pageNum,
  total,
  dark = true,
}: {
  pageNum: number;
  total: number;
  dark?: boolean;
}) => (
  <View style={[s.footer, !dark ? s.footerLight : {}]} fixed>
    <Text style={s.footerText}>MooNs · Adventure Collection</Text>
    <Text
      style={s.footerPage}
    >{`${String(pageNum).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}</Text>
  </View>
);

export const TemplateV6 = ({
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
      <Page size="A4" style={s.pageForest}>
        <View style={s.coverMain}>
          <View style={s.logoRow}>
            <View style={s.logoMark}>
              <Text style={s.logoLetter}>M</Text>
            </View>
            <Text style={s.logoText}>MooNs</Text>
          </View>

          <View style={s.editionBadge}>
            <Text style={s.editionBadgeText}>ADVENTURE COLLECTION</Text>
          </View>

          <Text style={s.coverTitle}>{packageName || 'Essence of Adventure'}</Text>
          <Text style={s.coverDesc}>
            {leadNotes ||
              'Discover breathtaking beauty and rich culture through active exploration.'}
          </Text>

          <View style={[s.accentLine, { width: 40, marginBottom: 16 }]} />

          <View style={s.metaRow}>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>BASE CAMP</Text>
              <Text style={s.metaValue}>{leadDestination || 'Open'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>EXPEDITION</Text>
              <Text style={s.metaValue}>{packageDuration || 'TBD'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>CREW</Text>
              <Text style={s.metaValue}>2 Adults</Text>
            </View>
          </View>

          <View style={s.priceBox}>
            <Text style={s.priceLabel}>PER ADVENTURER</Text>
            <Text style={s.priceSm}>{money(finalPrice / 2)}</Text>
            <View style={{ height: 1, backgroundColor: '#2E5B42', marginVertical: 10 }} />
            <Text style={s.priceLabel}>GRAND TOTAL</Text>
            <Text style={s.priceLg}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={1} total={totalPages} />
      </Page>

      {/* PAGE 2: ITINERARY */}
      {itinerary.length > 0 ? (
        <Page size="A4" style={s.pageLight}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>TRAIL MAP</Text>
            <Text style={s.sectionTitle}>Day by Day Expedition</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

            {itinerary.map((day) => (
              <View key={day.day_number} style={s.itinCard} wrap={false}>
                <View style={s.itinHeader}>
                  <View style={s.itinBadge}>
                    <Text
                      style={s.itinBadgeText}
                    >{`DAY ${String(day.day_number).padStart(2, '0')}`}</Text>
                  </View>
                  <Text style={s.itinDay}>{day.title}</Text>
                </View>
                <View style={s.itinBody}>
                  <Text style={s.itinTitle}>{day.title}</Text>
                  <Text style={s.itinDesc}>{day.description}</Text>
                  <View style={s.difficultyBadge}>
                    <Text style={s.difficultyText}>TRAIL: MODERATE</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
          <Footer pageNum={2} total={totalPages} dark={false} />
        </Page>
      ) : null}

      {/* PAGE 3: ACCOMMODATIONS & TRANSFERS */}
      {hasStaysOrCars ? (
        <Page size="A4" style={s.pageLight}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>STAYS & LOGISTICS</Text>
            <Text style={s.sectionTitle}>Accommodations & Transfers</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

            {stays && stays.length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.forest, marginBottom: 10 }}>
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
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.forest, marginBottom: 10 }}>
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
          <Footer pageNum={3} total={totalPages} dark={false} />
        </Page>
      ) : null}

      {/* PAGE: INCLUSIONS & EXCLUSIONS */}
      <Page size="A4" style={s.pageLight}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>GEAR CHECK</Text>
          <Text style={s.sectionTitle}>Inclusions & Exclusions</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          {inclusions.length > 0 ? (
            <View style={s.incCard}>
              <View style={s.incHeader}>
                <Text style={s.incTitle}>Included in Base Camp</Text>
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
          ) : (
            <Text>No inclusions specified.</Text>
          )}

          {exclusions.length > 0 ? (
            <View style={s.incCard}>
              <View style={s.incHeader}>
                <Text style={s.incTitle}>Not in Base Camp</Text>
                <View style={[s.incBadge, { borderColor: C.amber }]}>
                  <Text style={[s.incBadgeText, { color: C.amber }]}>EXCLUDED</Text>
                </View>
              </View>
              <View style={s.incItemBlock}>
                {exclusions.slice(0, 15).map((exc, i) => (
                  <View key={i} style={s.incRow}>
                    <View style={[s.incNum, { backgroundColor: C.amberLight }]}>
                      <Text style={[s.incNumText, { color: C.amber }]}>{i + 1}</Text>
                    </View>
                    <Text style={s.incItemText}>{exc.item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
        <Footer pageNum={hasStaysOrCars ? 4 : 3} total={totalPages} dark={false} />
      </Page>

      {/* PAGE: INVESTMENT */}
      <Page size="A4" style={s.pageForest}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={{ color: C.sage, fontSize: 8, letterSpacing: 3, marginBottom: 6 }}>
            EXPEDITION COST
          </Text>
          <Text style={{ color: C.white, fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            Investment Breakdown
          </Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          <View style={s.investCard}>
            <Text style={s.investLabel}>BASE EXPEDITION</Text>
            <View style={s.investRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.investRowTitle}>{packageName || 'Core Package'}</Text>
                <Text style={s.investRowDesc}>All-inclusive adventure</Text>
              </View>
              <Text style={s.investRowPrice}>{money(basePrice)}</Text>
            </View>
          </View>

          {activitiesCost > 0 ? (
            <View style={s.investCard}>
              <Text style={s.investLabel}>TRAIL ADD-ONS</Text>
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
              {discountAmount > 0 && (
                <View style={s.investRow}>
                  <Text style={s.investRowTitle}>Discount</Text>
                  <Text style={[s.investRowPrice, { color: '#FCA5A5' }]}>
                    - {money(discountAmount)}
                  </Text>
                </View>
              )}
              {taxAmount > 0 && (
                <View style={s.investRow}>
                  <Text style={s.investRowTitle}>Taxes</Text>
                  <Text style={[s.investRowPrice, { color: '#FDE68A' }]}>+ {money(taxAmount)}</Text>
                </View>
              )}
            </View>
          ) : null}

          <View style={s.investGrand}>
            <Text style={s.investGrandLabel}>EXPEDITION TOTAL</Text>
            <Text style={s.investGrandValue}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={hasStaysOrCars ? 5 : 4} total={totalPages} dark={true} />
      </Page>

      {/* PAGE: RULES */}
      <Page size="A4" style={s.pageLight}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>TRAIL RULES</Text>
          <Text style={s.sectionTitle}>Terms & Conditions</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>Cancellation Policy</Text>
            </View>
            {[
              '30+ days before departure: Full refund minus INR 3,000 service fee.',
              '15–29 days: 50% of package cost charged.',
              '7–14 days: 75% of package cost charged.',
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
              <Text style={s.termsSectionTitle}>Payment & General Terms</Text>
            </View>
            {[
              '30% deposit required to confirm booking.',
              'Balance due 15 days before departure.',
              'Only services mentioned in itinerary are included.',
              'Prices based on twin-sharing accommodations.',
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
        <Footer pageNum={hasStaysOrCars ? 6 : 5} total={totalPages} dark={false} />
      </Page>
    </Document>
  );
};
