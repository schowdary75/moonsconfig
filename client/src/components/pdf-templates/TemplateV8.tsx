import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { QuotePDFProps, money } from '../QuotePDFTemplate';

// Dark Gold Premium — Luxe Noir & Gold
const C = {
  noir: '#0F1117',
  noirMid: '#1C1F26',
  noirCard: '#22252E',
  gold: '#D4AF37',
  goldLight: '#F0DFA0',
  goldDim: '#9E8230',
  white: '#FFFFFF',
  offWhite: '#F8F9FA',
  textDark: '#1C1F26',
  textMid: '#4B5563',
  textMuted: '#9CA3AF',
  border: '#2D3039',
  borderLight: '#E5E7EB',
};

const s = StyleSheet.create({
  pageDark: { padding: 0, fontFamily: 'Inter', backgroundColor: C.noir },
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
    borderTopColor: C.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLight: { borderTopColor: C.borderLight },
  footerText: { fontSize: 7, color: '#6B7280', letterSpacing: 0.5 },
  footerPage: { fontSize: 7, color: C.gold, fontWeight: 600, letterSpacing: 1 },

  accentLine: { height: 2, backgroundColor: C.gold },

  // COVER
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
  logoMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  logoLetter: { color: C.noir, fontSize: 12, fontWeight: 600 },
  logoText: { color: C.white, fontSize: 16, fontWeight: 600 },

  editionBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.gold,
    borderStyle: 'solid',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 16,
  },
  editionBadgeText: { color: C.gold, fontSize: 7, letterSpacing: 3, fontWeight: 600 },

  craftedLabel: { color: C.gold, fontSize: 7, letterSpacing: 2, marginBottom: 4 },
  craftedName: { color: C.white, fontSize: 12, marginBottom: 20 },
  coverTitle: {
    color: C.white,
    fontSize: 32,
    fontWeight: 600,
    letterSpacing: -1,
    lineHeight: 1.15,
    marginBottom: 12,
  },
  coverDesc: { color: '#9CA3AF', fontSize: 11, lineHeight: 1.6, marginBottom: 28 },

  metaRow: { flexDirection: 'row', gap: 10 },
  metaBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: 12 },
  metaLabel: { color: C.gold, fontSize: 7, letterSpacing: 2, marginBottom: 4 },
  metaValue: { color: C.white, fontSize: 12, fontWeight: 600 },

  priceBox: {
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'solid',
    padding: 18,
    marginTop: 24,
  },
  priceLabel: { color: C.gold, fontSize: 8, letterSpacing: 2, marginBottom: 6 },
  priceSm: { color: C.white, fontSize: 18, fontWeight: 600, marginBottom: 14 },
  priceLg: { color: C.gold, fontSize: 28, fontWeight: 600 },

  // ITINERARY
  sectionSub: { color: C.textMuted, fontSize: 8, letterSpacing: 3, marginBottom: 6 },
  sectionTitle: { color: C.textDark, fontSize: 20, fontWeight: 600, marginBottom: 20 },

  itinCard: {
    backgroundColor: C.white,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.borderLight,
    borderStyle: 'solid',
  },
  itinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    borderBottomStyle: 'solid',
  },
  itinBadge: {
    backgroundColor: C.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    marginRight: 10,
  },
  itinBadgeText: { color: C.white, fontSize: 7, fontWeight: 600 },
  itinTitle: { color: C.textDark, fontSize: 13, fontWeight: 600 },
  itinBody: { padding: 14 },
  itinDesc: { color: C.textMid, fontSize: 10, lineHeight: 1.6 },

  // INCLUSIONS
  incCard: {
    borderWidth: 1,
    borderColor: C.borderLight,
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
    borderColor: C.gold,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  incBadgeText: { color: C.gold, fontSize: 7, fontWeight: 600, letterSpacing: 1 },
  incItemBlock: { paddingHorizontal: 14, paddingVertical: 8 },
  incRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  incNum: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  incNumText: { color: C.goldDim, fontSize: 7, fontWeight: 600 },
  incItemText: { flex: 1, color: C.textMid, fontSize: 9, lineHeight: 1.5 },

  // INVESTMENT
  investCard: { backgroundColor: C.noirCard, borderRadius: 6, padding: 14, marginBottom: 10 },
  investLabel: { color: C.gold, fontSize: 7, letterSpacing: 2, fontWeight: 600, marginBottom: 8 },
  investRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  investRowTitle: { color: C.white, fontSize: 10, fontWeight: 600 },
  investRowDesc: { color: '#6B7280', fontSize: 8 },
  investRowPrice: { color: C.goldLight, fontSize: 10, fontWeight: 600 },

  investGrand: { backgroundColor: C.gold, borderRadius: 6, padding: 16, marginTop: 6 },
  investGrandLabel: {
    color: C.noir,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 4,
  },
  investGrandValue: { color: C.noir, fontSize: 24, fontWeight: 600 },

  // TERMS
  termsSection: {
    borderWidth: 1,
    borderColor: C.borderLight,
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
    borderBottomColor: C.borderLight,
    borderBottomStyle: 'solid',
  },
  termsSectionTitle: { color: C.textDark, fontSize: 11, fontWeight: 600 },
  termsItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termsItemNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  termsItemNumText: { color: C.goldDim, fontSize: 7, fontWeight: 600 },
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
  <View style={[s.footer, !dark ? s.footerLight : {}]} fixed>
    <Text style={s.footerText}>MooNs · Private Collection</Text>
    <Text
      style={s.footerPage}
    >{`${String(pageNum).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}</Text>
  </View>
);

export const TemplateV8 = ({
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
      <Page size="A4" style={s.pageDark}>
        <View style={[s.pad, { paddingTop: 40, paddingBottom: 60 }]}>
          <View style={s.logoRow}>
            <View style={s.logoMark}>
              <Text style={s.logoLetter}>M</Text>
            </View>
            <Text style={s.logoText}>MooNs</Text>
          </View>
          <View style={s.editionBadge}>
            <Text style={s.editionBadgeText}>EXCLUSIVELY CURATED</Text>
          </View>
          <Text style={s.craftedLabel}>CRAFTED FOR</Text>
          <Text style={s.craftedName}>{leadName || 'Guest'}</Text>
          <Text style={s.coverTitle}>{packageName || 'Essence of Luxury'}</Text>
          <Text style={s.coverDesc}>
            {leadNotes || 'A premium tropical escape crafted perfectly for your taste.'}
          </Text>
          <View style={[s.accentLine, { width: 40, marginBottom: 16 }]} />
          <View style={s.metaRow}>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>ROUTE</Text>
              <Text style={s.metaValue}>{leadDestination || 'Open'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>LENGTH</Text>
              <Text style={s.metaValue}>{packageDuration || 'TBD'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>GUESTS</Text>
              <Text style={s.metaValue}>2</Text>
            </View>
          </View>
          <View style={s.priceBox}>
            <Text style={s.priceLabel}>PER ADULT</Text>
            <Text style={s.priceSm}>{money(finalPrice / 2)}</Text>
            <Text style={s.priceLabel}>GRAND TOTAL</Text>
            <Text style={s.priceLg}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={1} total={totalPages} dark />
      </Page>

      {itinerary.length > 0 && (
        <Page size="A4" style={s.pageLight}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>YOUR JOURNEY</Text>
            <Text style={s.sectionTitle}>Day by Day Itinerary</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />
            {itinerary.map((d) => (
              <View key={d.day_number} style={s.itinCard} wrap={false}>
                <View style={s.itinHeader}>
                  <View style={s.itinBadge}>
                    <Text
                      style={s.itinBadgeText}
                    >{`DAY ${String(d.day_number).padStart(2, '0')}`}</Text>
                  </View>
                  <Text style={s.itinTitle}>{d.title}</Text>
                </View>
                <View style={s.itinBody}>
                  <Text style={s.itinDesc}>{d.description}</Text>
                </View>
              </View>
            ))}
          </View>
          <Footer pageNum={2} total={totalPages} />
        </Page>
      )}

      {/* PAGE 2.5: ACCOMMODATIONS & TRANSFERS */}
      {hasStaysOrCars && (
        <Page size="A4" style={s.pageLight}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>STAYS & LOGISTICS</Text>
            <Text style={s.sectionTitle}>Accommodations & Transfers</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />

            {stays && stays.length > 0 && (
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
            )}

            {transfers && transfers.length > 0 && (
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
            )}
          </View>
          <Footer pageNum={3} total={totalPages} />
        </Page>
      )}

      <Page size="A4" style={s.pageLight}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>YOUR PACKAGE</Text>
          <Text style={s.sectionTitle}>Inclusions & Exclusions</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />
          {inclusions.length > 0 && (
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
          )}
          {exclusions.length > 0 && (
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
          )}
        </View>
        <Footer pageNum={hasStaysOrCars ? 4 : 3} total={totalPages} />
      </Page>

      <Page size="A4" style={s.pageDark}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={{ color: C.gold, fontSize: 8, letterSpacing: 3, marginBottom: 6 }}>
            INVESTMENT
          </Text>
          <Text style={{ color: C.white, fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            Cost Breakdown
          </Text>
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
          )}
          <View style={s.investGrand}>
            <Text style={s.investGrandLabel}>GRAND TOTAL</Text>
            <Text style={s.investGrandValue}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={hasStaysOrCars ? 5 : 4} total={totalPages} dark />
      </Page>

      <Page size="A4" style={s.pageLight}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.sectionSub}>IMPORTANT</Text>
          <Text style={s.sectionTitle}>Terms & Conditions</Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />
          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>Cancellation Policy</Text>
            </View>
            {[
              '30+ days: Full refund minus INR 3,000 fee.',
              '15–29 days: 50% charged.',
              '7–14 days: 75% charged.',
              'Less than 7 days/no-show: 100% fee.',
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
              '30% deposit to confirm. Balance 15 days prior.',
              'Only itinerary-listed services included.',
              'Twin-sharing accommodation pricing.',
              'Passport (6-month validity) & visas are traveler responsibility.',
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
