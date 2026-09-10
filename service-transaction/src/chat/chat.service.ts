import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
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

            if (user) return user;

            const family = await this.prisma.familyGroup.create({
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
        }

        return user;
    }

    async processMessage(message: string, userId?: string, userEmail?: string, userName?: string) {
        if (!userId || !userEmail) {
            throw new UnauthorizedException('Credenciais de usuário obrigatórias');
        }

        const dbUser = await this.getOrCreateUser(userId, userEmail, userName);
        const familyId = dbUser.familyId;

        // 1. Busca categorias da família + globais (onde familyId é null)
        const categories = await this.prisma.category.findMany({
            where: {
                OR: [
                    { familyId },
                    { familyId: null },
                ],
            },
        });

        const categoriesListStr = categories
            .map((c) => `- ID: "${c.id}", Nome: "${c.name}", Tipo: "${c.type}"`)
            .join('\n');

        const apiKey = this.configService.get<string>('GEMINI_API_KEY');

        if (!apiKey || apiKey.trim() === '') {
            return {
                isTransaction: false,
                reply: `Olá, ${dbUser.name}! Fico muito feliz em falar com você. 😊\n\nNo momento, meu cérebro inteligente de IA não está ativo porque a chave da API do Gemini (GEMINI_API_KEY) não foi configurada nas variáveis de ambiente do servidor. Para me ativar, por favor configure a chave no servidor.`,
            };
        }

        const systemPrompt = `Você é o assistente inteligente de controle financeiro do FinanceApp. Seu papel é ajudar o usuário a registrar e categorizar suas despesas e receitas usando linguagem natural de forma amigável e conversacional.

O usuário se chama "${dbUser.name}".

O usuário tem as seguintes categorias disponíveis em seu grupo familiar (use-as ou sugira a mais próxima se o usuário especificar algo correspondente):
${categoriesListStr}

Instruções para análise:
1. Analise a mensagem do usuário para determinar se ele está solicitando o lançamento de uma transação financeira (despesa ou receita).
2. Se for uma transação:
   - Extraia o valor (amount) - obrigatório.
   - Extraia a descrição (description) - um nome limpo e direto para a transação.
   - Determine o tipo (type): 'EXPENSE' (despesa) ou 'INCOME' (receita).
   - Tente mapear o gasto para uma das categorias fornecidas. Se encontrar uma boa correspondência na lista, forneça o \`categoryId\` e o \`categoryName\` dela. Caso não encontre nenhuma categoria que se adeque bem, escolha o nome de uma categoria padrão razoável (como 'Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Outros') e deixe \`categoryId\` como null.
   - Gere uma resposta conversacional e simpática no campo \`reply\`, confirmando as informações que você extraiu (ex: 'Entendi! Registrei um gasto de R$ 45,00 em Alimentação. Confirma o lançamento abaixo?').
3. Se NÃO for uma transação (por exemplo, cumprimentos, dúvidas, conversas casuais):
   - Defina \`isTransaction\` como false.
   - Gere uma resposta simpática e conversacional no campo \`reply\`, respondendo à dúvida ou cumprimento do usuário, e se oportuno lembrando-o de que ele pode registrar transações escrevendo algo como 'Gastei R$ 20 com Uber hoje'.

A sua resposta deve seguir rigorosamente o esquema JSON fornecido.`;

        try {
            const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.1-flash-lite';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const apiResponse = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: systemPrompt },
                                { text: `Mensagem do usuário: "${message}"` },
                            ],
                        },
                    ],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: 'OBJECT',
                            properties: {
                                isTransaction: {
                                    type: 'BOOLEAN',
                                    description:
                                        'True se a mensagem descreve uma transação a ser lançada (receita ou despesa). False caso contrário.',
                                },
                                amount: {
                                    type: 'NUMBER',
                                    description:
                                        'O valor numérico da transação. Null se isTransaction for false.',
                                },
                                description: {
                                    type: 'STRING',
                                    description:
                                        'Uma descrição limpa para a transação (ex: "Almoço", "Uber", "Salário"). Null se isTransaction for false.',
                                },
                                type: {
                                    type: 'STRING',
                                    enum: ['EXPENSE', 'INCOME'],
                                    description:
                                        'O tipo da transação: "EXPENSE" (despesa) ou "INCOME" (receita). Null se isTransaction for false.',
                                },
                                categoryName: {
                                    type: 'STRING',
                                    description:
                                        'O nome da categoria mapeada. Null se isTransaction for false.',
                                },
                                categoryId: {
                                    type: 'STRING',
                                    description:
                                        'O UUID da categoria correspondente da lista de categorias fornecidas. Null se nenhuma correspondência ideal for encontrada ou se isTransaction for false.',
                                },
                                reply: {
                                    type: 'STRING',
                                    description:
                                        'Resposta em texto conversacional, simpática e em português para exibir ao usuário.',
                                },
                            },
                            required: ['isTransaction', 'reply'],
                        },
                    },
                }),
            });

            if (!apiResponse.ok) {
                const errText = await apiResponse.text();
                throw new Error(`Erro na API do Gemini: ${apiResponse.status} - ${errText}`);
            }

            const data = (await apiResponse.json()) as any;
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!textResponse) {
                throw new Error('Nenhuma resposta retornada pelo Gemini.');
            }

            return JSON.parse(textResponse);
        } catch (e) {
            console.error('Erro ao processar com Gemini:', e);
            return {
                isTransaction: false,
                reply: `Desculpe, ocorria um erro ao processar sua mensagem pelo assistente inteligente de IA. Detalhes: ${e.message || e}`,
            };
        }
    }
}
