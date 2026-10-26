import { prisma } from '../config/prisma.js';
import { AppError, asyncHandler, created, ok } from '../utils/response.js';
import { logAudit } from '../services/audit.service.js';

export const expenses = {
  /**
   * List expenses with category and date filters.
   */
  list: asyncHandler(async (req, res) => {
    const { category, startDate, endDate, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where = {};
    if (category) where.category = category;
    if (startDate && endDate) {
      where.expenseDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }
    if (search) {
      where.OR = [
        { expenseNumber: { contains: String(search).trim() } },
        { description: { contains: String(search).trim() } },
        { payee: { contains: String(search).trim() } }
      ];
    }

    const [rows, total, totalAmountAgg] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where
      })
    ]);

    ok(res, {
      items: rows,
      total,
      totalAmount: Number(totalAmountAgg._sum.amount || 0),
      page: pageNum,
      limit: limitNum
    }, 'Expenses fetched');
  }),

  /**
   * Record a new operating expense.
   */
  create: asyncHandler(async (req, res) => {
    const {
      category,
      description,
      amount,
      paymentMethod = 'CASH',
      status = 'PAID',
      payee,
      reference,
      expenseDate,
      notes,
      receiptUrl
    } = req.body;

    const numAmount = Number(amount);
    if (!description || String(description).trim().length < 2) {
      throw new AppError('Valid expense description is required', 422);
    }
    if (!numAmount || numAmount <= 0) {
      throw new AppError('Expense amount must be greater than 0', 422);
    }

    const validCategories = [
      'DELIVERY_FUEL',
      'PACKAGING',
      'TRANSPORT_FREIGHT',
      'RENT',
      'UTILITIES',
      'MAINTENANCE',
      'MARKETING',
      'WASTAGE_EXPIRY',
      'OTHER'
    ];

    if (!validCategories.includes(category)) {
      throw new AppError(`Invalid expense category. Choose from: ${validCategories.join(', ')}`, 422);
    }

    const count = await prisma.expense.count();
    const expenseNumber = `EXP-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const newExpense = await prisma.expense.create({
      data: {
        expenseNumber,
        category,
        description: String(description).trim(),
        amount: numAmount,
        paymentMethod,
        status,
        payee: payee ? String(payee).trim() : null,
        reference: reference ? String(reference).trim() : null,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        notes: notes ? String(notes).trim() : null,
        receiptUrl: receiptUrl || null,
        createdById: req.user?.id || null,
        createdByName: req.user?.name || 'Admin'
      }
    });

    logAudit(req, {
      module: 'EXPENSES',
      action: 'EXPENSE_RECORDED',
      resourceId: newExpense.id,
      resourceName: newExpense.expenseNumber,
      details: {
        category,
        amount: numAmount,
        description: newExpense.description
      }
    });

    created(res, newExpense, 'Operating expense recorded successfully');
  }),

  /**
   * Update an expense record.
   */
  update: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { category, description, amount, paymentMethod, status, payee, reference, notes, expenseDate } = req.body;

    const current = await prisma.expense.findUnique({ where: { id } });
    if (!current) throw new AppError('Expense record not found', 404);

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(category ? { category } : {}),
        ...(description ? { description: String(description).trim() } : {}),
        ...(amount !== undefined ? { amount: Number(amount) } : {}),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(status ? { status } : {}),
        ...(payee !== undefined ? { payee: payee ? String(payee).trim() : null } : {}),
        ...(reference !== undefined ? { reference: reference ? String(reference).trim() : null } : {}),
        ...(notes !== undefined ? { notes: notes ? String(notes).trim() : null } : {}),
        ...(expenseDate ? { expenseDate: new Date(expenseDate) } : {})
      }
    });

    logAudit(req, {
      module: 'EXPENSES',
      action: 'EXPENSE_UPDATED',
      resourceId: updated.id,
      resourceName: updated.expenseNumber,
      details: { updatedFields: req.body }
    });

    ok(res, updated, 'Expense updated successfully');
  }),

  /**
   * Delete an expense entry.
   */
  remove: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const current = await prisma.expense.findUnique({ where: { id } });
    if (!current) throw new AppError('Expense record not found', 404);

    await prisma.expense.delete({ where: { id } });

    logAudit(req, {
      module: 'EXPENSES',
      action: 'EXPENSE_DELETED',
      resourceId: current.id,
      resourceName: current.expenseNumber,
      details: { amount: current.amount, category: current.category }
    });

    ok(res, null, 'Expense deleted successfully');
  })
};
