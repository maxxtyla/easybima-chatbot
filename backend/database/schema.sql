-- EasyBima Chatbot Database Schema
-- CIC Insurance Group

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations table: Stores chat history
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(64) NOT NULL UNIQUE,
    messages JSONB NOT NULL DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast session lookups
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);

-- Messages table: Detailed message log (optional, for analytics)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(64) NOT NULL REFERENCES conversations(session_id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- FAQ/Knowledge Base table: For quick policy lookups
CREATE TABLE IF NOT EXISTS faq_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(100) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    keywords TEXT[] DEFAULT '{}',
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faq_category ON faq_entries(category);
CREATE INDEX IF NOT EXISTS idx_faq_keywords ON faq_entries USING GIN(keywords);

-- Policy products reference table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subsidiary VARCHAR(100) NOT NULL, -- 'General', 'Life', 'Asset Management'
    category VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    key_features JSONB DEFAULT '[]',
    eligibility TEXT,
    documents_required JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_subsidiary ON products(subsidiary);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100),
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    opening_hours JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_branches_city ON branches(city);

-- Chat analytics table
CREATE TABLE IF NOT EXISTS chat_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'message_sent', 'escalation_requested', 'error_occurred'
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_session ON chat_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON chat_analytics(event_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_faq_updated_at ON faq_entries;
CREATE TRIGGER update_faq_updated_at
    BEFORE UPDATE ON faq_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- EASYBIMA MOTOR INSURANCE FAQ ENTRIES

INSERT INTO faq_entries (category, question, answer, keywords, priority) VALUES

('EasyBima', 'What is EasyBima motor insurance?',
'EasyBima is a monthly motor insurance cover from CIC General Insurance. It enables customers to pay for motor vehicle insurance through flexible monthly installments of up to 12 equal monthly payments, easing financial burden while providing comprehensive coverage.',
ARRAY['easybima', 'monthly', 'motor insurance', 'installments', 'flexible payment'], 10),

('EasyBima', 'Why should I choose EasyBima?',
'EasyBima offers flexible monthly payment plans up to 12 months, 24/7 online access for quotes and purchases, ability to buy through preferred agents or brokers, easy online policy management, MPESA payments, and free vehicle valuation at policy inception.',
ARRAY['benefits', 'easybima', 'advantages', 'monthly payments', 'online'], 9),

('EasyBima', 'How do I access EasyBima?',
'EasyBima is accessible online through https://easybima.cic.co.ke where customers can get quotes, purchase cover, and manage policies.',
ARRAY['access', 'website', 'easybima', 'online portal'], 8),

('EasyBima', 'Who is eligible to buy EasyBima cover?',
'Any customer who owns a private motor vehicle is eligible to buy EasyBima motor insurance cover.',
ARRAY['eligibility', 'private vehicle', 'owner', 'qualify'], 8),

('EasyBima', 'What does EasyBima comprehensive cover include?',
'EasyBima comprehensive cover includes accidental damage, malicious damage, theft, fire, third-party liabilities, riot strike and civil commotion, floods, and legal liabilities to third parties arising from property damage, injuries, or death.',
ARRAY['coverage', 'comprehensive', 'damage', 'theft', 'fire', 'third party'], 10),

('EasyBima', 'What free benefits come with EasyBima?',
'Free benefits include excess protector for own damage, political violence and terrorism cover, windscreen cover up to Kshs.50,000, car entertainment system cover up to Kshs.50,000, towing/recovery expenses up to Kshs.50,000, and emergency medical expenses up to Kshs.50,000.',
ARRAY['free benefits', 'windscreen', 'towing', 'medical', 'terrorism'], 9),

('EasyBima', 'What additional benefits are available at extra cost?',
'Additional optional benefits include courtesy car for up to 10 days, forced ATM withdrawal following carjacking up to Kshs.40,000, theft of accessories up to Kshs.15,000, loss of keys up to Kshs.20,000, theft/loss of spare wheel up to Kshs.30,000, out of station accommodation up to Kshs.20,000, and personal effects cover up to Kshs.20,000.',
ARRAY['optional benefits', 'courtesy car', 'carjacking', 'keys', 'accessories'], 8),

('EasyBima', 'What documents are required to onboard for EasyBima?',
'Required onboarding documents include copy of logbook or import documents for new vehicles, National ID, valid driving license, KRA PIN certificate, and for companies: Certificate of Incorporation and CR12 or equivalent registration documents.',
ARRAY['documents', 'requirements', 'logbook', 'ID', 'KRA PIN'], 10),

('EasyBima', 'What are the requirements for comprehensive cover?',
'To qualify for comprehensive cover, the vehicle must be less than 15 years old, have a minimum value of Kshs.500,000, be insured through 12 equal monthly installments, and undergo annual valuation.',
ARRAY['comprehensive', 'requirements', 'vehicle age', 'valuation'], 9),

('EasyBima', 'When does a vehicle fail to qualify for comprehensive cover?',
'A vehicle may fail to qualify if it is not roadworthy, has poor claims history, or if the proposer lacks insurable interest verified through the logbook.',
ARRAY['disqualification', 'roadworthy', 'claims history', 'ownership'], 8),

('EasyBima', 'Does CIC issue digital insurance certificates?',
'Yes. CIC issues digital motor insurance certificates which improve traceability, eliminate lost certificates, reduce fraud, prevent double insurance, allow easy reprints, and support real-time validation.',
ARRAY['digital certificate', 'insurance certificate', 'fraud prevention'], 9),

('EasyBima', 'Why is vehicle valuation important?',
'Vehicle valuation confirms the vehicle exists, verifies insurable condition, ensures proper value estimation for insurance purposes, and is provided free at policy inception.',
ARRAY['valuation', 'vehicle inspection', 'vehicle value'], 8),

('EasyBima', 'What happens after vehicle valuation?',
'After valuation, CIC may revise vehicle or accessory values. Increased values may require additional premium while decreased values result in policy endorsement reflecting lower values. Customers are also informed about any findings affecting coverage.',
ARRAY['post valuation', 'premium adjustment', 'vehicle value'], 8),

('EasyBima', 'How are policy documents delivered?',
'Policy documents are delivered electronically through the customer email address.',
ARRAY['policy delivery', 'email', 'documents'], 7),

('EasyBima', 'What factors affect renewal premiums?',
'Renewal premiums are affected by claims history and any new laws affecting insurance premiums.',
ARRAY['renewal', 'premium', 'claims history'], 7),

('EasyBima', 'When are renewal notices sent?',
'Renewal notices are sent at least 60 days before the renewal month. Notices go to intermediaries for broker-managed clients while direct clients receive email and SMS alerts.',
ARRAY['renewal notice', 'SMS alerts', 'email reminder'], 7),

('EasyBima', 'Are extra benefits reusable after claims?',
'Extra benefits such as windscreen, radio, and excess protector are one-time-use benefits. Once utilized, they cease until renewal unless reinstated through additional premium payment.',
ARRAY['windscreen', 'radio', 'excess protector', 'reuse'], 8),

('EasyBima', 'What is the No Blame No Excess clause?',
'The No Blame No Excess clause applies when the insured is not at fault for an accident, provided there is a clearly identified third party and a police abstract report clearly stating fault.',
ARRAY['no blame', 'no excess', 'police abstract'], 9),

('EasyBima', 'What is policy excess?',
'Policy excess is the initial amount paid by the insured before the insurer settles the remaining claim amount. It is usually calculated as a percentage of the insured vehicle value.',
ARRAY['policy excess', 'claim payment', 'deductible'], 8),

('EasyBima', 'What is excess protection cover?',
'Excess protection cover relieves the insured from paying excess for collision-related claims provided repair costs exceed the policy excess amount. Claims below the excess are not recoverable.',
ARRAY['excess protection', 'collision', 'repair costs'], 8),

('EasyBima', 'How do I cancel my EasyBima policy?',
'To cancel the policy, the insured must provide written cancellation instructions and formally request cancellation of the issued digital certificate.',
ARRAY['cancel policy', 'policy cancellation', 'written instructions'], 8),

('Claims', 'How do I submit a motor private claim?',
'To submit a motor private claim: 1) Visit https://ke.cicinsurancegroup.com/claims/, 2) Download and print the Motor Private Claim Form, 3) Fill the form and attach supporting documents, 4) Submit via claims@cic.co.ke or through your insurance agent.',
ARRAY['motor claim', 'claim form', 'claims email', 'submit claim'], 10),

('Support', 'How can I contact CIC customer support?',
'For support contact CIC customer care through email callc@cic.co.ke or call 0703 099 120 or +254 020 282 3000.',
ARRAY['support', 'customer care', 'contact', 'phone', 'email'], 10)

ON CONFLICT DO NOTHING;


-- EASYBIMA PRODUCT ENTRY


INSERT INTO products (
    subsidiary,
    category,
    name,
    description,
    key_features,
    eligibility
) VALUES (

    'General',
    'Motor',
    'EasyBima Monthly Motor Insurance',

    'EasyBima is a flexible monthly motor insurance product from CIC General Insurance that allows private vehicle owners to pay insurance premiums in up to 12 equal monthly installments while enjoying comprehensive motor insurance coverage.',

    '[
        "Flexible monthly installments up to 12 months",
        "24/7 online access and policy management",
        "Comprehensive motor insurance cover",
        "Free vehicle valuation at inception",
        "MPESA payment support",
        "Digital insurance certificate",
        "Windscreen cover up to Kshs.50,000",
        "Political violence and terrorism cover",
        "Emergency medical expenses cover",
        "Towing and recovery expenses cover"
    ]',

    'Private motor vehicle owners with valid identification, logbook ownership, valid driving license, and KRA PIN certificate'

)

ON CONFLICT DO NOTHING;


-- EASYBIMA DIGITAL PLATFORM ENTRY

INSERT INTO products (
    subsidiary,
    category,
    name,
    description,
    key_features,
    eligibility
) VALUES (

    'General',
    'Digital',
    'EasyBima Online Platform',

    'EasyBima online platform enables customers to get quotes, purchase insurance policies, manage policies digitally, make payments, and access insurance documents online.',

    '[
        "Online quotes and purchases",
        "Policy management dashboard",
        "Digital certificate issuance",
        "Mobile friendly access",
        "MPESA payment integration",
        "Claims support",
        "24/7 accessibility"
    ]',

    'Available to all CIC insurance customers'

)

ON CONFLICT DO NOTHING;
-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO easybima_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO easybima_user;