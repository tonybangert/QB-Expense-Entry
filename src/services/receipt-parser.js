// src/services/receipt-parser.js
// Receipt extraction using Claude API with Vision capabilities

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Load the extraction prompt template
const EXTRACTION_PROMPT = fs.readFileSync(
  path.join(__dirname, '../templates/extraction-prompt.md'),
  'utf-8'
);

/**
 * Parse a receipt image using Claude Vision
 *
 * @param {Buffer|string} imageInput - Image buffer or base64 string
 * @param {string} mimeType - Image MIME type (image/jpeg, image/png, application/pdf)
 * @param {Object} context - Optional context (email subject, sender, etc.)
 * @returns {Object} Structured receipt data with confidence scores
 */
async function parseReceipt(imageInput, mimeType = 'image/jpeg', context = {}) {
  // Convert buffer to base64 if needed
  const base64Image = Buffer.isBuffer(imageInput)
    ? imageInput.toString('base64')
    : imageInput;

  // Build context string from email metadata if available
  const contextHints = context.emailSubject
    ? `\n\nAdditional context from email:\n- Subject: ${context.emailSubject}\n- Sender: ${context.emailFrom || 'unknown'}\n- Date received: ${context.emailDate || 'unknown'}`
    : '';

  try {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: mimeType === 'application/pdf' ? 'document' : 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT + contextHints,
            },
          ],
        },
      ],
    });

    // Parse the structured JSON from Claude's response
    const responseText = response.content[0].text;
    const extracted = parseExtractionResponse(responseText);

    logger.info('Receipt parsed successfully', {
      vendor: extracted.vendor_name,
      total: extracted.total_amount,
      confidence: extracted.overall_confidence,
    });

    return extracted;
  } catch (error) {
    logger.error('Receipt parsing failed:', error);
    throw new Error(`Receipt parsing failed: ${error.message}`);
  }
}

/**
 * Parse Claude's response into structured data
 * Handles both clean JSON and JSON wrapped in markdown code blocks
 */
function parseExtractionResponse(responseText) {
  // Try to extract JSON from the response
  let jsonStr = responseText;

  // Remove markdown code fences if present
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const data = JSON.parse(jsonStr);

    // Validate required fields and add defaults
    return {
      vendor_name: data.vendor_name || 'Unknown Vendor',
      date: data.date || new Date().toISOString().split('T')[0],
      total_amount: parseFloat(data.total_amount) || 0,
      subtotal: parseFloat(data.subtotal) || null,
      tax_amount: parseFloat(data.tax_amount) || 0,
      tip_amount: parseFloat(data.tip_amount) || 0,
      payment_method: normalizePaymentMethod(data.payment_method),
      currency: data.currency || 'USD',
      line_items: (data.line_items || []).map(item => ({
        description: item.description || '',
        amount: parseFloat(item.amount) || 0,
        quantity: parseInt(item.quantity) || 1,
        category: item.category || 'Uncategorized',
      })),
      suggested_category: data.suggested_category || 'Other Expenses',
      description: data.description || '',
      overall_confidence: parseFloat(data.overall_confidence) || 0.5,
      field_confidence: data.field_confidence || {},
      notes: data.notes || '',
    };
  } catch (parseError) {
    logger.warn('Failed to parse extraction JSON, returning raw', { responseText });
    return {
      vendor_name: 'Parse Error — Manual Review Required',
      date: new Date().toISOString().split('T')[0],
      total_amount: 0,
      payment_method: 'unknown',
      line_items: [],
      suggested_category: 'Other Expenses',
      description: responseText.substring(0, 200),
      overall_confidence: 0.1,
      notes: 'AI extraction returned unparseable response. Manual entry required.',
    };
  }
}

/**
 * Normalize payment method strings to our standard values
 */
function normalizePaymentMethod(method) {
  if (!method) return 'unknown';
  const normalized = method.toLowerCase().replace(/[^a-z]/g, '');

  const mappings = {
    'cash': 'cash',
    'credit': 'credit_card',
    'creditcard': 'credit_card',
    'visa': 'credit_card',
    'mastercard': 'credit_card',
    'amex': 'credit_card',
    'americanexpress': 'credit_card',
    'debit': 'debit',
    'debitcard': 'debit',
    'check': 'check',
    'cheque': 'check',
    'applepay': 'credit_card',
    'googlepay': 'credit_card',
    'venmo': 'cash',
    'zelle': 'cash',
  };

  return mappings[normalized] || 'unknown';
}

/**
 * Parse a receipt from a PDF (multi-page support)
 */
async function parseReceiptPDF(pdfBuffer) {
  // Claude Vision can handle PDFs directly as document type
  return parseReceipt(pdfBuffer, 'application/pdf');
}

module.exports = { parseReceipt, parseReceiptPDF };
