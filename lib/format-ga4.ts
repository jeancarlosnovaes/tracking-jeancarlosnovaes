import { sha256Hex } from './hash';
import {
	normalizeEmailForGa4,
	normalizePhoneForGa4,
	normalizeNameForGa4,
	normalizeStreetForGa4,
	normalizeCityForGa4,
	normalizeRegionForGa4,
	normalizePostalCodeForGa4,
	normalizeCountryForGa4,
} from './pii-normalize';
import { EVENT_CATALOG } from './event-catalog';
import type { NormalizedEvent } from './normalized-event';
import type { Ga4Payload } from './ga4';

// Segue o schema de ecommerce recomendado do GA4 (transaction_id, value,
// currency, items[]) e o schema de "dados fornecidos pelo usuário":
// https://developers.google.com/analytics/devguides/collection/ga4/uid-data
export async function buildGa4Event( evt: NormalizedEvent ): Promise<Ga4Payload | null> {
	const cfg = EVENT_CATALOG[ evt.canonicalName ];
	if ( !cfg.sendToGa4 ) return null;

	const params: Record<string, unknown> = {
		// sem isso o GA4 pode não contar a sessão como "engajada"
		engagement_time_msec: 1,
	};

	if ( evt.commerce )
	{
		if ( evt.commerce.currency ) params.currency = evt.commerce.currency;
		if ( evt.commerce.value !== undefined ) params.value = evt.commerce.value;
		if ( evt.commerce.transactionId ) params.transaction_id = evt.commerce.transactionId;
		if ( evt.commerce.paymentMethod ) params.payment_type = evt.commerce.paymentMethod;
		if ( evt.commerce.coupon ) params.coupon = evt.commerce.coupon; // sem equivalente na Meta

		if ( evt.commerce.productId || evt.commerce.productName )
		{
			params.items = [
				{
					item_id: evt.commerce.productId ?? evt.commerce.productName,
					item_name: evt.commerce.productName ?? evt.commerce.productId,
					item_category: evt.commerce.contentCategory,
					price: evt.commerce.value,
					quantity: evt.commerce.quantity ?? 1,
				},
			];
		}
	}

	const payload: Ga4Payload = {
		// sem client_id do GA (_ga cookie) o evento não casa com nenhuma sessão
		// existente — nesse caso o GA4 cria uma sessão nova "sintética"
		client_id: evt.user.gaClientId ?? evt.eventId,
		events: [
			{
				name: sanitizeEventName( cfg.ga4.name ),
				params,
			},
		],
	};

	// user_data (User-ID data) só é enviado se tivermos um user_id não-PII —
	// o GA4 exige esse campo sempre que user_data está presente, e ele NUNCA
	// deve ser a própria PII (email/telefone), só um identificador interno.
	const hasAddressData = Boolean(
		evt.user.firstName || evt.user.lastName || evt.user.street || evt.user.city ||
		evt.user.state || evt.user.zip || evt.user.countryIso
	);

	if ( evt.user.internalId && ( evt.user.email || evt.user.phone || hasAddressData ) )
	{
		payload.user_id = evt.user.internalId;
		payload.user_data = {};

		if ( evt.user.email )
		{
			payload.user_data.sha256_email_address = await sha256Hex(
				normalizeEmailForGa4( evt.user.email )
			);
		}
		if ( evt.user.phone )
		{
			payload.user_data.sha256_phone_number = await sha256Hex(
				normalizePhoneForGa4( evt.user.phone )
			);
		}

		if ( hasAddressData )
		{
			payload.user_data.address = {};
			if ( evt.user.firstName )
			{
				payload.user_data.address.sha256_first_name = await sha256Hex(
					normalizeNameForGa4( evt.user.firstName )
				);
			}
			if ( evt.user.lastName )
			{
				payload.user_data.address.sha256_last_name = await sha256Hex(
					normalizeNameForGa4( evt.user.lastName )
				);
			}
			if ( evt.user.street )
			{
				payload.user_data.address.sha256_street = await sha256Hex(
					normalizeStreetForGa4( evt.user.street )
				);
			}
			// city, region, postal_code e country NÃO são hasheados — vão em
			// texto puro no payload, ao contrário dos campos acima
			if ( evt.user.city ) payload.user_data.address.city = normalizeCityForGa4( evt.user.city );
			if ( evt.user.state )
			{
				payload.user_data.address.region = normalizeRegionForGa4( evt.user.state );
			}
			if ( evt.user.zip )
			{
				payload.user_data.address.postal_code = normalizePostalCodeForGa4( evt.user.zip );
			}
			if ( evt.user.countryIso )
			{
				payload.user_data.address.country = normalizeCountryForGa4( evt.user.countryIso );
			}
		}
	}

	return payload;
}

// GA4 só aceita event names com letras, números e underscore
function sanitizeEventName( name: string ): string {
	return name.replace( /[^a-zA-Z0-9_]/g, '_' ).slice( 0, 40 );
}
