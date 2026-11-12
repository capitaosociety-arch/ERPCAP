import { PrismaClient } from '@prisma/client';
import { invalidateOperationalCaches } from './intelligence-cache';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const CACHE_AFFECTING_MODELS = new Set([
  'Product', 'Stock', 'StockMovement', 'DepotStock', 'DepotMovement', 'TransferRequest',
  'Order', 'OrderItem', 'Payment', 'FinancialEntry', 'FinancialPeriodClose',
  'FinancialPeriodAudit', 'Rental', 'RentalOperatingHour', 'Customer', 'Subscription',
  'SubscriptionPayment', 'PriceHistory', 'CostCenter', 'CostAllocation', 'OperatingCostRule',
]);
const CACHE_MUTATIONS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

const base = globalForPrisma.prisma || new PrismaClient();

const extended = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        if (CACHE_AFFECTING_MODELS.has(model) && CACHE_MUTATIONS.has(operation)) {
          invalidateOperationalCaches();
        }
        return result;
      },
    },
  },
});

export const prisma = extended as unknown as PrismaClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
