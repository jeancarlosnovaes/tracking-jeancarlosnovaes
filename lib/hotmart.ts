import type { CanonicalEventName } from './event-catalog';

// Todos os eventos de webhook 2.0 da Hotmart que valem a pena tratar.
// PURCHASE_COMPLETE é o nome legado de PURCHASE_APPROVED em integrações
// mais antigas — mapeamos os dois pro mesmo canônico.
const HOTMART_EVENT_MAP: Record<string, CanonicalEventName> = {
	PURCHASE_APPROVED: 'Purchase',
	PURCHASE_COMPLETE: 'Purchase',
	PURCHASE_BILLET_PRINTED: 'AddPaymentInfo',
	PURCHASE_OUT_OF_SHOPPING_CART: 'AbandonedCheckout',
	PURCHASE_REFUNDED: 'Refund',
	PURCHASE_CHARGEBACK: 'Chargeback',
	PURCHASE_PROTEST: 'PurchaseProtest',
	PURCHASE_CANCELED: 'PurchaseCanceled',
	PURCHASE_CANCELLED: 'PurchaseCanceled', // grafia alternativa usada em alguns payloads
	PURCHASE_EXPIRED: 'PurchaseExpired',
	PURCHASE_DELAYED: 'PurchaseDelayed',
	SUBSCRIPTION_CANCELLATION: 'SubscriptionCancellation',
	CLUB_FIRST_ACCESS: 'ClubFirstAccess',
	CLUB_MODULE_COMPLETED: 'ClubModuleCompleted',
};

export function mapHotmartEvent( hotmartEventName: string ): CanonicalEventName | null {
	return HOTMART_EVENT_MAP[ hotmartEventName ] ?? null;
}

// O código de rastreio (o mesmo que api/checkout-redirect.ts gera e anexa
// como ?sck= no link de checkout) volta no webhook em algum destes campos,
// dependendo do evento/versão. IMPORTANTE: confirme o path exato mandando
// um teste em Hotmart > Ferramentas > Webhook > sua config > Enviar teste,
// e ajuste a lista abaixo se necessário — a tabela `events.raw_payload`
// sempre guarda o payload cru pra você comparar.
export function extractTrackingCode( data: any ): string | null {
	return (
		data?.purchase?.origin?.sck ??
		data?.purchase?.origin?.xcod ??
		data?.purchase?.tracking?.source_sck ??
		data?.purchase?.tracking?.source ??
		data?.subscription?.tracking?.source_sck ??
		null
	);
}

export interface ParsedHotmartData {
	transactionId?: string;
	value?: number;
	currency?: string;
	productId?: string;
	productName?: string;
	paymentMethod?: string;
	subscriptionId?: string;
	buyerEmail?: string;
	buyerName?: string;
	buyerPhone?: string;
	buyerCity?: string;
	buyerState?: string;
	buyerZip?: string;
	buyerCountryIso?: string;
	buyerStreet?: string;
	eventTimeMs?: number;
}

export function parseHotmartData( data: any, fallbackTimeMs: number ): ParsedHotmartData {
	const addr = data?.buyer?.address;
	const street = addr?.address
		? `${addr.address}${addr?.number ? ` ${addr.number}` : ''}`
		: undefined;

	return {
		transactionId: data?.purchase?.transaction ?? data?.subscription?.subscriber?.code,
		value: data?.purchase?.price?.value,
		currency: data?.purchase?.price?.currency_value,
		productId: data?.product?.id !== undefined ? String( data.product.id ) : undefined,
		productName: data?.product?.name,
		paymentMethod: data?.purchase?.payment?.type,
		subscriptionId: data?.subscription?.subscriber?.code,
		buyerEmail: data?.buyer?.email,
		buyerName: data?.buyer?.name,
		buyerPhone: data?.buyer?.checkout_phone ?? data?.buyer?.phone,
		// Endereço nem sempre vem (depende do produto/checkout) — a Meta e o
		// GA4 recomendam mandar sempre que existir, mesmo que incompleto.
		buyerCity: addr?.city,
		buyerState: addr?.state,
		buyerZip: addr?.zip_code ?? addr?.zipcode,
		buyerCountryIso: data?.purchase?.checkout_country?.iso ?? addr?.country_iso,
		buyerStreet: street,
		eventTimeMs: data?.purchase?.approved_date ?? data?.purchase?.order_date ?? fallbackTimeMs,
	};
}
