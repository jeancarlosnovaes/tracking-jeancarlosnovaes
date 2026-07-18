import { supabase } from './supabase';

export interface CheckoutTrackingContext {
	code: string;
	fbp?: string | null;
	fbc?: string | null;
	gaClientId?: string | null;
	clientIp?: string;
	userAgent?: string;
	utmSource?: string | null;
	utmMedium?: string | null;
	utmCampaign?: string | null;
	utmTerm?: string | null;
	utmContent?: string | null;
}

// Chamado em api/checkout-redirect.ts, no momento em que o visitante clica
// em "Comprar" e é redirecionado para o checkout da Hotmart.
export async function saveCheckoutTracking( ctx: CheckoutTrackingContext ) {
	await supabase.from( 'checkout_tracking' ).insert( {
		code: ctx.code,
		fbp: ctx.fbp,
		fbc: ctx.fbc,
		ga_client_id: ctx.gaClientId,
		client_ip: ctx.clientIp,
		user_agent: ctx.userAgent,
		utm_source: ctx.utmSource,
		utm_medium: ctx.utmMedium,
		utm_campaign: ctx.utmCampaign,
		utm_term: ctx.utmTerm,
		utm_content: ctx.utmContent,
	} );
}

// Chamado em api/webhooks/hotmart.ts para recuperar o contexto pelo código
// que voltou no payload do webhook (ver lib/hotmart.ts:extractTrackingCode)
export async function getCheckoutTracking( code: string ) {
	const { data } = await supabase
		.from( 'checkout_tracking' )
		.select( '*' )
		.eq( 'code', code )
		.maybeSingle();
	return data;
}
