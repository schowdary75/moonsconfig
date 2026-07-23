import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { QuotePDFProps, money } from '../QuotePDFTemplate';

// Blue Experiential — Modern Deep Blue & Orange
const C = {
  navy: '#0F172A',
  navyMid: '#1E293B',
  blue: '#1E3A8A',
  orange: '#F97316',
  orangeLight: '#FED7AA',
  orangeDim: '#EA580C',
  white: '#FFFFFF',
  offWhite: '#EFF6FF',
  textDark: '#1E3A8A',
  textMid: '#1E40AF',
  textMuted: '#6B7280',
  cardBorder: '#BFDBFE',
  sky: '#3B82F6',
  skyLight: '#DBEAFE',
};

const s = StyleSheet.create({
  pageBlue: { padding: 0, fontFamily: 'Inter', backgroundColor: C.navy },
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
    borderTopColor: '#334155',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLight: { borderTopColor: C.cardBorder },
  footerText: { fontSize: 7, color: '#64748B', letterSpacing: 0.5 },
  footerPage: { fontSize: 7, color: C.orange, fontWeight: 600, letterSpacing: 1 },
  accentLine: { height: 2, backgroundColor: C.orange },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
  logoMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.orange,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  logoLetter: { color: C.white, fontSize: 12, fontWeight: 600 },
  logoText: { color: C.white, fontSize: 16, fontWeight: 600 },
  editionBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.orange,
    borderStyle: 'solid',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  editionBadgeText: { color: C.orange, fontSize: 7, letterSpacing: 3, fontWeight: 600 },
  coverTitle: {
    color: C.white,
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: -1,
    lineHeight: 1.15,
    marginBottom: 12,
  },
  coverDesc: { color: '#94A3B8', fontSize: 11, lineHeight: 1.6, marginBottom: 24 },
  metaRow: { flexDirection: 'row', gap: 8 },
  metaBox: { flex: 1, borderWidth: 1, borderColor: '#334155', borderStyle: 'solid', padding: 10 },
  metaLabel: { color: C.orange, fontSize: 7, letterSpacing: 2, marginBottom: 4 },
  metaValue: { color: C.white, fontSize: 11, fontWeight: 600 },
  priceBox: { backgroundColor: C.blue, borderRadius: 6, padding: 18, marginTop: 20 },
  priceLabel: { color: C.orange, fontSize: 8, letterSpacing: 2, marginBottom: 6 },
  priceLg: { color: C.orange, fontSize: 26, fontWeight: 600 },
  sectionSub: { color: C.textMuted, fontSize: 8, letterSpacing: 3, marginBottom: 6 },
  sectionTitle: { color: C.textDark, fontSize: 20, fontWeight: 600, marginBottom: 20 },
  itinCard: {
    backgroundColor: C.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    padding: 14,
    marginBottom: 12,
  },
  itinBadge: {
    backgroundColor: C.orange,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  itinBadgeText: { color: C.white, fontSize: 7, fontWeight: 600 },
  itinTitle: { color: C.textDark, fontSize: 13, fontWeight: 600, marginBottom: 4 },
  itinDesc: { color: C.textMid, fontSize: 10, lineHeight: 1.6 },
  expBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.skyLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    marginTop: 6,
  },
  expBadgeText: { color: C.sky, fontSize: 7, fontWeight: 600, letterSpacing: 0.5 },
  incCard: {
    backgroundColor: C.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    marginBottom: 12,
    overflow: 'hidden',
  },
  incHeader: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    borderColor: C.sky,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  incBadgeText: { color: C.sky, fontSize: 7, fontWeight: 600, letterSpacing: 1 },
  incItemBlock: { paddingHorizontal: 14, paddingVertical: 6 },
  incRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  incNum: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.skyLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  incNumText: { color: C.blue, fontSize: 7, fontWeight: 600 },
  incItemText: { flex: 1, color: C.textMid, fontSize: 9, lineHeight: 1.5 },
  investCard: { backgroundColor: C.navyMid, borderRadius: 6, padding: 14, marginBottom: 10 },
  investLabel: { color: C.orange, fontSize: 7, letterSpacing: 2, fontWeight: 600, marginBottom: 8 },
  investRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  investRowTitle: { color: C.white, fontSize: 10, fontWeight: 600 },
  investRowDesc: { color: '#64748B', fontSize: 8 },
  investRowPrice: { color: C.orangeLight, fontSize: 10, fontWeight: 600 },
  investGrand: { backgroundColor: C.orange, borderRadius: 6, padding: 16, marginTop: 6 },
  investGrandLabel: {
    color: C.navy,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 4,
  },
  investGrandValue: { color: C.navy, fontSize: 24, fontWeight: 600 },
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
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF6FF',
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termsItemNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.skyLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 1,
  },
  termsItemNumText: { color: C.blue, fontSize: 7, fontWeight: 600 },
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
    <Text style={s.footerText}>MooNs · Experiential Collection</Text>
    <Text
      style={s.footerPage}
    >{`${String(pageNum).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}</Text>
  </View>
);

export const TemplateV13 = ({
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
      <Page size="A4" style={s.pageBlue}>
        <View style={[s.pad, { paddingTop: 40, paddingBottom: 60 }]}>
          <View style={s.logoRow}>
            <View style={s.logoMark}>
              <Text style={s.logoLetter}>M</Text>
            </View>
            <Text style={s.logoText}>MooNs</Text>
          </View>
          <View style={s.editionBadge}>
            <Text style={s.editionBadgeText}>EXPERIENTIAL JOURNEY</Text>
          </View>
          <Text style={s.coverTitle}>{packageName || 'Experiential Journey'}</Text>
          <Text style={s.coverDesc}>
            {leadNotes ||
              'A dynamic journey built for modern travelers who seek authentic local experiences.'}
          </Text>
          <View style={[s.accentLine, { width: 40, marginBottom: 16 }]} />
          <View style={s.metaRow}>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>ROUTE</Text>
              <Text style={s.metaValue}>{leadDestination || 'Global'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>DURATION</Text>
              <Text style={s.metaValue}>{packageDuration || 'TBD'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>TRAVELLERS</Text>
              <Text style={s.metaValue}>2</Text>
            </View>
          </View>
          <View style={s.priceBox}>
            <Text style={s.priceLabel}>TOTAL INVESTMENT</Text>
            <Text style={s.priceLg}>{money(finalPrice)}</Text>
          </View>
        </View>
        <Footer pageNum={1} total={totalPages} dark />
      </Page>

      {itinerary.length > 0 && (
        <Page size="A4" style={s.pageLight}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.sectionSub}>EXPERIENCE MAP</Text>
            <Text style={s.sectionTitle}>Journey Log</Text>
            <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />
            {itinerary.map((d) => (
              <View key={d.day_number} style={s.itinCard} wrap={false}>
                <View style={s.itinBadge}>
                  <Text
                    style={s.itinBadgeText}
                  >{`DAY ${String(d.day_number).padStart(2, '0')}`}</Text>
                </View>
                <Text style={s.itinTitle}>{d.title}</Text>
                <Text style={s.itinDesc}>{d.description}</Text>
                <View style={s.expBadge}>
                  <Text style={s.expBadgeText}>LOCAL EXPERIENCE</Text>
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
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.blue, marginBottom: 10 }}>
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
                <Text style={{ fontSize: 9, fontWeight: 600, color: C.blue, marginBottom: 10 }}>
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
                <Text style={s.incTitle}>Included</Text>
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
                <Text style={s.incTitle}>Excluded</Text>
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

      <Page size="A4" style={s.pageBlue}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={{ color: C.orange, fontSize: 8, letterSpacing: 3, marginBottom: 6 }}>
            INVESTMENT
          </Text>
          <Text style={{ color: C.white, fontSize: 20, fontWeight: 600, marginBottom: 20 }}>
            Cost Breakdown
          </Text>
          <View style={[s.accentLine, { width: 30, marginBottom: 16 }]} />
          <View style={s.investCard}>
            <Text style={s.investLabel}>BASE EXPERIENCE</Text>
            <View style={s.investRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.investRowTitle}>{packageName || 'Core Package'}</Text>
                <Text style={s.investRowDesc}>All-inclusive experience</Text>
              </View>
              <Text style={s.investRowPrice}>{money(basePrice)}</Text>
            </View>
          </View>
          {activitiesCost > 0 && (
            <View style={s.investCard}>
              <Text style={s.investLabel}>ADD-ON EXPERIENCES</Text>
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
              <Text style={s.termsSectionTitle}>Cancellation</Text>
            </View>
            {[
              '30+ days: Full refund minus INR 3,000.',
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
              'Twin-sharing accommodations unless specified.',
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
