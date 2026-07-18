import { supabase } from './supabase';
import { buildMetaEvent } from './format-meta';
import { buildGa4Event } from './format-ga4';
import { postMetaEvents } from './meta-capi';
import { postGa4Event } from './ga4';
import type { NormalizedEvent } from './normalized-event';

// Ponto único por onde todo evento passa, venha do site (api/collect) ou
// da Hotmart (api/webhooks/hotmart). Faz três coisas:
// 1. Deduplicação: se este event_id já foi processado, não reenvia nada —
//    protege contra retries (a Hotmart reenvia webhook até 5x em caso de
//    erro/timeout, e isso não pode virar 5 "Purchase" duplicadas no Meta).
// 2. Dispara em paralelo para Meta CAPI e GA4, cada um já formatado no
//    schema recomendado da respectiva plataforma.
// 3. Loga o resultado do disparo na tabela events, pra auditoria/debug.
export async function dispatchEvent( evt: NormalizedEvent, leadId: string | null = null ) {
	const { data: existing } = await supabase
		.from( 'events' )
		.select( 'id' )
		.eq( 'event_id', evt.eventId )
		.maybeSingle();

	if ( existing )
	{
		return { skipped: true, reason: 'already_processed' as const };
	}

	const metaEvent = await buildMetaEvent( evt );
	const ga4Event = await buildGa4Event( evt );

	const [ metaResult, ga4Result ] = await Promise.allSettled( [
		metaEvent ? postMetaEvents( [ metaEvent ] ) : Promise.resolve( { skipped: true } ),
		ga4Event ? postGa4Event( ga4Event ) : Promise.resolve( { skipped: true } ),
	] );

	await supabase.from( 'events' ).insert( {
		event_id: evt.eventId,
		event_name: evt.canonicalName,
		lead_id: leadId,
		meta_status: metaResult.status,
		meta_response:
			metaResult.status === 'fulfilled' ? metaResult.value : { error: String( metaResult.reason ) },
		ga4_status: ga4Result.status,
		ga4_response:
			ga4Result.status === 'fulfilled' ? ga4Result.value : { error: String( ga4Result.reason ) },
		raw_payload: evt.raw ?? evt,
	} );

	return { skipped: false as const, metaResult, ga4Result };
}
