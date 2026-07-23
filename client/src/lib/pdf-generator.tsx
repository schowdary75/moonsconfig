import React from 'react';
import { Page, Text, View, Document, StyleSheet, renderToStream } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#10b981',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    color: '#0f172a',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 5,
  },
  section: {
    margin: 10,
    padding: 10,
  },
  label: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 15,
  },
  priceBox: {
    marginTop: 30,
    backgroundColor: '#ecfdf5',
    padding: 20,
    borderRadius: 8,
  },
  priceLabel: {
    fontSize: 12,
    color: '#047857',
  },
  priceValue: {
    fontSize: 28,
    color: '#065f46',
    fontWeight: 'bold',
    marginTop: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
});

const QuoteDocument = ({ quote }: { quote: any }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>MooN Travel Quote</Text>
        <Text style={styles.subtitle}>Prepared exclusively for you</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Destination</Text>
        <Text style={styles.value}>{quote.title.split(' Package for ')[0] || quote.title}</Text>

        <Text style={styles.label}>Prepared For</Text>
        <Text style={styles.value}>{quote.contact_name}</Text>

        <Text style={styles.label}>Email Address</Text>
        <Text style={styles.value}>{quote.contact_email || 'Not provided'}</Text>
      </View>

      <View style={styles.priceBox}>
        <Text style={styles.priceLabel}>Total Estimated Cost</Text>
        <Text style={styles.priceValue}>INR {Number(quote.value).toLocaleString()}</Text>
        <Text style={{ fontSize: 10, color: '#047857', marginTop: 5 }}>
          * Valid for 7 days. Subject to availability at time of booking.
        </Text>
      </View>

      <Text style={styles.footer}>
        Thank you for choosing MooN. We look forward to planning your dream vacation!
      </Text>
    </Page>
  </Document>
);

export async function generateQuotePdfStream(quote: any): Promise<NodeJS.ReadableStream> {
  return await renderToStream(<QuoteDocument quote={quote} />);
}
