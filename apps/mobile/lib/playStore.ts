const LISTING_URL = 'https://play.google.com/store/apps/details?id=com.lavozverdad.radio';

/** Channel data Play Console reports for a visit that started from a store link. */
export interface StoreCampaign {
  readonly source: string;
  readonly medium: string;
  readonly campaign: string;
}

/**
 * Builds the Play Store listing link tagged with a UTM referrer.
 *
 * Play reads the `referrer` value of the store link and exposes utm_source and
 * utm_campaign in the acquisition reports under "Ads and referrals". It is the
 * only channel attribution available without shipping the Install Referrer
 * SDK, and Play requires the value to be URL encoded once.
 */
export function buildPlayStoreUrl(campaign: StoreCampaign): string {
  const referrer = new URLSearchParams({
    utm_source: campaign.source,
    utm_medium: campaign.medium,
    utm_campaign: campaign.campaign,
  }).toString();

  return `${LISTING_URL}&referrer=${encodeURIComponent(referrer)}`;
}
