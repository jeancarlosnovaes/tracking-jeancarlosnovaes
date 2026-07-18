// Fonte única de verdade: todo evento que passa pelo sistema (vindo do
// site ou da Hotmart) é traduzido para um destes nomes canônicos, e daqui
// sai o nome que cada plataforma espera.
//
// Meta: eventos com "standard: true" são nomes reservados pelo Meta
// (otimizáveis em campanhas). Os "standard: false" são custom events —
// não otimizam entrega, mas servem pra montar públicos/exclusões.
//
// GA4: nomes de evento recomendado (ecommerce) usam snake_case fixo do
// Google; os demais são custom events, também em snake_case por convenção.

export type CanonicalEventName =
	| 'PageView'
	| 'Lead'
	| 'InitiateCheckout'
	| 'AddPaymentInfo'
	| 'Purchase'
	| 'AbandonedCheckout'
	| 'Refund'
	| 'Chargeback'
	| 'PurchaseProtest'
	| 'PurchaseCanceled'
	| 'PurchaseExpired'
	| 'PurchaseDelayed'
	| 'SubscriptionCancellation'
	| 'ClubFirstAccess'
	| 'ClubModuleCompleted';

interface EventConfig {
	meta: { name: string; standard: boolean; };
	ga4: { name: string; };
	// false = registramos no Supabase (CRM/dashboard) mas não poluímos a
	// plataforma de ads com um evento que não ajuda a otimizar campanha
	sendToMeta: boolean;
	sendToGa4: boolean;
}

export const EVENT_CATALOG: Record<CanonicalEventName, EventConfig> = {
	PageView: {
		meta: { name: 'PageView', standard: true },
		ga4: { name: 'page_view' },
		sendToMeta: true,
		sendToGa4: true,
	},
	Lead: {
		meta: { name: 'Lead', standard: true },
		ga4: { name: 'generate_lead' },
		sendToMeta: true,
		sendToGa4: true,
	},
	InitiateCheckout: {
		meta: { name: 'InitiateCheckout', standard: true },
		ga4: { name: 'begin_checkout' },
		sendToMeta: true,
		sendToGa4: true,
	},
	AddPaymentInfo: {
		// Hotmart: PURCHASE_BILLET_PRINTED (boleto/PIX gerado, aguardando pagamento)
		meta: { name: 'AddPaymentInfo', standard: true },
		ga4: { name: 'add_payment_info' },
		sendToMeta: true,
		sendToGa4: true,
	},
	Purchase: {
		// Hotmart: PURCHASE_APPROVED / PURCHASE_COMPLETE
		meta: { name: 'Purchase', standard: true },
		ga4: { name: 'purchase' },
		sendToMeta: true,
		sendToGa4: true,
	},
	AbandonedCheckout: {
		// Hotmart: PURCHASE_OUT_OF_SHOPPING_CART
		meta: { name: 'AbandonedCheckout', standard: false },
		ga4: { name: 'abandoned_checkout' },
		sendToMeta: true,
		sendToGa4: true,
	},
	Refund: {
		// Hotmart: PURCHASE_REFUNDED — GA4 tem "refund" como evento recomendado
		meta: { name: 'Refund', standard: false },
		ga4: { name: 'refund' },
		sendToMeta: true, // útil pra excluir de públicos de remarketing/lookalike
		sendToGa4: true,
	},
	Chargeback: {
		meta: { name: 'Chargeback', standard: false },
		ga4: { name: 'chargeback' },
		sendToMeta: true,
		sendToGa4: true,
	},
	PurchaseProtest: {
		// Hotmart: PURCHASE_PROTEST (contestação/disputa em análise)
		meta: { name: 'PurchaseProtest', standard: false },
		ga4: { name: 'purchase_protest' },
		sendToMeta: false,
		sendToGa4: true,
	},
	PurchaseCanceled: {
		meta: { name: 'PurchaseCanceled', standard: false },
		ga4: { name: 'purchase_canceled' },
		sendToMeta: true,
		sendToGa4: true,
	},
	PurchaseExpired: {
		// Boleto/PIX gerado (AddPaymentInfo) que expirou sem pagamento
		meta: { name: 'PurchaseExpired', standard: false },
		ga4: { name: 'purchase_expired' },
		sendToMeta: false,
		sendToGa4: true,
	},
	PurchaseDelayed: {
		// Pagamento em análise antifraude
		meta: { name: 'PurchaseDelayed', standard: false },
		ga4: { name: 'purchase_delayed' },
		sendToMeta: false,
		sendToGa4: true,
	},
	SubscriptionCancellation: {
		meta: { name: 'SubscriptionCancellation', standard: false },
		ga4: { name: 'subscription_cancellation' },
		sendToMeta: true,
		sendToGa4: true,
	},
	ClubFirstAccess: {
		// Primeiro acesso à área de membros — sinal de engajamento, não de venda
		meta: { name: 'ClubFirstAccess', standard: false },
		ga4: { name: 'club_first_access' },
		sendToMeta: false,
		sendToGa4: true,
	},
	ClubModuleCompleted: {
		meta: { name: 'ClubModuleCompleted', standard: false },
		ga4: { name: 'club_module_completed' },
		sendToMeta: false,
		sendToGa4: true,
	},
};
