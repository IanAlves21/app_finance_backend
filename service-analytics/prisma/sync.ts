import { Client } from 'pg';

/**
 * Reconciliação do banco do Analytics (réplica) a partir do banco do Transaction (fonte da verdade).
 *
 * Uso:
 *   # Simulação (padrão): só mostra as diferenças, não grava nada
 *   npx ts-node prisma/sync.ts
 *
 *   # Aplica as correções (upsert de tudo + remoção do que não existe mais na origem)
 *   npx ts-node prisma/sync.ts --apply
 *
 * Bancos (padrão: localhost do docker-compose). Para PROD, defina:
 *   SYNC_SOURCE_DATABASE_URL=postgresql://...service_transactions_db?sslmode=require
 *   SYNC_DEST_DATABASE_URL=postgresql://...service_analytics_db?sslmode=require
 */

const SOURCE_URL =
    process.env.SYNC_SOURCE_DATABASE_URL ||
    'postgresql://root:root@localhost:5432/service_transactions_db?schema=public';
const DEST_URL =
    process.env.SYNC_DEST_DATABASE_URL ||
    'postgresql://root:root@localhost:5432/service_analytics_db?schema=public';
const APPLY = process.argv.includes('--apply');

type Row = Record<string, any>;

interface TableSpec {
    table: string;
    label: string;
    columns: string[];
}

// Ordem de dependência (pais antes dos filhos) para o upsert.
// A remoção de órfãos acontece na ordem inversa (filhos antes dos pais).
const TABLES: TableSpec[] = [
    { table: 'FamilyGroup', label: 'Grupos Familiares', columns: ['id', 'name'] },
    { table: 'Category', label: 'Categorias', columns: ['id', 'name', 'type', 'icon', 'color', 'familyId'] },
    { table: 'User', label: 'Usuários', columns: ['id', 'name', 'email', 'avatarUrl', 'familyId'] },
    { table: 'Wallet', label: 'Carteiras', columns: ['id', 'name', 'balance', 'familyId'] },
    {
        table: 'Transaction',
        label: 'Transações',
        columns: [
            'id',
            'description',
            'note',
            'amount',
            'date',
            'type',
            'status',
            'paymentMethod',
            'categoryId',
            'walletId',
            'paidById',
            'familyId',
            'createdAt',
            'updatedAt',
        ],
    },
    {
        table: 'Budget',
        label: 'Orçamentos',
        columns: ['id', 'amount', 'month', 'year', 'categoryId', 'familyId', 'createdAt', 'updatedAt'],
    },
];

const q = (name: string) => `"${name}"`;

function maskUrl(url: string): string {
    return url.replace(/\/\/([^:/]+):[^@]*@/, '//$1:***@');
}

async function sync() {
    console.log(`🔄 Reconciliação do Analytics — modo: ${APPLY ? '✍️  APLICAR' : '👀 SIMULAÇÃO (use --apply para gravar)'}`);
    console.log(`   Origem:  ${maskUrl(SOURCE_URL)}`);
    console.log(`   Destino: ${maskUrl(DEST_URL)}\n`);

    const sourceClient = new Client({ connectionString: SOURCE_URL });
    const destClient = new Client({ connectionString: DEST_URL });

    await sourceClient.connect();
    await destClient.connect();

    try {
        // 1. Lê tudo e calcula as diferenças
        const sourceRows = new Map<string, Row[]>();
        const orphanIds = new Map<string, string[]>();

        for (const spec of TABLES) {
            const src = await sourceClient.query(`SELECT * FROM ${q(spec.table)}`);
            const dst = await destClient.query(`SELECT id FROM ${q(spec.table)}`);

            const srcIds = new Set(src.rows.map((r: Row) => r.id));
            const dstIds = new Set(dst.rows.map((r: Row) => r.id));

            const missing = src.rows.filter((r: Row) => !dstIds.has(r.id)).length;
            const orphans = dst.rows.map((r: Row) => r.id as string).filter((id) => !srcIds.has(id));

            sourceRows.set(spec.table, src.rows);
            orphanIds.set(spec.table, orphans);

            console.log(
                `${spec.label.padEnd(18)} origem: ${String(src.rows.length).padStart(5)} | destino: ${String(dst.rows.length).padStart(5)} | faltando no analytics: ${String(missing).padStart(4)} | sobrando no analytics: ${String(orphans.length).padStart(4)}`,
            );
        }

        if (!APPLY) {
            console.log('\nℹ️  Nada foi gravado. Rode com --apply para corrigir o destino.');
            return;
        }

        // 2. Aplica tudo numa única transação no destino
        await destClient.query('BEGIN');

        // 2a. Remove órfãos (filhos antes dos pais)
        for (const spec of [...TABLES].reverse()) {
            const ids = orphanIds.get(spec.table) || [];
            if (ids.length > 0) {
                await destClient.query(`DELETE FROM ${q(spec.table)} WHERE id = ANY($1::text[])`, [ids]);
            }
        }

        // 2b. Upsert de tudo da origem (pais antes dos filhos)
        for (const spec of TABLES) {
            const cols = spec.columns.map(q).join(', ');
            const params = spec.columns.map((_, i) => `$${i + 1}`).join(', ');
            const updates = spec.columns
                .filter((c) => c !== 'id')
                .map((c) => `${q(c)} = EXCLUDED.${q(c)}`)
                .join(', ');
            const sql = `INSERT INTO ${q(spec.table)} (${cols}) VALUES (${params}) ON CONFLICT (id) DO UPDATE SET ${updates}`;

            for (const row of sourceRows.get(spec.table) || []) {
                await destClient.query(
                    sql,
                    spec.columns.map((c) => row[c]),
                );
            }
        }

        await destClient.query('COMMIT');
        console.log('\n🎉 Reconciliação concluída! O Analytics agora reflete exatamente o Transaction.');
    } catch (error) {
        await destClient.query('ROLLBACK').catch(() => null);
        console.error('❌ Erro durante a reconciliação (nenhuma alteração foi gravada):', error);
        process.exitCode = 1;
    } finally {
        await sourceClient.end();
        await destClient.end();
    }
}

sync().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
