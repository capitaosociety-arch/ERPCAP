'use server'

import { prisma } from "../../lib/prisma";

export async function getRevenueData(filter: 'day' | 'week' | 'month' | 'year') {
  const now = new Date();
  const startDate = new Date();
  
  if (filter === 'day') {
    startDate.setHours(0, 0, 0, 0);
  } else if (filter === 'week') {
    startDate.setDate(now.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
  } else if (filter === 'month') {
    startDate.setMonth(now.getMonth() - 1);
  } else if (filter === 'year') {
    startDate.setFullYear(now.getFullYear() - 1);
  }

  const orders = await prisma.order.findMany({
    where: {
      openedAt: { gte: startDate },
      status: "CLOSED"
    },
    select: { total: true, discount: true, openedAt: true }
  });

  const grouped: Record<string, number> = {};

  orders.forEach(order => {
    let key = '';
    const date = new Date(order.openedAt);
    
    if (filter === 'day') {
      key = `${String(date.getHours()).padStart(2, '0')}h`;
    } else if (filter === 'week' || filter === 'month') {
      // YYYY-MM-DD para organizar cronologicamente e ajudar a agrupar perfeitamente
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    } else if (filter === 'year') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    const netTotal = order.total - (order.discount || 0);
    grouped[key] = (grouped[key] || 0) + netTotal;
  });

  const chartData = Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => {
        let label = key;
        if (filter === 'week' || filter === 'month') {
            const parts = key.split('-');
            label = `${parts[2]}/${parts[1]}`;
        } else if (filter === 'year') {
            const parts = key.split('-');
            label = `${parts[1]}/${parts[0]}`;
        }
        return { label, value };
    });

  return chartData;
}

export async function getTopProducts() {
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { status: "CLOSED" }
    },
    select: {
      quantity: true,
      product: {
        select: { name: true }
      }
    }
  });

  const totals: Record<string, number> = {};

  orderItems.forEach(item => {
    if (item.product) {
      totals[item.product.name] = (totals[item.product.name] || 0) + item.quantity;
    }
  });

  const topProducts = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));

  return topProducts;
}
