// Hash puro — a normalização (o que vira minúsculo, o que perde espaço,
// como o telefone ganha código do país) fica toda em lib/pii-normalize.ts,
// porque Meta e GA4 exigem normalizações diferentes antes do SHA-256.
export async function sha256Hex( input: string ): Promise<string> {
	const data = new TextEncoder().encode( input );
	const hashBuffer = await crypto.subtle.digest( 'SHA-256', data );
	return Array.from( new Uint8Array( hashBuffer ) )
		.map( ( b ) => b.toString( 16 ).padStart( 2, '0' ) )
		.join( '' );
}
