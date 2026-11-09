import { Injectable, Inject, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
    constructor(
        private readonly prisma: PrismaService,
        @Inject('ANALYTICS_SERVICE') private readonly analyticsClient: ClientProxy,
    ) {}

    private async getOrCreateUser(userId: string, userEmail: string, userName?: string) {
        const decodedName = userName ? decodeURIComponent(userName) : 'Usuário';

        let user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            user = await this.prisma.user.findUnique({
                where: { email: userEmail },
            });
        }

        if (user) return user;

        let family;
        try {
            family = await this.prisma.familyGroup.create({
                data: { name: `${decodedName} & Família` },
            });

            user = await this.prisma.user.create({
                data: {
                    id: userId,
                    email: userEmail,
                    name: decodedName,
                    familyId: family.id,
                },
            });

            return user;
        } catch (error: any) {
            if (error?.code === 'P2002') {
                if (family?.id && typeof this.prisma.familyGroup.delete === 'function') {
                    await this.prisma.familyGroup.delete({ where: { id: family.id } }).catch(() => {});
                }

                let existingUser = await this.prisma.user.findUnique({
                    where: { id: userId },
                });
                if (!existingUser) {
                    existingUser = await this.prisma.user.findUnique({
                        where: { email: userEmail },
                    });
                }

                if (existingUser) {
                    return existingUser;
                }
            }
            throw error;
        }
    }

    async getGroupInfo(userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('Credenciais de usuário obrigatórias');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
        const familyId = dbUser.familyId;

        const family = await this.prisma.familyGroup.findUnique({
            where: { id: familyId },
            include: {
                users: true,
            },
        });

        if (!family) {
            throw new NotFoundException('Grupo familiar não encontrado');
        }

        return {
            familyId: family.id,
            name: family.name,
            members: family.users.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                avatarUrl: u.avatarUrl,
            })),
        };
    }

    async createInvite(userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('Credenciais de usuário obrigatórias');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
        const familyId = dbUser.familyId;

        // Limpa convites antigos expirados deste grupo para liberar espaço
        await this.prisma.invite.deleteMany({
            where: {
                familyId,
                expiresAt: { lt: new Date() },
            },
        }).catch(() => null);

        // Verifica se já existe um convite válido ativo para este grupo
        let invite = await this.prisma.invite.findFirst({
            where: {
                familyId,
                expiresAt: { gte: new Date() },
            },
        });

        if (!invite) {
            // Gera um código alfanumérico aleatório de 6 dígitos
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            let isUnique = false;

            while (!isUnique) {
                code = '';
                for (let i = 0; i < 6; i++) {
                    code += characters.charAt(Math.floor(Math.random() * characters.length));
                }
                const existing = await this.prisma.invite.findUnique({ where: { code } });
                if (!existing) {
                    isUnique = true;
                }
            }

            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24); // Expira em 24 horas

            invite = await this.prisma.invite.create({
                data: {
                    code,
                    familyId,
                    expiresAt,
                },
            });
        }

        return {
            code: invite.code,
            expiresAt: invite.expiresAt,
        };
    }

    async getInviteDetails(code: string) {
        const invite = await this.prisma.invite.findUnique({
            where: { code: code.toUpperCase() },
            include: {
                family: {
                    include: {
                        users: true,
                    },
                },
            },
        });

        if (!invite) {
            throw new NotFoundException('Convite inválido ou não encontrado');
        }

        if (invite.expiresAt < new Date()) {
            throw new BadRequestException('Este convite está expirado');
        }

        const owner = invite.family.users[0]; // Considera o primeiro usuário como criador
        return {
            code: invite.code,
            familyName: invite.family.name,
            ownerName: owner ? owner.name : 'Membro do app',
            expiresAt: invite.expiresAt,
        };
    }

    async acceptInvite(code: string, userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('Credenciais de usuário obrigatórias');
        }

        const invite = await this.prisma.invite.findUnique({
            where: { code: code.toUpperCase() },
        });

        if (!invite) {
            throw new NotFoundException('Convite inválido ou não encontrado');
        }

        if (invite.expiresAt < new Date()) {
            throw new BadRequestException('Este convite está expirado');
        }

        const targetFamilyId = invite.familyId;
        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
        const oldFamilyId = dbUser.familyId;

        // Se o usuário já está no grupo destino, não faz nada
        if (oldFamilyId === targetFamilyId) {
            return {
                success: true,
                message: 'Você já faz parte deste grupo familiar.',
                familyId: targetFamilyId,
            };
        }

        let walletMappings: Record<string, string> | null = null;
        let categoryMappings: Record<string, string> | null = null;
        let targetWallets: any[] = [];
        let targetCategories: any[] = [];

        const remainingUsers = await this.prisma.user.count({
            where: { familyId: oldFamilyId, NOT: { id: userId } },
        });

        if (remainingUsers === 0) {
            // Executa o merge em lote total usando transação interativa para evitar duplicidades de categorias/carteiras
            await this.prisma.$transaction(async (tx) => {
                // 1. Resolve Carteiras
                const oldWallets = await tx.wallet.findMany({ where: { familyId: oldFamilyId } });
                const walletMap = new Map<string, string>(); // oldWalletId -> targetWalletId

                for (const w of oldWallets) {
                    const targetWallet = await tx.wallet.findFirst({
                        where: { familyId: targetFamilyId, name: w.name },
                    });

                    if (targetWallet) {
                        walletMap.set(w.id, targetWallet.id);
                        // Atualiza as transações que usavam essa carteira antiga
                        await tx.transaction.updateMany({
                            where: { familyId: oldFamilyId, walletId: w.id },
                            data: { walletId: targetWallet.id },
                        });
                        // Deleta a carteira antiga duplicada
                        await tx.wallet.delete({ where: { id: w.id } });
                    } else {
                        // Não existe duplicada, apenas move de família
                        await tx.wallet.update({
                            where: { id: w.id },
                            data: { familyId: targetFamilyId },
                        });
                        walletMap.set(w.id, w.id);
                    }
                }

                // 2. Resolve Categorias
                const oldCategories = await tx.category.findMany({ where: { familyId: oldFamilyId } });
                const categoryMap = new Map<string, string>(); // oldCategoryId -> targetCategoryId

                for (const cat of oldCategories) {
                    const targetCategory = await tx.category.findFirst({
                        where: { familyId: targetFamilyId, name: cat.name, type: cat.type },
                    });

                    if (targetCategory) {
                        categoryMap.set(cat.id, targetCategory.id);
                        // Atualiza as transações que usavam essa categoria antiga
                        await tx.transaction.updateMany({
                            where: { familyId: oldFamilyId, categoryId: cat.id },
                            data: { categoryId: targetCategory.id },
                        });
                        // Deleta a categoria antiga duplicada
                        await tx.category.delete({ where: { id: cat.id } });
                    } else {
                        // Apenas move de família
                        await tx.category.update({
                            where: { id: cat.id },
                            data: { familyId: targetFamilyId },
                        });
                        categoryMap.set(cat.id, cat.id);
                    }
                }

                // 3. Resolve Budgets (para evitar conflito de chave única)
                const oldBudgets = await tx.budget.findMany({ where: { familyId: oldFamilyId } });
                for (const b of oldBudgets) {
                    const mappedCategoryId = categoryMap.get(b.categoryId) || b.categoryId;

                    const targetBudget = await tx.budget.findFirst({
                        where: {
                            familyId: targetFamilyId,
                            categoryId: mappedCategoryId,
                            month: b.month,
                            year: b.year,
                        },
                    });

                    if (targetBudget) {
                        // Se já existe um orçamento, deleta o antigo
                        await tx.budget.delete({ where: { id: b.id } });
                    } else {
                        // Move para o grupo familiar destino com o categoryId mapeado
                        await tx.budget.update({
                            where: { id: b.id },
                            data: {
                                familyId: targetFamilyId,
                                categoryId: mappedCategoryId,
                            },
                        });
                    }
                }

                // 4. Move as transações restantes da família antiga para a nova
                await tx.transaction.updateMany({
                    where: { familyId: oldFamilyId },
                    data: { familyId: targetFamilyId },
                });

                // 5. Migra o usuário para a nova família
                await tx.user.update({
                    where: { id: userId },
                    data: { familyId: targetFamilyId },
                });

                walletMappings = Object.fromEntries(walletMap);
                categoryMappings = Object.fromEntries(categoryMap);
            });

            await this.prisma.familyGroup.delete({
                where: { id: oldFamilyId },
            }).catch(() => null);
        } else {
            // Sabor seletivo usando transação interativa (há outros membros ativos na família antiga)
            await this.prisma.$transaction(async (tx) => {
                // 1. Encontra todas as transações pagas por este usuário na família antiga
                const userTransactions = await tx.transaction.findMany({
                    where: { paidById: userId, familyId: oldFamilyId },
                });

                // 2. Coleta carteiras distintas usadas nas transações dele e as cria/mapeia no grupo destino
                const oldWalletIds = Array.from(new Set(userTransactions.map((t) => t.walletId)));
                const walletMap = new Map<string, string>(); // oldWalletId -> targetWalletId

                for (const walletId of oldWalletIds) {
                    const oldWallet = await tx.wallet.findUnique({ where: { id: walletId } });
                    const walletName = oldWallet ? oldWallet.name : 'Shared Wallet Account';

                    let targetWallet = await tx.wallet.findFirst({
                        where: { familyId: targetFamilyId, name: walletName },
                    });

                    if (!targetWallet) {
                        targetWallet = await tx.wallet.create({
                            data: {
                                name: walletName,
                                balance: 0.00,
                                familyId: targetFamilyId,
                            },
                        });
                    }
                    walletMap.set(walletId, targetWallet.id);
                }

                // 3. Coleta categorias distintas criadas pelo usuário ou usadas nas transações dele e as cria/mapeia no grupo destino
                const oldCategoryIds = Array.from(new Set(userTransactions.map((t) => t.categoryId)));
                
                const userCreatedCategories = await tx.category.findMany({
                    where: { createdById: userId, familyId: oldFamilyId },
                });
                for (const cat of userCreatedCategories) {
                    oldCategoryIds.push(cat.id);
                }

                const categoryMap = new Map<string, string>(); // oldCategoryId -> targetCategoryId
                const uniqueCategoryIds = Array.from(new Set(oldCategoryIds));

                for (const catId of uniqueCategoryIds) {
                    const oldCategory = await tx.category.findUnique({ where: { id: catId } });
                    if (oldCategory) {
                        let targetCategory = await tx.category.findFirst({
                            where: { familyId: targetFamilyId, name: oldCategory.name, type: oldCategory.type },
                        });

                        if (!targetCategory) {
                            targetCategory = await tx.category.create({
                                data: {
                                    name: oldCategory.name,
                                    type: oldCategory.type,
                                    icon: oldCategory.icon,
                                    color: oldCategory.color,
                                    familyId: targetFamilyId,
                                    createdById: userId,
                                },
                            });
                        }
                        categoryMap.set(catId, targetCategory.id);
                    }
                }

                // 4. Migra as transações dele atualizando walletId, categoryId e familyId em lote agrupado por par de carteira/categoria
                const pairs = new Map<string, string[]>(); // "oldWalletId:oldCategoryId" -> array de transactionIds
                for (const t of userTransactions) {
                    const key = `${t.walletId}:${t.categoryId}`;
                    if (!pairs.has(key)) {
                        pairs.set(key, []);
                    }
                    pairs.get(key)!.push(t.id);
                }

                for (const [key, txIds] of pairs.entries()) {
                    const [oldWalletId, oldCategoryId] = key.split(':');
                    const targetWalletId = walletMap.get(oldWalletId);
                    const targetCategoryId = categoryMap.get(oldCategoryId);

                    if (targetWalletId && targetCategoryId) {
                        await tx.transaction.updateMany({
                            where: { id: { in: txIds } },
                            data: {
                                familyId: targetFamilyId,
                                walletId: targetWalletId,
                                categoryId: targetCategoryId,
                            },
                        });
                    }
                }

                // 5. Migra o usuário para o novo grupo familiar
                await tx.user.update({
                    where: { id: userId },
                    data: { familyId: targetFamilyId },
                });

                walletMappings = Object.fromEntries(walletMap);
                categoryMappings = Object.fromEntries(categoryMap);
            });
        }

        if (walletMappings && categoryMappings) {
            const targetWalletIds = Object.values(walletMappings) as string[];
            const targetCategoryIds = Object.values(categoryMappings) as string[];

            targetWallets = await this.prisma.wallet.findMany({
                where: { id: { in: targetWalletIds } },
            });
            targetCategories = await this.prisma.category.findMany({
                where: { id: { in: targetCategoryIds } },
            });
        }

        // Envia mensagem assíncrona ao RabbitMQ para sincronizar o banco de Analytics!
        this.analyticsClient.emit('family.merged', {
            oldFamilyId,
            targetFamilyId,
            userId,
            isSelective: remainingUsers > 0,
            walletMappings,
            categoryMappings,
            targetWallets,
            targetCategories,
        });

        return {
            success: true,
            message: 'Grupo familiar integrado com sucesso!',
            familyId: targetFamilyId,
        };
    }

    async leaveGroup(userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('Credenciais de usuário obrigatórias');
        }

        const dbUser = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { family: { include: { users: true } } },
        });

        if (!dbUser) {
            throw new NotFoundException('Usuário não encontrado');
        }

        const currentFamily = dbUser.family;

        if (currentFamily.users.length <= 1) {
            throw new BadRequestException('Você já está em um grupo individual.');
        }

        // Cria um novo grupo familiar para o usuário que está saindo
        const decodedName = dbUser.name;
        const newFamily = await this.prisma.familyGroup.create({
            data: { name: `${decodedName} & Família` },
        });

        let walletMappings: Record<string, string> | null = null;
        let categoryMappings: Record<string, string> | null = null;
        let newWallets: any[] = [];
        let newCategories: any[] = [];

        await this.prisma.$transaction(async (tx) => {
            // 1. Encontra todas as transações pagas por este usuário no grupo antigo
            const userTransactions = await tx.transaction.findMany({
                where: { paidById: userId, familyId: currentFamily.id },
            });

            // 2. Coleta carteiras distintas usadas nas transações dele e as cria/mapeia no novo grupo
            const oldWalletIds = Array.from(new Set(userTransactions.map((t) => t.walletId)));
            const walletMap = new Map<string, string>(); // oldWalletId -> newWalletId

            for (const walletId of oldWalletIds) {
                const oldWallet = await tx.wallet.findUnique({ where: { id: walletId } });
                const walletName = oldWallet ? oldWallet.name : 'Shared Wallet Account';

                let newWallet = await tx.wallet.findFirst({
                    where: { familyId: newFamily.id, name: walletName },
                });

                if (!newWallet) {
                    newWallet = await tx.wallet.create({
                        data: {
                            name: walletName,
                            balance: 0.00,
                            familyId: newFamily.id,
                        },
                    });
                }
                walletMap.set(walletId, newWallet.id);
            }

            // 3. Coleta categorias criadas por este usuário ou usadas nas transações dele e as clona/mapeia no novo grupo
            const oldCategoryIds = Array.from(new Set(userTransactions.map((t) => t.categoryId)));
            
            const userCreatedCategories = await tx.category.findMany({
                where: { createdById: userId, familyId: currentFamily.id },
            });
            for (const cat of userCreatedCategories) {
                oldCategoryIds.push(cat.id);
            }

            const categoryMap = new Map<string, string>(); // oldCategoryId -> newCategoryId
            const uniqueCategoryIds = Array.from(new Set(oldCategoryIds));

            for (const catId of uniqueCategoryIds) {
                const oldCategory = await tx.category.findUnique({ where: { id: catId } });
                if (oldCategory) {
                    let newCategory = await tx.category.findFirst({
                        where: { familyId: newFamily.id, name: oldCategory.name, type: oldCategory.type },
                    });

                    if (!newCategory) {
                        newCategory = await tx.category.create({
                            data: {
                                name: oldCategory.name,
                                type: oldCategory.type,
                                icon: oldCategory.icon,
                                color: oldCategory.color,
                                familyId: newFamily.id,
                                createdById: userId,
                            },
                        });
                    }
                    categoryMap.set(catId, newCategory.id);
                }
            }

            // 4. Migra as transações dele atualizando walletId, categoryId e familyId em lote agrupado por par de carteira/categoria
            const pairs = new Map<string, string[]>(); // "oldWalletId:oldCategoryId" -> array de transactionIds
            for (const t of userTransactions) {
                const key = `${t.walletId}:${t.categoryId}`;
                if (!pairs.has(key)) {
                    pairs.set(key, []);
                }
                pairs.get(key)!.push(t.id);
            }

            for (const [key, txIds] of pairs.entries()) {
                const [oldWalletId, oldCategoryId] = key.split(':');
                const targetWalletId = walletMap.get(oldWalletId);
                const targetCategoryId = categoryMap.get(oldCategoryId);

                if (targetWalletId && targetCategoryId) {
                    await tx.transaction.updateMany({
                        where: { id: { in: txIds } },
                        data: {
                            familyId: newFamily.id,
                            walletId: targetWalletId,
                            categoryId: targetCategoryId,
                        },
                    });
                }
            }

            // 5. Atualiza o usuário para o novo grupo familiar
            await tx.user.update({
                where: { id: userId },
                data: { familyId: newFamily.id },
            });

            walletMappings = Object.fromEntries(walletMap);
            categoryMappings = Object.fromEntries(categoryMap);
        });

        if (walletMappings && categoryMappings) {
            const newWalletIds = Object.values(walletMappings) as string[];
            const newCategoryIds = Object.values(categoryMappings) as string[];

            newWallets = await this.prisma.wallet.findMany({
                where: { id: { in: newWalletIds } },
            });
            newCategories = await this.prisma.category.findMany({
                where: { id: { in: newCategoryIds } },
            });
        }

        // Envia mensagem assíncrona ao RabbitMQ para sincronizar o banco de Analytics!
        this.analyticsClient.emit('user.left_group', {
            userId,
            userName: dbUser.name,
            userEmail: dbUser.email,
            userAvatarUrl: dbUser.avatarUrl,
            newFamilyId: newFamily.id,
            newFamilyName: newFamily.name,
            walletMappings,
            categoryMappings,
            newWallets,
            newCategories,
        });

        return {
            success: true,
            message: 'Você saiu do grupo familiar e agora está em um grupo individual.',
            familyId: newFamily.id,
        };
    }
}
