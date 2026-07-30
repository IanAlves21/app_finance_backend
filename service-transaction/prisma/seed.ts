import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, TransactionType, TransactionStatus } from '@prisma/client';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Plantando sementes no banco de dados... 🌱');

    // Limpa dados anteriores para evitar duplicidades ao rodar a seed novamente
    await prisma.transaction.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.familyGroup.deleteMany({});

    // 1. Cria a Família
    const family = await prisma.familyGroup.create({
        data: { name: 'Lucas & Mariana' },
    });

    // 2. Cria os Usuários
    const user = await prisma.user.create({
        data: { id: '968ab5f5-8277-487f-8554-7571872b0fee', name: 'Lucas', email: 'lucas@teste.com', familyId: family.id },
    });

    // 3. Cria a Carteira Compartilhada
    const wallet = await prisma.wallet.create({
        data: { name: 'Shared Wallet Account', balance: 14500.00, familyId: family.id },
    });

    // 4. Cria as Categorias
    const shoppingCat = await prisma.category.create({
        data: { name: 'Compras', type: TransactionType.EXPENSE, icon: 'shopping-cart', color: '#8B5CF6', familyId: family.id },
    });
    const restaurantCat = await prisma.category.create({
        data: { name: 'Comida & Jantar', type: TransactionType.EXPENSE, icon: 'restaurant', color: '#F59E0B', familyId: family.id },
    });
    const transportCat = await prisma.category.create({
        data: { name: 'Transporte', type: TransactionType.EXPENSE, icon: 'directions-car', color: '#3B82F6', familyId: family.id },
    });
    const salaryCat = await prisma.category.create({
        data: { name: 'Freelance', type: TransactionType.INCOME, icon: 'briefcase', color: '#10B981', familyId: family.id },
    });

    // 5. Cria as Transações Históricas dos últimos 6 meses (Fevereiro a Julho de 2026)
    const transactionsData = [
        // --- Fevereiro 2026 ---
        {
            description: 'Salário de Fevereiro',
            amount: 4000.00,
            type: TransactionType.INCOME,
            date: new Date('2026-02-05T10:00:00.000Z'),
            categoryId: salaryCat.id,
        },
        {
            description: 'Supermercado Mensal',
            amount: 450.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-02-10T14:30:00.000Z'),
            categoryId: restaurantCat.id,
        },
        {
            description: 'Assinatura Netflix',
            amount: 55.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-02-15T08:00:00.000Z'),
            categoryId: shoppingCat.id,
        },

        // --- Março 2026 ---
        {
            description: 'Salário de Março',
            amount: 4000.00,
            type: TransactionType.INCOME,
            date: new Date('2026-03-05T10:00:00.000Z'),
            categoryId: salaryCat.id,
        },
        {
            description: 'Jantar Especial de Casal',
            amount: 220.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-03-12T20:00:00.000Z'),
            categoryId: restaurantCat.id,
        },
        {
            description: 'Combustível Carro',
            amount: 180.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-03-18T11:00:00.000Z'),
            categoryId: transportCat.id,
        },
        {
            description: 'Roupas Shopping',
            amount: 350.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-03-22T16:00:00.000Z'),
            categoryId: shoppingCat.id,
        },

        // --- Abril 2026 ---
        {
            description: 'Salário de Abril',
            amount: 4000.00,
            type: TransactionType.INCOME,
            date: new Date('2026-04-05T10:00:00.000Z'),
            categoryId: salaryCat.id,
        },
        {
            description: 'Uber Viagens Trabalho',
            amount: 90.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-04-08T09:00:00.000Z'),
            categoryId: transportCat.id,
        },
        {
            description: 'Feira Orgânica Semanal',
            amount: 320.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-04-15T10:30:00.000Z'),
            categoryId: restaurantCat.id,
        },
        {
            description: 'Jogo Playstation Store',
            amount: 150.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-04-20T22:15:00.000Z'),
            categoryId: shoppingCat.id,
        },

        // --- Maio 2026 ---
        {
            description: 'Salário de Maio',
            amount: 4000.00,
            type: TransactionType.INCOME,
            date: new Date('2026-05-05T10:00:00.000Z'),
            categoryId: salaryCat.id,
        },
        {
            description: 'Ifood Delivery Noite',
            amount: 120.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-05-10T21:00:00.000Z'),
            categoryId: restaurantCat.id,
        },
        {
            description: 'Revisão e Filtros do Carro',
            amount: 650.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-05-15T15:00:00.000Z'),
            categoryId: transportCat.id,
        },
        {
            description: 'Presente de Aniversário',
            amount: 250.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-05-25T14:00:00.000Z'),
            categoryId: shoppingCat.id,
        },

        // --- Junho 2026 ---
        {
            description: 'Salário de Junho',
            amount: 4500.00,
            type: TransactionType.INCOME,
            date: new Date('2026-06-05T10:00:00.000Z'),
            categoryId: salaryCat.id,
        },
        {
            description: 'Compras Eletrodomésticos',
            amount: 850.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-06-12T13:40:00.000Z'),
            categoryId: shoppingCat.id,
        },
        {
            description: 'Jantar Romântico dos Namorados',
            amount: 420.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-06-12T20:30:00.000Z'),
            categoryId: restaurantCat.id,
        },
        {
            description: 'Pedágio Viagem de Fim de Semana',
            amount: 80.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-06-21T09:15:00.000Z'),
            categoryId: transportCat.id,
        },

        // --- Julho 2026 (Mês Atual) ---
        {
            description: 'Pagamento de Freelance Premium',
            amount: 4500.00,
            type: TransactionType.INCOME,
            date: new Date('2026-07-05T12:00:00.000Z'),
            categoryId: salaryCat.id,
        },
        {
            description: 'Compras Target Store',
            amount: 1250.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-07-10T14:00:00.000Z'),
            categoryId: shoppingCat.id,
        },
        {
            description: 'Jantar Restaurante Francês',
            amount: 1120.50,
            type: TransactionType.EXPENSE,
            date: new Date('2026-07-15T21:00:00.000Z'),
            categoryId: restaurantCat.id,
        },
        {
            description: 'Gasolina e Estacionamentos',
            amount: 640.00,
            type: TransactionType.EXPENSE,
            date: new Date('2026-07-18T10:00:00.000Z'),
            categoryId: transportCat.id,
        },
        {
            description: 'Despesa Outras Categorias',
            amount: 407.50,
            type: TransactionType.EXPENSE,
            date: new Date('2026-07-22T16:00:00.000Z'),
            categoryId: shoppingCat.id,
        },
    ];

    // Insere todas as transações de semente
    for (const tx of transactionsData) {
        await prisma.transaction.create({
            data: {
                description: tx.description,
                amount: tx.amount,
                type: tx.type,
                date: tx.date,
                familyId: family.id,
                paidById: user.id,
                walletId: wallet.id,
                categoryId: tx.categoryId,
                status: TransactionStatus.COMPLETED,
            },
        });
    }

    console.log('Seed concluído com sucesso! Aqui estão os IDs gerados:');
    console.log({
        familyId: family.id,
        userId: user.id,
        walletId: wallet.id,
        categories: {
            salary: salaryCat.id,
            shopping: shoppingCat.id,
            restaurant: restaurantCat.id,
            transport: transportCat.id,
        },
        transactionsCount: transactionsData.length,
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
