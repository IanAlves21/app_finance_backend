import { Client } from 'pg';

async function sync() {
    console.log('🔄 Iniciando a Sincronização de Bancos via pg.Client...');

    const sourceClient = new Client({
        connectionString: 'postgresql://root:root@localhost:5432/service_transactions_db?schema=public'
    });

    const destClient = new Client({
        connectionString: 'postgresql://root:root@localhost:5432/service_analytics_db?schema=public'
    });

    await sourceClient.connect();
    await destClient.connect();

    try {
        // 1. Sincroniza FamilyGroup
        console.log('👥 Sincronizando Grupos Familiares...');
        const famRes = await sourceClient.query('SELECT * FROM "FamilyGroup"');
        for (const fam of famRes.rows) {
            await destClient.query(
                `INSERT INTO "FamilyGroup" (id, name) 
                 VALUES ($1, $2) 
                 ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
                [fam.id, fam.name]
            );
        }
        console.log(`✅ Sincronizados ${famRes.rows.length} Grupos Familiares.`);

        // 2. Sincroniza Category
        console.log('🏷️ Sincronizando Categorias...');
        const catRes = await sourceClient.query('SELECT * FROM "Category"');
        for (const cat of catRes.rows) {
            await destClient.query(
                `INSERT INTO "Category" (id, name, type, icon, color, "familyId") 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 ON CONFLICT (id) DO UPDATE SET 
                    name = EXCLUDED.name, 
                    type = EXCLUDED.type, 
                    icon = EXCLUDED.icon, 
                    color = EXCLUDED.color, 
                    "familyId" = EXCLUDED."familyId"`,
                [cat.id, cat.name, cat.type, cat.icon, cat.color, cat.familyId]
            );
        }
        console.log(`✅ Sincronizadas ${catRes.rows.length} Categorias.`);

        // 3. Sincroniza User
        console.log('👤 Sincronizando Usuários...');
        const userRes = await sourceClient.query('SELECT * FROM "User"');
        for (const u of userRes.rows) {
            await destClient.query(
                `INSERT INTO "User" (id, name, email, "avatarUrl", "familyId") 
                 VALUES ($1, $2, $3, $4, $5) 
                 ON CONFLICT (id) DO UPDATE SET 
                    name = EXCLUDED.name, 
                    email = EXCLUDED.email, 
                    "avatarUrl" = EXCLUDED."avatarUrl", 
                    "familyId" = EXCLUDED."familyId"`,
                [u.id, u.name, u.email, u.avatarUrl, u.familyId]
            );
        }
        console.log(`✅ Sincronizados ${userRes.rows.length} Usuários.`);

        // 4. Sincroniza Wallet
        console.log('💳 Sincronizando Carteiras...');
        const walletRes = await sourceClient.query('SELECT * FROM "Wallet"');
        for (const w of walletRes.rows) {
            await destClient.query(
                `INSERT INTO "Wallet" (id, name, balance, "familyId") 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (id) DO UPDATE SET 
                    name = EXCLUDED.name, 
                    balance = EXCLUDED.balance, 
                    "familyId" = EXCLUDED."familyId"`,
                [w.id, w.name, w.balance, w.familyId]
            );
        }
        console.log(`✅ Sincronizadas ${walletRes.rows.length} Carteiras.`);

        // 5. Sincroniza Transaction
        console.log('💰 Sincronizando Transações...');
        const txRes = await sourceClient.query('SELECT * FROM "Transaction"');
        for (const tx of txRes.rows) {
            await destClient.query(
                `INSERT INTO "Transaction" (id, description, note, amount, date, type, status, "paymentMethod", "categoryId", "walletId", "paidById", "familyId", "createdAt", "updatedAt") 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) 
                 ON CONFLICT (id) DO UPDATE SET 
                    description = EXCLUDED.description, 
                    note = EXCLUDED.note, 
                    amount = EXCLUDED.amount, 
                    date = EXCLUDED.date, 
                    type = EXCLUDED.type, 
                    status = EXCLUDED.status, 
                    "paymentMethod" = EXCLUDED."paymentMethod", 
                    "categoryId" = EXCLUDED."categoryId", 
                    "walletId" = EXCLUDED."walletId", 
                    "paidById" = EXCLUDED."paidById", 
                    "familyId" = EXCLUDED."familyId", 
                    "createdAt" = EXCLUDED."createdAt", 
                    "updatedAt" = EXCLUDED."updatedAt"`,
                [
                    tx.id,
                    tx.description,
                    tx.note,
                    tx.amount,
                    tx.date,
                    tx.type,
                    tx.status,
                    tx.paymentMethod,
                    tx.categoryId,
                    tx.walletId,
                    tx.paidById,
                    tx.familyId,
                    tx.createdAt,
                    tx.updatedAt
                ]
            );
        }
        console.log(`✅ Sincronizadas ${txRes.rows.length} Transações.`);

        // 6. Sincroniza Budget
        console.log('📊 Sincronizando Limites de Orçamento (Budgets)...');
        const budgetRes = await sourceClient.query('SELECT * FROM "Budget"');
        for (const b of budgetRes.rows) {
            await destClient.query(
                `INSERT INTO "Budget" (id, amount, month, year, "categoryId", "familyId", "createdAt", "updatedAt") 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                 ON CONFLICT (id) DO UPDATE SET 
                    amount = EXCLUDED.amount, 
                    month = EXCLUDED.month, 
                    year = EXCLUDED.year, 
                    "categoryId" = EXCLUDED."categoryId", 
                    "familyId" = EXCLUDED."familyId", 
                    "createdAt" = EXCLUDED."createdAt", 
                    "updatedAt" = EXCLUDED."updatedAt"`,
                [b.id, b.amount, b.month, b.year, b.categoryId, b.familyId, b.createdAt, b.updatedAt]
            );
        }
        console.log(`✅ Sincronizados ${budgetRes.rows.length} Limites de Orçamento.`);

        console.log('🎉 Sincronização Concluída com Sucesso! Ambos os bancos estão perfeitamente sincronizados.');
    } catch (error) {
        console.error('❌ Erro durante a sincronização:', error);
    } finally {
        await sourceClient.end();
        await destClient.end();
    }
}

sync().catch(console.error);
