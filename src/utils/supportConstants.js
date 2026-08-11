export const CALLER_TYPES = ['Current Client', 'Partner', 'New Client', 'Potential Client', 'Returning Lead'];

// 2. Give them both the same routing categories
export const CATEGORIES = {
  'Current Client': ['Status Update', 'Payment / Billing', 'Missing Documents', 'Portal / Login', 'Complaint / Concern'],
  'Partner': ['Submitted Client Status', 'Pricing / Override', 'Account Help', 'Complaint / Concern'],
  
  'New Client': ['Service Inquiry', 'Pricing', 'Ready to Start', 'Returning Missed Call'],
  'Potential Client': ['Service Inquiry', 'Pricing', 'Ready to Start', 'Returning Missed Call'],
  
  'Returning Lead': ['Service Inquiry', 'Pricing', 'Ready to Start']
};

export const SUB_ISSUES = {
  'Status Update': ['I submitted all my documents', 'What is my current status?'],
  'Payment / Billing': ['I have a payment question'],
  'Missing Documents': ['I submitted all my documents'],
  'Portal / Login': ['I need portal help / cannot log in'],
  'Service Inquiry': ['What services do you offer?', 'How do I get started?'],
  'Pricing': ['How much does it cost?'],
  'Submitted Client Status': ['Partner asking status on submitted client'],
  'Pricing / Override': ['Partner asking pricing or override'],
  'Complaint / Concern': ['Caller wants a live person or callback'],
  'Ready to Start': ['How do I get started?']
};

export const REQUIRED_CHECKS = {
  'What services do you offer?': [
    'Capture caller Name',
    'Capture caller Phone & Email',
    'Check if they are calling for themselves or referred by Partner'
  ],
  'How do I get started?': [
    'Capture caller Name, Phone, and Email',
    'Identify if retail client or partner-referred'
  ],
  'How much does it cost?': [
    'Identify if retail client or partner-referred',
    'Check current approved pricing tier'
  ],
  'What is my current status?': [
    'Open client account',
    'Check current account stage',
    'Check latest admin note'
  ],
  'I submitted all my documents': [
    'Open client account',
    'Confirm payment is received/active',
    'Confirm ALL required documents are uploaded',
    'Confirm documents are marked valid (not rejected/blurry)',
    'Check current account stage',
    'Check latest admin note'
  ],
  'I need portal help / cannot log in': [
    'Open client account',
    'Verify client email matches file',
    'Check if portal welcome email was sent'
  ],
  'I have a payment question': [
    'Open client account',
    'Check Stripe/Billing tab for latest invoice',
    'Verify if payment failed or is pending'
  ],
  'Partner asking status on submitted client': [
    'Verify partner name/company',
    'Open partner profile',
    'Open the relevant client case',
    'Check notes and current stage'
  ],
  'Partner asking pricing or override': [
    'Verify partner tier in database',
    'Check volume of clients submitted',
    'Determine if exception is pre-approved by management'
  ],
  'Caller wants a live person or callback': [
    'Can issue be solved right now?',
    'Does it require management judgment or pricing exception?',
    'Is caller upset?',
    'Is there conflicting info in notes?'
  ]
};

export const SCRIPTS_AND_ACTIONS = {
  'What services do you offer?': {
    confidence: 'green',
    script: `"Hidden Partner Cloud is a software-based platform that helps organize the next steps in your file by guiding account setup, document collection, and account review workflow."\n\nNext question to ask: "Have you already completed an application, or are you just looking for information today?"`,
    actions: ['Send Application Link', 'Schedule Onboarding Call', 'Create Lead Record']
  },
  'How do I get started?': {
    confidence: 'green',
    script: `"I can help you get started right now. I will send you the secure application link to your email and phone number. Once you fill that out, it will guide you through creating your portal."`,
    actions: ['Send Application Link', 'Schedule Onboarding Call']
  },
  'How much does it cost?': {
    confidence: 'yellow',
    script: `"Pricing depends on the service path and whether you are coming in as an individual client or through a partner. I can explain the applicable option based on your situation."\n\n(Do not freestyle pricing. Only read the approved tier based on their referral source).`,
    actions: ['Send Payment Link', 'Send Application Link', 'Escalate to Sales']
  },
  'What is my current status?': {
    confidence: 'green',
    script: `"Thank you for your patience. Your account is currently in the [Stage]. The next step is [Next Step]. You’ll be notified as the account moves forward."`,
    actions: ['Send Status Update Email', 'Confirm Next Stage']
  },
  'I submitted all my documents': {
    confidence: 'green', 
    script: `If documents are COMPLETE:\n"Thank you. I do see that your documents have been received. Your account is currently in the [Stage]."\n\nIf documents are MISSING/REJECTED:\n"I do see that some documents were received, but we’re still missing [Document]. Once that is uploaded, your account can continue forward. I can send that upload link to you right now."`,
    actions: ['Send Upload Link', 'Confirm Next Stage', 'Escalate (Notes Conflict)']
  },
  'I need portal help / cannot log in': {
    confidence: 'green',
    script: `"I can help with that. I am sending a password reset link to the email we have on file: [Read Email]. Please click that link to reset your password and access your dashboard."`,
    actions: ['Send Password Reset', 'Resend Welcome Email']
  },
  'I have a payment question': {
    confidence: 'yellow',
    script: `"I have your billing profile pulled up. I see your last invoice was [Status]."\n\n(Answer specific billing question based on Stripe data).`,
    actions: ['Send Invoice Link', 'Update Payment Method', 'Escalate to Billing']
  },
  'Partner asking status on submitted client': {
    confidence: 'green',
    script: `"I have [Client Name]'s file pulled up. They are currently in the [Stage] stage. We are currently waiting on [Missing Item / Processing Time]."`,
    actions: ['Send Status Update', 'Request Client Docs']
  },
  'Partner asking pricing or override': {
    confidence: 'red',
    script: `"Partner pricing is determined by your current volume tier. Let me review your profile and get this routed to your partner success manager to see what overrides are available."`,
    actions: ['Schedule Partner Callback', 'Escalate to Management']
  },
  'Caller wants a live person or callback': {
    confidence: 'red',
    script: `"I want to make sure you’re routed to the right person to handle this immediately. Let me get this documented properly and get you scheduled for the right follow-up."`,
    actions: ['Schedule Callback', 'Escalate to Supervisor', 'Live Transfer']
  }
};