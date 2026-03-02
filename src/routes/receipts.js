// src/routes/receipts.js
// Receipt upload and processing endpoints

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { parseReceipt, parseReceiptPDF } = require('../services/receipt-parser');
const qbService = require('../services/quickbooks');
const logger = require('../utils/logger');
const { saveReceipt, getReceipt, updateReceiptStatus, getPendingReceipts } = require('../db');
const { auditLog } = require('../middleware/audit-log');

// Configure multer for receipt uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../data/uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `receipt_${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'image/heic', 'application/pdf',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/receipts/upload
 * Upload a receipt image for AI extraction
 */
router.post('/upload', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No receipt file uploaded' });
  }

  try {
    const imageBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype;

    logger.info('Processing receipt upload', {
      filename: req.file.originalname,
      size: req.file.size,
      type: mimeType,
    });

    const extracted = mimeType === 'application/pdf'
      ? await parseReceiptPDF(imageBuffer)
      : await parseReceipt(imageBuffer, mimeType);

    const receiptId = `rcpt_${uuidv4()}`;
    const file = {
      original_name: req.file.originalname,
      stored_path: req.file.path,
      size: req.file.size,
    };
    const receipt = saveReceipt(receiptId, file, extracted);

    auditLog('receipt_uploaded', {
      receipt_id: receiptId,
      user_id: req.user.userId,
      username: req.user.username,
      filename: req.file.originalname,
    });

    res.json({
      receipt_id: receipt.id,
      status: receipt.status,
      file: {
        original_name: receipt.original_filename,
        size: receipt.file_size,
      },
      extraction: extracted,
      needs_review: extracted.overall_confidence < 0.85,
      actions: {
        approve: `POST /api/receipts/${receipt.id}/approve`,
        reject: `POST /api/receipts/${receipt.id}/reject`,
      },
    });
  } catch (error) {
    logger.error('Receipt processing failed:', error);
    res.status(500).json({
      error: 'Processing failed',
      message: error.message,
    });
  }
});

// Date format: YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/receipts/:id/approve
 * Approve extracted data and push to QuickBooks as an expense
 */
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const overrides = req.body;

  // Input validation on overrides
  if (overrides.date && !DATE_REGEX.test(overrides.date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  if (overrides.total_amount !== undefined) {
    const amt = parseFloat(overrides.total_amount);
    if (isNaN(amt) || amt < 0) {
      return res.status(400).json({ error: 'total_amount must be a non-negative number.' });
    }
  }

  try {
    const receipt = getReceipt(id);
    if (!receipt) {
      return res.status(404).json({ error: `Receipt ${id} not found` });
    }
    if (receipt.status !== 'extracted') {
      return res.status(400).json({ error: `Receipt already ${receipt.status}` });
    }

    const expenseData = {
      vendorName: overrides.vendor_name || receipt.vendor_name,
      date: overrides.date || receipt.date,
      totalAmount: overrides.total_amount != null ? parseFloat(overrides.total_amount) : receipt.total_amount,
      paymentMethod: overrides.payment_method || receipt.payment_method || 'cash',
      lineItems: overrides.line_items || receipt.line_items || [],
      description: overrides.description || receipt.description || '',
      suggestedCategory: overrides.suggested_category || receipt.suggested_category || '',
    };

    const purchase = await qbService.createExpense(expenseData);
    updateReceiptStatus(id, 'approved', { qb_purchase_id: purchase.Id });

    auditLog('receipt_approved', {
      receipt_id: id,
      user_id: req.user.userId,
      username: req.user.username,
      qb_purchase_id: purchase.Id,
    });

    res.json({
      success: true,
      receipt_id: id,
      quickbooks: {
        purchase_id: purchase.Id,
        total: purchase.TotalAmt,
        date: purchase.TxnDate,
      },
      message: 'Expense created in QuickBooks!',
    });
  } catch (error) {
    logger.error(`Failed to approve receipt ${id}:`, error);
    res.status(500).json({
      error: 'Failed to create expense in QuickBooks',
      message: error.message,
    });
  }
});

/**
 * POST /api/receipts/:id/reject
 * Reject a receipt
 */
router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const receipt = getReceipt(id);
  if (!receipt) {
    return res.status(404).json({ error: `Receipt ${id} not found` });
  }
  if (receipt.status !== 'extracted') {
    return res.status(400).json({ error: `Receipt already ${receipt.status}` });
  }

  updateReceiptStatus(id, 'rejected', { rejection_reason: reason });

  auditLog('receipt_rejected', {
    receipt_id: id,
    user_id: req.user.userId,
    username: req.user.username,
    reason: reason || 'No reason given',
  });

  res.json({
    success: true,
    receipt_id: id,
    status: 'rejected',
    reason: reason || 'No reason given',
  });
});

/**
 * GET /api/receipts/pending
 * List receipts awaiting review
 */
router.get('/pending', async (req, res) => {
  let limit = parseInt(req.query.limit) || 50;
  let offset = parseInt(req.query.offset) || 0;

  // Bound pagination values
  if (limit < 1) limit = 1;
  if (limit > 200) limit = 200;
  if (offset < 0) offset = 0;

  const { receipts, total } = getPendingReceipts({ limit, offset });
  res.json({ receipts, total });
});

module.exports = router;
