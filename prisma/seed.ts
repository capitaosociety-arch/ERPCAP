import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando o Seed do Banco de Dados...');

  // 1. Limpar banco de dados
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cashRegister.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.service.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.table.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  // 2. Criar Usuários (Admin, Gerente, Caixa, Garçom)
  const passwordHash = await bcrypt.hash('senha123', 10);
  
  const admin = await prisma.user.create({
    data: { name: 'João Admin', email: 'admin@mrts.com', password: passwordHash, role: 'ADMIN' }
  });
  const manager = await prisma.user.create({
    data: { name: 'Ana Gerente', email: 'gerente@mrts.com', password: passwordHash, role: 'MANAGER' }
  });
  const cashier = await prisma.user.create({
    data: { name: 'Carlos Caixa', email: 'caixa@mrts.com', password: passwordHash, role: 'CASHIER' }
  });
  const waiter = await prisma.user.create({
    data: { name: 'Lucas Garçom', email: 'garcom@mrts.com', password: passwordHash, role: 'WAITER' }
  });

  // 3. Criar Mesas (10 mesas)
  for (let i = 1; i <= 10; i++) {
    await prisma.table.create({
      data: { number: i, capacity: i % 2 === 0 ? 4 : 2, status: 'LIVRE' }
    });
  }

  // 4. Clientes Fictícios
  const customer1 = await prisma.customer.create({
    data: { name: 'Cliente Frequente 1', phone: '11999999999' }
  });
  const customer2 = await prisma.customer.create({
    data: { name: 'Cliente Eventual 2', phone: '11888888888' }
  });

  // 5. Categorias de Produtos
  const catBebidas = await prisma.productCategory.create({ data: { name: 'Bebidas' }});
  const catPetiscos = await prisma.productCategory.create({ data: { name: 'Petiscos' }});
  const catPratos = await prisma.productCategory.create({ data: { name: 'Pratos Principais' }});

  // 6. Produtos (15)
  const productsData = [
    { name: 'Cerveja Pilsen', price: 12.0, cost: 5.0, iconUrl: '🍺', categoryId: catBebidas.id },
    { name: 'Cerveja IPA', price: 18.0, cost: 7.0, iconUrl: '🍺', categoryId: catBebidas.id },
    { name: 'Gin Tônica', price: 28.0, cost: 8.0, iconUrl: '🍹', categoryId: catBebidas.id },
    { name: 'Caipirinha Limão', price: 20.0, cost: 4.0, iconUrl: '🍸', categoryId: catBebidas.id },
    { name: 'Suco Laranja', price: 10.0, cost: 2.0, iconUrl: '🧃', categoryId: catBebidas.id },
    { name: 'Água s/ Gás', price: 5.0, cost: 1.0, iconUrl: '💧', categoryId: catBebidas.id },
    
    { name: 'Batata Frita', price: 25.0, cost: 8.0, iconUrl: '🍟', categoryId: catPetiscos.id },
    { name: 'Isca de Frango', price: 35.0, cost: 12.0, iconUrl: '🍗', categoryId: catPetiscos.id },
    { name: 'Tábua de Frios', price: 65.0, cost: 25.0, iconUrl: '🧀', categoryId: catPetiscos.id },
    { name: 'Bolinho de Bacalhau', price: 42.0, cost: 15.0, iconUrl: '🐟', categoryId: catPetiscos.id },
    { name: 'Nachos com Cheddar', price: 38.0, cost: 10.0, iconUrl: '🌮', categoryId: catPetiscos.id },

    { name: 'Hambúrguer Clássico', price: 32.0, cost: 12.0, iconUrl: '🍔', categoryId: catPratos.id },
    { name: 'Pizza Nível 1', price: 55.0, cost: 20.0, iconUrl: '🍕', categoryId: catPratos.id },
    { name: 'Risoto de Funghi', price: 48.0, cost: 18.0, iconUrl: '🍲', categoryId: catPratos.id },
    { name: 'Filé Mignon c/ Fritas', price: 75.0, cost: 30.0, iconUrl: '🥩', categoryId: catPratos.id },
  ];

  const dbProducts = await Promise.all(productsData.map(p => prisma.product.create({ data: p })));

  // Criar estoque para produtos
  for (const prod of dbProducts) {
    await prisma.stock.create({
      data: { productId: prod.id, quantity: 100, minQuantity: 10 }
    });
  }

  // 7. Serviços (6)
  const servicesData = [
    { name: 'Couvert Artístico', category: 'Taxas', price: 15.0 },
    { name: 'Taxa de Rolha', category: 'Taxas', price: 50.0 },
    { name: 'Reserva VIP (Mesa)', category: 'Reservas', price: 100.0 },
    { name: 'Locação de Espaço', category: 'Eventos', price: 500.0 },
    { name: 'Manutenção Padrão', category: 'Serviços Gerais', price: 120.0 },
    { name: 'Degustação Premium', category: 'Experiência', price: 200.0 },
  ];
  await Promise.all(servicesData.map(s => prisma.service.create({ data: s })));

  // 8. Criar Caixa Aberto e 1 Venda
  const cashRegister = await prisma.cashRegister.create({
    data: { userId: cashier.id, status: 'OPEN', openingBal: 200.0 }
  });

  const order = await prisma.order.create({
    data: {
      userId: waiter.id,
      status: 'OPEN', // Comanda aberta
      total: 37.0,
      items: {
        create: [
          { productId: dbProducts[0].id, quantity: 1, unitPrice: 12.0, subtotal: 12.0 },
          { productId: dbProducts[6].id, quantity: 1, unitPrice: 25.0, subtotal: 25.0 }
        ]
      }
    }
  });

  console.log('✅ Seed finalizado com sucesso!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
