import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'Inter',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff',
    }, // 400
    {
      src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff',
      fontWeight: 600,
    }, // 600
  ],
});

// Premium Field Guide — Refined Palette
const C = {
  dark: '#1A1E17',
  darkMid: '#2E352B',
  beige: '#F1EBD8',
  beigeLight: '#F8F5EC',
  gold: '#C9952A',
  goldLight: '#E8D4A0',
  goldDim: '#A07B22',
  white: '#FFFFFF',
  offWhite: '#FAFAF6',
  green: '#0D9668',
  greenLight: '#D1FAE5',
  greenDark: '#065F46',
  textDark: '#1C201A',
  textMid: '#4A4F46',
  textMuted: '#6B7262',
  textLight: '#9CA396',
  divider: '#D4CBB3',
  dividerLight: '#E8E2D1',
  cardBorder: '#E5E0CF',
  red: '#DC2626',
  redLight: '#FEE2E2',
};

const s = StyleSheet.create({
  // ── Globals ──
  pageBeige: { padding: 0, fontFamily: 'Inter', backgroundColor: C.beige },
  pageDark: { padding: 0, fontFamily: 'Inter', backgroundColor: C.dark },
  pageWhite: { padding: 0, fontFamily: 'Inter', backgroundColor: C.offWhite },
  pad: { paddingHorizontal: 40, paddingVertical: 30 },

  // ── Footer ──
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    paddingBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerDark: { borderTopColor: '#3A4035' },
  footerText: { fontSize: 7, color: C.textMuted, letterSpacing: 0.5 },
  footerTextDark: { color: '#6B7262' },
  footerPage: { fontSize: 7, color: C.gold, fontWeight: 600, letterSpacing: 1 },

  // ── Decorative ──
  accentLineH: { height: 2, backgroundColor: C.gold },
  accentLineThin: { height: 1, backgroundColor: C.goldLight },
  accentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  cornerAccent: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderColor: C.gold,
    borderStyle: 'solid',
  },

  // ── COVER PAGE ──
  coverDark: {
    backgroundColor: C.dark,
    padding: 40,
    paddingBottom: 30,
    minHeight: '62%',
    position: 'relative',
  },
  coverBeige: {
    backgroundColor: C.beige,
    padding: 40,
    paddingTop: 24,
    minHeight: '38%',
    position: 'relative',
  },

  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 40 },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoLetter: { color: C.dark, fontSize: 14, fontWeight: 600 },
  logoText: { color: C.white, fontSize: 18, fontWeight: 600, letterSpacing: -0.5 },

  preparedLabel: { color: C.gold, fontSize: 8, letterSpacing: 3, marginBottom: 6 },
  preparedName: { color: C.white, fontSize: 14, fontWeight: 600, marginBottom: 28 },

  mainTitle: {
    color: C.white,
    fontSize: 34,
    fontWeight: 600,
    letterSpacing: -1,
    lineHeight: 1.15,
    marginBottom: 12,
  },
  mainDesc: { color: '#9CA396', fontSize: 11, lineHeight: 1.6, marginBottom: 28, maxWidth: '85%' },

  metaGrid: { flexDirection: 'row', gap: 10 },
  metaBox: { flex: 1, borderWidth: 1, borderColor: '#3E4539', borderStyle: 'solid', padding: 12 },
  metaLabel: { color: C.gold, fontSize: 7, letterSpacing: 2, marginBottom: 5 },
  metaValue: { color: C.white, fontSize: 13, fontWeight: 600 },

  // Permit card (cover bottom)
  permitCard: { borderWidth: 1, borderColor: C.divider, borderStyle: 'solid', padding: 20 },
  permitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  permitTitle: { color: C.textMuted, fontSize: 8, letterSpacing: 3 },
  permitRefBadge: { backgroundColor: C.dark, paddingHorizontal: 8, paddingVertical: 3 },
  permitRefText: { color: C.gold, fontSize: 7, letterSpacing: 1, fontWeight: 600 },
  permitDivider: { height: 1, backgroundColor: C.divider, marginVertical: 12 },
  permitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  permitLabel: { color: C.textMuted, fontSize: 8, letterSpacing: 2 },
  permitValueSm: { color: C.textDark, fontSize: 20, fontWeight: 600 },
  permitValueLg: { color: C.goldDim, fontSize: 30, fontWeight: 600 },

  // ── ITINERARY PAGE ──
  routeBanner: {
    backgroundColor: C.dark,
    paddingHorizontal: 40,
    paddingVertical: 24,
    marginBottom: 0,
  },
  routeBannerSub: { color: C.gold, fontSize: 8, letterSpacing: 3, marginBottom: 6 },
  routeBannerTitle: { color: C.white, fontSize: 22, fontWeight: 600 },

  checkCard: {
    backgroundColor: C.beigeLight,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    marginBottom: 14,
    marginHorizontal: 40,
  },
  checkHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    borderBottomStyle: 'solid',
  },
  checkTags: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkBadge: {
    backgroundColor: C.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    marginRight: 10,
  },
  checkBadgeText: { color: C.dark, fontSize: 7, fontWeight: 600, letterSpacing: 1 },
  checkDayText: { color: C.textMuted, fontSize: 9, fontWeight: 600, letterSpacing: 0.5 },
  checkTitle: { color: C.textDark, fontSize: 16, fontWeight: 600, marginBottom: 6 },
  checkIntensity: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.textMuted,
    borderStyle: 'solid',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 10,
  },
  checkIntensityText: { color: C.textMuted, fontSize: 7, letterSpacing: 1 },
  checkDesc: { color: C.textMid, fontSize: 10, lineHeight: 1.6 },

  checkMeta: {
    borderWidth: 1,
    borderColor: C.greenLight,
    borderStyle: 'solid',
    backgroundColor: '#F0FDF4',
    padding: 8,
    marginTop: 10,
  },
  checkMetaText: { color: C.greenDark, fontSize: 9, fontWeight: 600 },

  checkActivityArea: { backgroundColor: '#EEEADE', padding: 14 },
  activityTag: {
    backgroundColor: C.dark,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-end',
    marginBottom: 6,
  },
  activityTagText: { color: C.gold, fontSize: 7, letterSpacing: 1 },
  activityName: { color: C.textDark, fontSize: 10, fontWeight: 600, marginBottom: 2 },
  activityPrice: { color: C.green, fontSize: 9, fontWeight: 600 },

  // ── INCLUSIONS / EXCLUSIONS PAGE ──
  incPageSub: { color: C.textMuted, fontSize: 8, letterSpacing: 3, marginBottom: 8 },
  incPageTitle: { color: C.textDark, fontSize: 22, fontWeight: 600, marginBottom: 24 },

  incCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 16,
    overflow: 'hidden',
  },
  incCardHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incCardTitle: { fontSize: 14, fontWeight: 600, color: C.textDark },
  incBadge: {
    borderWidth: 1,
    borderColor: C.green,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  incBadgeText: { color: C.green, fontSize: 7, fontWeight: 600, letterSpacing: 1 },
  excBadge: {
    borderWidth: 1,
    borderColor: C.red,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  excBadgeText: { color: C.red, fontSize: 7, fontWeight: 600, letterSpacing: 1 },

  incItemBlock: { paddingHorizontal: 16, paddingVertical: 10 },
  incCatLabel: { color: C.textLight, fontSize: 7, letterSpacing: 2, marginBottom: 10 },
  incRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  incNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.greenLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  incNumText: { color: C.greenDark, fontSize: 7, fontWeight: 600 },
  excNum: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.redLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  excNumText: { color: C.red, fontSize: 7, fontWeight: 600 },
  incItemText: { flex: 1, color: C.textMid, fontSize: 10, lineHeight: 1.5 },

  // ── INVESTMENT PAGE ──
  investSub: { color: C.gold, fontSize: 8, letterSpacing: 3, marginBottom: 8 },
  investTitle: { color: C.white, fontSize: 22, fontWeight: 600, marginBottom: 24 },

  investCard: { backgroundColor: '#252A22', borderRadius: 6, padding: 16, marginBottom: 12 },
  investCardLabel: {
    color: C.gold,
    fontSize: 7,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 10,
  },
  investRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  investRowTitle: { color: C.white, fontSize: 11, fontWeight: 600 },
  investRowDesc: { color: '#7A8072', fontSize: 9 },
  investRowPrice: { color: C.green, fontSize: 11, fontWeight: 600 },
  investRowPriceRed: { color: '#F87171', fontSize: 11, fontWeight: 600 },
  investRowPriceAmber: { color: '#FBBF24', fontSize: 11, fontWeight: 600 },

  investDivider: { height: 1, backgroundColor: '#3A4035', marginVertical: 8 },

  investGrandCard: { backgroundColor: C.gold, borderRadius: 6, padding: 20, marginTop: 8 },
  investGrandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  investGrandLabel: {
    color: C.dark,
    fontSize: 8,
    letterSpacing: 2,
    fontWeight: 600,
    marginBottom: 6,
  },
  investGrandValue: { color: C.dark, fontSize: 26, fontWeight: 600 },
  investPerPerson: { color: C.dark, fontSize: 10, fontWeight: 600, opacity: 0.7 },

  // ── TERMS PAGE ──
  termsSection: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderStyle: 'solid',
    borderRadius: 6,
    marginBottom: 16,
    overflow: 'hidden',
  },
  termsSectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.beigeLight,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    borderBottomStyle: 'solid',
  },
  termsSectionTitle: { color: C.textDark, fontSize: 12, fontWeight: 600 },
  termsItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F1E6',
    borderBottomStyle: 'solid',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termsItemNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.beige,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  termsItemNumText: { color: C.textMid, fontSize: 7, fontWeight: 600 },
  termsItemText: { flex: 1, color: C.textMid, fontSize: 9, lineHeight: 1.6 },
});

