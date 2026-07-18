import { sha256Hex } from './hash';
import {
	normalizeEmailForMeta,
	normalizePhoneForMeta,
	normalizeNameForMeta,
	normalizeCityForMeta,
	normalizeStateForMeta,
	normalizeZipForMeta,
	normalizeCountryForMeta,
} from './pii-normalize';
import { EVENT_CATALOG } from './event-catalog';
import type { NormalizedEvent } from './normalized-event';
import type { MetaEventObject } from './meta-capi';

// Monta o objeto de evento exatamente no formato que a Meta documenta:
// https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
// user_data com PII normalizada (ver lib/pii-normalize.ts) e hasheada em
// SHA-256, custom_data seguindo os campos recomendados por tipo de evento.
export async function buildMetaEvent(
	evt: NormalizedEvent
): Promise<MetaEventObject | null> {
	const cfg = EVENT_CATALOG[ evt.canonicalName ];
	if ( !cfg.sendToMeta ) return null;

	const userData: Record<string, unknown> = {};

	if ( evt.user.email )
	{
		userData.em = [ await sha256Hex( normalizeEmailForMeta( evt.user.email ) ) ];
	}
	if ( evt.user.phone )
	{
		userData.ph = [ await sha256Hex( normalizePhoneForMeta( evt.user.phone ) ) ];
	}
	if ( evt.user.firstName )
	{
		userData.fn = [ await sha256Hex( normalizeNameForMeta( evt.user.firstName ) ) ];
	}
	if ( evt.user.lastName )
	{
		userData.ln = [ await sha256Hex( normalizeNameForMeta( evt.user.lastName ) ) ];
	}
	// external_id ajuda o match quando não há email/telefone (ex: reembolso
	// sem esses dados no payload) — usamos o ID da transação hasheado
	if ( evt.user.externalId )
	{
		userData.external_id = [ await sha256Hex( evt.user.externalId.trim().toLowerCase() ) ];
	}
	// Opcionais, mas a Meta recomenda mandar sempre que disponível — ajuda o
	// match mesmo quando todo o público é do mesmo país
	if ( evt.user.city ) userData.ct = [ await sha256Hex( normalizeCityForMeta( evt.user.city ) ) ];
	if ( evt.user.state ) userData.st = [ await sha256Hex( normalizeStateForMeta( evt.user.state ) ) ];
	if ( evt.user.zip )
	{
		userData.zp = [ await sha256Hex( normalizeZipForMeta( evt.user.zip, evt.user.countryIso ) ) ];
	}
	if ( evt.user.countryIso )
	{
		userData.country = [ await sha256Hex( normalizeCountryForMeta( evt.user.countryIso ) ) ];
	}
	// fbp, fbc, IP e user-agent NUNCA são hasheados — vão em texto puro
	if ( evt.user.clientIp ) userData.client_ip_address = evt.user.clientIp;
	if ( evt.user.userAgent ) userData.client_user_agent = evt.user.userAgent;
	if ( evt.user.fbp ) userData.fbp = evt.user.fbp;
	if ( evt.user.fbc ) userData.fbc = evt.user.fbc;

	const customData: Record<string, unknown> = {};
	if ( evt.commerce?.currency ) customData.currency = evt.commerce.currency;
	if ( evt.commerce?.value !== undefined ) customData.value = evt.commerce.value;
	if ( evt.commerce?.productId ) customData.content_ids = [ evt.commerce.productId ];
	if ( evt.commerce?.productName ) customData.content_name = evt.commerce.productName;
	if ( evt.commerce?.productId || evt.commerce?.productName )
	{
		customData.content_type = 'product';
		customData.num_items = 1;
	}
	if ( evt.commerce?.transactionId ) customData.order_id = evt.commerce.transactionId;

	return {
		event_name: cfg.meta.name,
		event_time: evt.eventTime,
		event_id: evt.eventId, // dedup automático com pixel client-side, se houver
		event_source_url: evt.sourceUrl,
		action_source: evt.actionSource,
		user_data: userData,
		custom_data: customData,
	};
}
