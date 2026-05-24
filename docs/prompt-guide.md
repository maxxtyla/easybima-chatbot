# EasyBima Prompt Engineering Guide

## System Prompt Structure

The system prompt (`backend/prompts/systemPrompt.js`) is the foundation of Bima's knowledge and personality.

## Key Sections

### 1. Company Identity
- CIC history, mission, vision, values
- Financial strength indicators
- Awards and recognition

### 2. Product Knowledge
Detailed information about:
- CIC General Insurance products
- CIC Life Assurance products
- CIC Asset Management products
- Other ventures (Pharmacy, Real Estate, Foundation)

### 3. Personality & Tone
- Friendly, professional Kenyan assistant
- Use of Swahili expressions naturally
- Simple language, explain jargon
- Cooperative spirit

### 4. Escalation Rules
When to hand off to human agents:
- Explicit requests for human help
- Complex claims disputes
- Legal/regulatory questions
- Angry/frustrated users
- Personalized financial advice

### 5. Constraints
- Never provide specific premium amounts
- Never promise claim approvals
- Never share internal staff details
- Always offer human escalation for complex issues

## Updating the Prompt

### Adding New Products
1. Add product details to the Products section
2. Include key features, eligibility, benefits
3. Add to FAQ entries in database
4. Test with sample queries

### Modifying Tone
- Adjust personality section
- Add/remove Swahili expressions
- Change response structure guidelines

### Adding Escalation Triggers
- Update `checkEscalationTriggers()` in claudeService.js
- Add keywords to the escalation list
- Test with edge cases

## Best Practices

1. **Be Specific**: Include exact product names, branch addresses, contact numbers
2. **Stay Current**: Update with latest CIC information
3. **Test Thoroughly**: Verify responses for accuracy
4. **Monitor Hallucinations**: Claude may invent details not in prompt
5. **Version Control**: Track prompt changes with git

## Testing Prompts

```bash
# Test specific queries
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Easy Bima?"}'

# Verify product accuracy
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about Family Medisure"}'

# Test escalation
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "I want to speak to a manager"}'
```

## Prompt Versioning

Track changes:
```
v1.0.0 - Initial prompt with basic CIC info
v1.1.0 - Added Easy Bima details
v1.2.0 - Updated branch list
v1.3.0 - Added claims process details
```