import { CustomActivity, QuotePDFProps, money } from '../QuotePDFTemplate';

// ── Page Footer Component ──
const PageFooter = ({
  pageNum,
  totalPages,
  dark = false,
}: {
  pageNum: number;
  totalPages: number;
  dark?: boolean;
}) => (
  <View style={[s.footer, dark ? s.footerDark : {}]} fixed>
    <Text style={[s.footerText, dark ? s.footerTextDark : {}]}>
      MooNs · Curated Travel Experiences
    </Text>
    <Text
      style={s.footerPage}
    >{`${String(pageNum).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`}</Text>
  </View>
);

export const TemplateV12 = ({
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
  const quoteRef = `MN-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const crewSize = '2';
  const pace = 'Active';

  return (
    <Document>
      {/* ═══════════════════════════════════════════
          PAGE 1: COVER
          ═══════════════════════════════════════════ */}
      <Page size="A4" style={s.pageBeige}>
        <View style={s.coverDark}>
          {/* Corner Accent */}
          <View
            style={[s.cornerAccent, { top: 20, right: 20, borderTopWidth: 2, borderRightWidth: 2 }]}
          />

          {/* Logo */}
          <View style={s.logoRow}>
            <View style={s.logoMark}>
              <Text style={s.logoLetter}>M</Text>
            </View>
            <Text style={s.logoText}>MooNs</Text>
          </View>

          {/* Prepared For */}
          <Text style={s.preparedLabel}>EXPEDITION PREPARED FOR</Text>
          <Text style={s.preparedName}>{leadName || 'Guest'}</Text>

          {/* Gold accent line */}
          <View style={[s.accentLineH, { width: 50, marginBottom: 20 }]} />

          {/* Title & Description */}
          <Text style={s.mainTitle}>{packageName || 'Custom Expedition'}</Text>
          <Text style={s.mainDesc}>
            {leadNotes ||
              `A field-guide style plan with ridge viewpoints, active transfers, and recovery time balanced into a premium adventure quote for ${leadDestination || 'your destination'}.`}
          </Text>

          {/* Meta Grid */}
          <View style={s.metaGrid}>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>ROUTE</Text>
              <Text style={s.metaValue}>{leadDestination || 'Open'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>DURATION</Text>
              <Text style={s.metaValue}>{packageDuration || 'TBD'}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>CREW</Text>
              <Text style={s.metaValue}>{crewSize}</Text>
            </View>
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>PACE</Text>
              <Text style={s.metaValue}>{pace}</Text>
            </View>
          </View>
        </View>

        <View style={s.coverBeige}>
          {/* Corner Accent */}
          <View
            style={[
              s.cornerAccent,
              { bottom: 20, left: 20, borderBottomWidth: 2, borderLeftWidth: 2 },
            ]}
          />

          <View style={s.permitCard}>
            <View style={s.permitHeader}>
              <Text style={s.permitTitle}>EXPEDITION PERMIT</Text>
              <View style={s.permitRefBadge}>
                <Text style={s.permitRefText}>REF: {quoteRef}</Text>
              </View>
            </View>

            <View style={s.permitRow}>
              <View>
                <Text style={s.permitLabel}>PER ADULT (EST)</Text>
                <Text style={s.permitValueSm}>{money(finalPrice / 2)}</Text>
              </View>
            </View>

            <View style={s.permitDivider} />

            <View style={s.permitRow}>
              <View>
                <Text style={s.permitLabel}>GRAND TOTAL</Text>
                <Text style={s.permitValueLg}>{money(finalPrice)}</Text>
              </View>
              <View style={s.accentDot} />
            </View>
          </View>
        </View>

        <PageFooter pageNum={1} totalPages={totalPages} />
      </Page>

      {/* ═══════════════════════════════════════════
          PAGE 2: ROUTE LOG / ITINERARY
          ═══════════════════════════════════════════ */}
      {itinerary.length > 0 ? (
        <Page size="A4" style={s.pageBeige}>
          <View style={s.routeBanner}>
            <Text style={s.routeBannerSub}>ROUTE LOG</Text>
            <Text style={s.routeBannerTitle}>Expedition Checkpoints</Text>
          </View>

          <View style={{ paddingTop: 16, paddingBottom: 60 }}>
            {itinerary.map((day) => {
              const dayActivities = activities.filter((a) => a.dayNumber === day.day_number);
              return (
                <View key={day.day_number} style={s.checkCard} wrap={false}>
                  <View style={s.checkHeader}>
                    <View style={s.checkTags}>
                      <View style={s.checkBadge}>
                        <Text
                          style={s.checkBadgeText}
                        >{`CHECKPOINT ${String(day.day_number).padStart(2, '0')}`}</Text>
                      </View>
                      <Text style={s.checkDayText}>{`Day ${day.day_number}`}</Text>
                    </View>

                    <Text style={s.checkTitle}>{day.title}</Text>

                    <View style={s.checkIntensity}>
                      <Text style={s.checkIntensityText}>INTENSITY: ACTIVE</Text>
                    </View>

                    <Text style={s.checkDesc}>
                      {day.description || 'Enjoy your day at leisure.'}
                    </Text>

                    <View style={s.checkMeta}>
                      <Text style={s.checkMetaText}>✓ Included in base package</Text>
                    </View>
                  </View>

                  {dayActivities.length > 0 ? (
                    <View style={s.checkActivityArea}>
                      {dayActivities.map((act) => (
                        <View key={act.id} style={{ marginBottom: 8 }}>
                          <View style={s.activityTag}>
                            <Text style={s.activityTagText}>ADD-ON EXPERIENCE</Text>
                          </View>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <Text style={s.activityName}>{act.name}</Text>
                            <Text style={s.activityPrice}>{money(act.price)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <PageFooter pageNum={2} totalPages={totalPages} />
        </Page>
      ) : null}

      {/* ═══════════════════════════════════════════
          PAGE 2.5: ACCOMMODATIONS & TRANSFERS
          ═══════════════════════════════════════════ */}
      {hasStaysOrCars ? (
        <Page size="A4" style={s.pageBeige}>
          <View style={[s.pad, { paddingBottom: 60 }]}>
            <Text style={s.incPageSub}>STAYS & LOGISTICS</Text>
            <Text style={s.incPageTitle}>Accommodations & Transfers</Text>

            <View style={[s.accentLineH, { width: 40, marginBottom: 20 }]} />

            {stays && stays.length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={s.incCatLabel}>PREMIUM ACCOMMODATIONS</Text>
                {stays.map((stay) => (
                  <View key={stay.id} style={s.incCard}>
                    <View style={s.incCardHeader}>
                      <Text style={s.incCardTitle}>{stay.name}</Text>
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
                <Text style={s.incCatLabel}>LOGISTICS & CARS</Text>
                {transfers.map((tf) => (
                  <View key={tf.id} style={s.incCard}>
                    <View style={s.incCardHeader}>
                      <Text style={s.incCardTitle}>{tf.serviceType}</Text>
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

          <PageFooter pageNum={3} totalPages={totalPages} />
        </Page>
      ) : null}

      {/* ═══════════════════════════════════════════
          PAGE 3: INCLUSIONS & EXCLUSIONS
          ═══════════════════════════════════════════ */}
      <Page size="A4" style={s.pageBeige}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.incPageSub}>EXPEDITION KIT</Text>
          <Text style={s.incPageTitle}>What's Included & Excluded</Text>

          <View style={[s.accentLineH, { width: 40, marginBottom: 20 }]} />

          {inclusions.length > 0 ? (
            <View style={s.incCard}>
              <View style={s.incCardHeader}>
                <Text style={s.incCardTitle}>Inclusions</Text>
                <View style={s.incBadge}>
                  <Text style={s.incBadgeText}>INCLUDED</Text>
                </View>
              </View>

              <View style={s.incItemBlock}>
                <Text style={s.incCatLabel}>BASECAMP ARRIVAL & CORE PACKAGE</Text>
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
              <View style={s.incCardHeader}>
                <Text style={s.incCardTitle}>Exclusions</Text>
                <View style={s.excBadge}>
                  <Text style={s.excBadgeText}>NOT INCLUDED</Text>
                </View>
              </View>

              <View style={s.incItemBlock}>
                <Text style={s.incCatLabel}>PERSONAL & ADDITIONAL EXPENSES</Text>
                {exclusions.slice(0, 15).map((exc, i) => (
                  <View key={i} style={s.incRow}>
                    <View style={s.excNum}>
                      <Text style={s.excNumText}>{i + 1}</Text>
                    </View>
                    <Text style={s.incItemText}>{exc.item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <PageFooter pageNum={hasStaysOrCars ? 4 : 3} totalPages={totalPages} />
      </Page>

      {/* ═══════════════════════════════════════════
          PAGE 4: INVESTMENT BREAKDOWN
          ═══════════════════════════════════════════ */}
      <Page size="A4" style={s.pageDark}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.investSub}>EXPEDITION INVESTMENT</Text>
          <Text style={s.investTitle}>Your Adventure Cost Breakdown</Text>

          <View style={[s.accentLineH, { width: 40, marginBottom: 20 }]} />

          {/* Base Package */}
          <View style={s.investCard}>
            <Text style={s.investCardLabel}>BASE PACKAGE</Text>
            <View style={s.investRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.investRowTitle}>{packageName || 'Core Package'}</Text>
                <Text style={s.investRowDesc}>All-inclusive base experience</Text>
              </View>
              <Text style={s.investRowPrice}>{money(basePrice)}</Text>
            </View>
          </View>

          {/* Activities */}
          {activitiesCost > 0 ? (
            <View style={s.investCard}>
              <Text style={s.investCardLabel}>ADD-ON EXPERIENCES</Text>
              {activities.map((act) => (
                <View key={act.id}>
                  <View style={s.investRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.investRowTitle}>{act.name}</Text>
                      <Text style={s.investRowDesc}>Day {act.dayNumber} · Curated experience</Text>
                    </View>
                    <Text style={s.investRowPrice}>{money(act.price)}</Text>
                  </View>
                  <View style={s.investDivider} />
                </View>
              ))}
              <View style={s.investRow}>
                <Text style={[s.investRowTitle, { fontSize: 10 }]}>Activities Subtotal</Text>
                <Text style={s.investRowPrice}>{money(activitiesCost)}</Text>
              </View>
            </View>
          ) : null}

          {/* Adjustments */}
          {discountAmount > 0 || taxAmount > 0 ? (
            <View style={s.investCard}>
              <Text style={s.investCardLabel}>ADJUSTMENTS</Text>

              {discountAmount > 0 ? (
                <View>
                  <View style={s.investRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.investRowTitle}>Agency Discount</Text>
                      <Text style={s.investRowDesc}>Applied to subtotal</Text>
                    </View>
                    <Text style={s.investRowPriceRed}>- {money(discountAmount)}</Text>
                  </View>
                  <View style={s.investDivider} />
                </View>
              ) : null}

              {taxAmount > 0 ? (
                <View style={s.investRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.investRowTitle}>Taxes & Statutory Fees</Text>
                    <Text style={s.investRowDesc}>GST @ 5%</Text>
                  </View>
                  <Text style={s.investRowPriceAmber}>+ {money(taxAmount)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Grand Total */}
          <View style={s.investGrandCard}>
            <View style={s.investGrandRow}>
              <View>
                <Text style={s.investGrandLabel}>GRAND TOTAL</Text>
                <Text style={s.investGrandValue}>{money(finalPrice)}</Text>
              </View>
              <View>
                <Text style={s.investPerPerson}>Per person: {money(finalPrice / 2)}</Text>
              </View>
            </View>
          </View>
        </View>

        <PageFooter pageNum={hasStaysOrCars ? 5 : 4} totalPages={totalPages} dark />
      </Page>

      {/* ═══════════════════════════════════════════
          PAGE 5: TRAIL RULES (TERMS & CONDITIONS)
          ═══════════════════════════════════════════ */}
      <Page size="A4" style={s.pageBeige}>
        <View style={[s.pad, { paddingBottom: 60 }]}>
          <Text style={s.incPageSub}>IMPORTANT</Text>
          <Text style={s.incPageTitle}>Trail Rules & Policies</Text>

          <View style={[s.accentLineH, { width: 40, marginBottom: 20 }]} />

          {/* Cancellation Policy */}
          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>Cancellation Policy</Text>
            </View>
            {[
              '30+ days before departure: Full refund minus a service fee of INR 3,000 per person.',
              '15–29 days before departure: 50% of total package cost will be charged.',
              '7–14 days before departure: 75% of total package cost will be charged.',
              'Less than 7 days before departure or no-show: 100% cancellation fee applies.',
            ].map((text, i) => (
              <View key={i} style={s.termsItem}>
                <View style={s.termsItemNum}>
                  <Text style={s.termsItemNumText}>{i + 1}</Text>
                </View>
                <Text style={s.termsItemText}>{text}</Text>
              </View>
            ))}
          </View>

          {/* Payment Terms */}
          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>Payment Terms</Text>
            </View>
            {[
              'A non-refundable booking deposit of 30% is required to confirm your reservation.',
              'Balance payment is due 15 days before the departure date.',
              'All payments to be made via bank transfer or UPI. Credit card payments attract a 2% surcharge.',
              'Prices are subject to change due to currency fluctuations until final payment is received.',
            ].map((text, i) => (
              <View key={i} style={s.termsItem}>
                <View style={s.termsItemNum}>
                  <Text style={s.termsItemNumText}>{i + 1}</Text>
                </View>
                <Text style={s.termsItemText}>{text}</Text>
              </View>
            ))}
          </View>

          {/* General Terms */}
          <View style={s.termsSection}>
            <View style={s.termsSectionHeader}>
              <Text style={s.termsSectionTitle}>General Terms</Text>
            </View>
            {[
              'Packages include only the services specifically mentioned in the itinerary. Any services not mentioned are excluded.',
              'All prices are calculated based on twin or triple-sharing accommodations unless stated otherwise.',
              'MooNs reserves the right to alter itineraries due to weather, political conditions, or force majeure.',
              'Valid passport with minimum 6-month validity and necessary visas are the responsibility of the traveler.',
            ].map((text, i) => (
              <View key={i} style={s.termsItem}>
                <View style={s.termsItemNum}>
                  <Text style={s.termsItemNumText}>{i + 1}</Text>
                </View>
                <Text style={s.termsItemText}>{text}</Text>
              </View>
            ))}
          </View>

          {/* Contact */}
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <View style={[s.accentLineH, { width: 30, marginBottom: 8 }]} />
            <Text style={{ fontSize: 8, color: C.textMuted, letterSpacing: 1 }}>
              QUESTIONS? REACH OUT TO YOUR MOON EXPEDITION SPECIALIST
            </Text>
          </View>
        </View>

        <PageFooter pageNum={hasStaysOrCars ? 6 : 5} totalPages={totalPages} />
      </Page>
    </Document>
  );
};
