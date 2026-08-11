import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },
  header: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  subHeader: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  text: {
    marginBottom: 10,
    textAlign: 'justify',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
  },
  list: {
    marginLeft: 20,
    marginBottom: 10,
  },
  listItem: {
    marginBottom: 3,
  },
  sectionTitle: {
    marginTop: 15,
    marginBottom: 5,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textDecoration: 'underline',
  },
  signatureBlock: {
    marginTop: 30,
    borderTop: '1px solid #000',
    paddingTop: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    width: 150,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
  },
  value: {
    flex: 1,
    borderBottom: '1px solid #000',
    paddingLeft: 5,
    minHeight: 15,
  },
  footer: {
    marginTop: 30,
    fontSize: 10,
  }
});

export const LPOADoc = ({ clientName }) => (
  <Document>
    <Page style={styles.page}>
      <Text style={styles.header}>LIMITED POWER OF ATTORNEY</Text>
      <Text style={styles.subHeader}>(Administrative Authorization)</Text>

      <Text style={styles.text}>
        This Limited Power of Attorney ("LPOA") is made by the undersigned business entity or
        individual ("Principal") in favor of <Text style={styles.bold}>LT Student Credit Sch, including its operating divisions and programs, including LT Outsourcing Solutions, LLC, operating as The Token Society ™™ ("Agent").</Text>
      </Text>

      <Text style={styles.sectionTitle}>1. Grant of Limited Authority</Text>
      <Text style={styles.text}>
        Principal hereby grants Agent a limited power of attorney solely for the purpose of
        performing administrative and clerical communications on Principal's behalf, as
        directed by Principal, in connection with backend support services.
      </Text>
      <Text style={styles.text}>This limited authority may include, but is not limited to:</Text>
      <View style={styles.list}>
        <Text style={styles.listItem}>• Communicating with credit bureaus, creditors, data furnishers, and related third parties</Text>
        <Text style={styles.listItem}>• Submitting, tracking, and following up on administrative correspondence</Text>
        <Text style={styles.listItem}>• Requesting verification, clarification, or status updates</Text>
        <Text style={styles.listItem}>• Managing documentation and records related to such communications</Text>
      </View>

      <Text style={styles.sectionTitle}>2. Scope Limitation</Text>
      <Text style={styles.text}>
        This Limited Power of Attorney is strictly limited to administrative support functions.
        Agent is not authorized to:
      </Text>
      <View style={styles.list}>
        <Text style={styles.listItem}>• Provide legal advice</Text>
        <Text style={styles.listItem}>• Provide financial advice</Text>
        <Text style={styles.listItem}>• Make financial decisions on Principal's behalf</Text>
        <Text style={styles.listItem}>• Enter contracts on Principal's behalf</Text>
        <Text style={styles.listItem}>• Guarantee outcomes, deletions, approvals, or results</Text>
        <Text style={styles.listItem}>• Represent itself as Principal for any purpose other than administrative communication</Text>
      </View>
      <Text style={styles.text}>
        Principal retains full control and responsibility over all business decisions and representations.
      </Text>

      <Text style={styles.sectionTitle}>3. No Guarantee of Results</Text>
      <Text style={styles.text}>
        Principal acknowledges that administrative communications may not result in specific
        outcomes and that Agent makes no guarantees regarding responses, decisions,
        deletions, approvals, or timelines.
      </Text>

      <Text style={styles.sectionTitle}>4. Term & Revocation</Text>
      <Text style={styles.text}>
        This Limited Power of Attorney shall become effective on the date of execution and
        shall remain in effect for twelve (12) months, unless revoked earlier in writing by
        Principal. Revocation shall not affect actions taken prior to receipt of written notice.
      </Text>

      <Text style={styles.sectionTitle}>5. Relationship of the Parties</Text>
      <Text style={styles.text}>
        Nothing in this LPOA shall be construed to create a partnership, joint venture, fiduciary
        relationship, or agency beyond the limited administrative authority expressly granted
        herein.
      </Text>

      <Text style={styles.sectionTitle}>6. Governing Law</Text>
      <Text style={styles.text}>
        This Limited Power of Attorney shall be governed by and construed in accordance with
        the laws of the state in which <Text style={styles.bold}>LT Student Credit Sch</Text> is registered.
      </Text>

      <Text style={styles.sectionTitle}>7. Electronic Execution</Text>
      <Text style={styles.text}>
        This Limited Power of Attorney may be executed electronically. An electronic signature
        shall have the same force and effect as an original signature.
      </Text>

      <View style={styles.signatureBlock}>
        <Text style={{ marginBottom: 10, fontFamily: 'Helvetica-Bold', fontWeight: 'bold' }}>Principal Acknowledgment</Text>
        <Text style={styles.text}>
          By signing below, Principal confirms that they have read, understood, and voluntarily
          granted this Limited Power of Attorney.
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Principal Name (Printed):</Text>
          <Text style={styles.value}>{clientName}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Principal Signature:</Text>
          <Text style={styles.value}></Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Company Name:</Text>
          <Text style={styles.value}></Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Date:</Text>
          <Text style={styles.value}>{new Date().toLocaleDateString()}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontWeight: 'bold', marginBottom: 4 }}>Agent</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontWeight: 'bold' }}>LT Student Credit Sch</Text>
          <Text style={{ marginTop: 2 }}>Including its operating division:</Text>
          <Text>LT Outsourcing Solutions, LLC</Text>
          <Text>Operating as The Token Society ™™</Text>
          <Text style={{ marginTop: 8, fontFamily: 'Helvetica-Bold', fontWeight: 'bold' }}>Authorized Representative: LaToyia Turner</Text>
        </View>
      </View>
    </Page>
  </Document>
);