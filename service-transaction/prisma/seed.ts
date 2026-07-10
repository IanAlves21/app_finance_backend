import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, TransactionType } from '@prisma/client';
import { Pool } from 'pg';

// Configurando a conexão igual fizemos no NestJS
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Plantando sementes no banco de dados... 🌱');

    // 1. Cria a Família
    const family = await prisma.familyGroup.create({
        data: { name: 'Lucas & Mariana' },
    });

    // 2. Cria os Usuários
    const user = await prisma.user.create({
        data: { name: 'Lucas', email: 'lucas@teste.com', familyId: family.id },
    });

    // 3. Cria a Carteira Compartilhada
    const wallet = await prisma.wallet.create({
        data: { name: 'Shared Wallet Account', balance: 0, familyId: family.id },
    });

    // 4. Cria uma Categoria (Receita)
    const category = await prisma.category.create({
        data: { name: 'Freelance', type: TransactionType.INCOME, icon: 'briefcase' },
    });

    console.log('Seed concluído com sucesso! Aqui estão os IDs gerados:');
    console.log({
        familyId: family.id,
        userId: user.id,
        walletId: wallet.id,
        categoryId: category.id,
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
