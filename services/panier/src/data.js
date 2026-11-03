'use strict';

/**
 * Client du microservice catalogue.
 * Tolerant a une panne temporaire du catalogue: si le catalogue est
 * injoignable on accepte l'article avec name/price par defaut, mais si
 * le catalogue repond qu'un produit n'existe pas -> 404.
 */
async function fetchCatalogue(baseUrl, productId) {
  if (!baseUrl) {
    return { ok: false, reason: 'unreachable' };
  }
  try {
    const res = await fetch(`${baseUrl}/products/${encodeURIComponent(productId)}`,
      { signal: AbortSignal.timeout(2000) });
    if (res.status === 404) return { ok: false, reason: 'notfound' };
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    const product = await res.json();
    return { ok: true, product };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

module.exports = { fetchCatalogue };
