import React from 'react';
import { Page, Text, View, Document, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { 
    padding: 30, 
    fontSize: 10, 
    fontFamily: 'Helvetica', 
    lineHeight: 1.4 
  },
  centered: { textAlign: 'center', marginBottom: 10 },
  h1: { fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' },
  h2: { fontSize: 10, marginBottom: 5 },
  bold: { fontFamily: 'Helvetica-Bold', fontWeight: 'bold' },
  sectionHeader: { 
    marginTop: 10, 
    marginBottom: 4, 
    fontFamily: 'Helvetica-Bold', 
    fontWeight: 'bold', 
    fontSize: 10,
    backgroundColor: '#f0f0f0',
    padding: 2
  },
  text: { marginBottom: 6, textAlign: 'justify' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginLeft: 10, marginBottom: 5 },
  checkbox: { 
    width: 10, 
    height: 10, 
    borderWidth: 1, 
    borderColor: '#000', 
    marginRight: 6 
  },
  flexText: { flex: 1 },
  label: { width: 130, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  boldLabel: { width: 130, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  inputLine: { 
    flex: 1, 
    borderBottomWidth: 1, 
    borderBottomColor: '#000', 
    height: 12,
    marginLeft: 5,
    fontSize: 10
  },
  initialsRow: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    marginTop: 2, 
    marginBottom: 8 
  },
  bulletList: { marginLeft: 15, marginBottom: 5 },
  bulletItem: { marginBottom: 2 },
  signatureSection: { 
    marginTop: 15, 
    borderTopWidth: 1, 
    borderTopColor: '#000', 
    paddingTop: 10 
  }
});

export const BankAuthDoc = ({ clientName }) => (
  <Document>
    <Page style={styles.page}>
      {/* Header */}
      <View style={styles.centered}>
        <Text style={styles.h1}>LT STUDENT CREDIT SCH</Text>
        <Text style={styles.h2}>Operating as: LT Outsourcing Solutions, LLC - The Token Society ™™</Text>
        <Text style={[styles.h1, { marginTop: 5, textDecoration: 'underline' }]}>ACH PAYMENT & BILLING AUTHORIZATION AGREEMENT</Text>
      </View>

      <Text style={styles.text}>
        This ACH Payment & Billing Authorization ("Authorization") is entered into by and between <Text style={styles.bold}>LT Student Credit SCH</Text>, operating as <Text style={styles.bold}>LT Outsourcing Solutions, LLC - The Token Society ™™</Text> ("Company"), and the undersigned business entity or individual ("Client").
      </Text>

      {/* 1. Company Info */}
      <Text style={styles.sectionHeader}>1. Company / Payee Information</Text>
      <View style={styles.row}><Text style={styles.boldLabel}>Legal Payee Name:</Text><Text>LT Student Credit SCH</Text></View>
      <View style={styles.row}><Text style={styles.boldLabel}>DBA:</Text><Text>LT Outsourcing Solutions, LLC - The Token Society ™™</Text></View>
      <Text style={styles.text}>Client acknowledges and agrees that all ACH debits will appear as LT Student Credit SCH or a substantially similar identifier.</Text>

      {/* 2. Setup Fee */}
      <Text style={styles.sectionHeader}>2. Initial Enrollment & Setup Fee Acknowledgment</Text>
      <Text style={styles.text}>Client acknowledges and agrees to the following one-time setup fee structure:</Text>
      <View style={styles.row}>
        <View style={styles.checkbox} />
        <Text style={styles.flexText}>I understand and agree that an initial setup fee of $1,500 is required to activate services.</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.checkbox} />
        <Text style={styles.flexText}>I understand that the $25,000 tier includes/waives the $1,500 setup fee.</Text>
      </View>
      <View style={styles.initialsRow}><Text>Client Initials: _______</Text></View>

      {/* 3. Monthly Fee */}
      <Text style={styles.sectionHeader}>3. Monthly Service Fee Selection</Text>
      <Text style={styles.text}>Client authorizes recurring monthly ACH debits based on the selected service level:</Text>
      <View style={styles.grid}>
        <View style={styles.row}><View style={styles.checkbox} /><Text> $2,500/month</Text></View>
        <View style={styles.row}><View style={styles.checkbox} /><Text> $5,000/month</Text></View>
        <View style={styles.row}><View style={styles.checkbox} /><Text> $12,500/month</Text></View>
        <View style={styles.row}><View style={styles.checkbox} /><Text> $25,000/month</Text></View>
      </View>
      <View style={styles.initialsRow}><Text>Client Initials: _______</Text></View>

      {/* 4. Billing Cycle */}
      <Text style={styles.sectionHeader}>4. Billing Cycle & Draft Date Authorization</Text>
      <Text style={styles.text}>Client authorizes recurring ACH withdrawals according to the selected billing date:</Text>
      <View style={styles.grid}>
        <View style={styles.row}><View style={styles.checkbox} /><Text> 1st of month</Text></View>
        <View style={styles.row}><View style={styles.checkbox} /><Text> 15th of month</Text></View>
        <View style={styles.row}><View style={styles.checkbox} /><Text> 25th of month</Text></View>
      </View>
      <Text style={styles.text}>Billing will begin on the next agreed billing cycle following setup completion.</Text>
      <View style={styles.initialsRow}><Text>Client Initials: _______</Text></View>

      {/* 5. Proration */}
      <Text style={styles.sectionHeader}>5. Proration Acknowledgment (If Applicable)</Text>
      <View style={styles.row}>
        <View style={styles.checkbox} />
        <Text style={styles.flexText}>Client acknowledges that services requested prior to the standard cycle may be prorated.</Text>
      </View>
      <View style={styles.initialsRow}><Text>Client Initials: _______</Text></View>

      {/* 6. Bank Info */}
      <Text style={styles.sectionHeader}>6. ACH Authorization & Bank Information</Text>
      <Text style={styles.text}>Client hereby authorizes LT Student Credit SCH to initiate ACH debit transactions.</Text>
      <View style={{ marginBottom: 5 }}>
        <View style={styles.row}><Text style={styles.label}>Bank Name:</Text><View style={styles.inputLine} /></View>
        <View style={styles.row}><Text style={styles.label}>Account Holder:</Text><View style={styles.inputLine}><Text>{clientName}</Text></View></View>
        <View style={styles.row}><Text style={styles.label}>Routing Number:</Text><View style={styles.inputLine} /></View>
        <View style={styles.row}><Text style={styles.label}>Account Number:</Text><View style={styles.inputLine} /></View>
        <View style={styles.row}>
            <Text style={styles.label}>Account Type:</Text>
            <View style={styles.row}><View style={styles.checkbox} /><Text> Checking</Text></View>
            <View style={[styles.row, {marginLeft: 20}]}><View style={styles.checkbox} /><Text> Savings</Text></View>
        </View>
      </View>
      <View style={styles.initialsRow}><Text>Client Initials: _______</Text></View>

      {/* 7. Scope */}
      <Text style={styles.sectionHeader}>7. Authorization Scope</Text>
      <View style={styles.bulletList}>
        <Text style={styles.bulletItem}>• Permits recurring ACH withdrawals.</Text>
        <Text style={styles.bulletItem}>• ACH payments are not subject to credit card chargeback protections.</Text>
        <Text style={styles.bulletItem}>• Billing disputes must be in writing.</Text>
      </View>
      <View style={styles.initialsRow}><Text>Client Initials: _______</Text></View>

      {/* 8 & 9 combined for space */}
      <Text style={styles.sectionHeader}>8. Revocation & 9. Electronic Signature</Text>
      <Text style={styles.text}>Authorization remains in effect until revoked in writing (10 business days notice). Electronic signatures carry the same legal force as wet signatures.</Text>

      {/* Signature */}
      <View style={styles.signatureSection}>
        <Text style={[styles.bold, {marginBottom: 10}]}>Client Acknowledgment & Signature</Text>
        <Text style={styles.text}>By signing below, Client confirms they have read, understood, and agreed to all terms.</Text>
        
        <View style={styles.row}><Text style={styles.label}>Client / Business:</Text><View style={styles.inputLine} /></View>
        <View style={styles.row}><Text style={styles.label}>Authorized Signer:</Text><View style={styles.inputLine}><Text>{clientName}</Text></View></View>
        <View style={styles.row}><Text style={styles.label}>Signature:</Text><View style={styles.inputLine} /></View>
        <View style={styles.row}><Text style={styles.label}>Date:</Text><View style={styles.inputLine}><Text>{new Date().toLocaleDateString()}</Text></View></View>

        <View style={{marginTop: 15}}>
            <Text style={[styles.bold, {fontSize: 9}]}>Company Acceptance:</Text>
            <Text style={[styles.bold, {fontSize: 10}]}>LT Student Credit SCH</Text>
            <Text style={{fontSize: 9}}>Operating as LT Outsourcing Solutions, LLC - The Token Society ™™</Text>
        </View>
      </View>
    </Page>
  </Document>
);